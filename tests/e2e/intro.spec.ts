import { expect, test, type Page } from "@playwright/test";

const INTRO_KEY = "geardrop_intro_seen_v1";

async function clearIntroPreference(page: Page) {
  await page.addInitScript((key) => {
    const marker = `${key}_test_initialized`;
    if (window.sessionStorage.getItem(marker) !== null) return;
    window.localStorage.removeItem(key);
    window.sessionStorage.setItem(marker, "true");
  }, INTRO_KEY);
}

async function expectIntro(page: Page) {
  const intro = page.getByTestId("site-intro");
  await expect(intro).toBeVisible();
  await expect(intro.locator("video")).toHaveAttribute("src", "/video/geardrop-intro-desktop.mp4");
  return intro;
}

// The intro overlay is disabled for launch: the homepage must paint immediately, with no
// gate in front of it. The IntroGate component, its video and this spec are kept for a
// future reactivation rather than deleted, so the whole suite is skipped rather than
// removed. Re-enable it together with rendering <IntroGate /> on the homepage again.
test.describe.skip("one-time homepage intro (disabled for launch)", () => {
  test.skip(({ isMobile }) => isMobile, "core lifecycle is covered once on desktop");

  test("first visit shows the intro over the rendered homepage", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");

    await expectIntro(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("refresh after the completed intro does not show it again", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");
    const intro = await expectIntro(page);

    await intro.locator("video").dispatchEvent("ended");
    await expect(intro).toHaveCount(0);
    await page.reload();

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
  });

  test("refresh after skipping the intro does not show it again", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Salta intro e apri il sito" }).click();
    await expect(page.getByTestId("site-intro")).toHaveCount(0);
    await page.reload();

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
  });

  test("an existing localStorage preference suppresses the intro", async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, "true"), INTRO_KEY);
    await page.goto("/");

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
  });

  test("video completion saves the preference and reveals the homepage", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");
    const intro = await expectIntro(page);

    await intro.locator("video").dispatchEvent("ended");

    await expect(intro).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), INTRO_KEY)).toBe("true");
  });

  test("SALTA INTRO has a touch-safe target and dismisses the overlay", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");
    const intro = await expectIntro(page);
    const button = page.getByRole("button", { name: "Salta intro e apri il sito" });

    await expect(button).toHaveText("SALTA INTRO");
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await button.click();

    await expect(intro).toHaveClass(/exiting/);
    await expect(page.getByTestId("site-intro")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  });

  test("keyboard focus stays on the only intro control", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");
    const button = page.getByRole("button", { name: "Salta intro e apri il sito" });

    await expect(button).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(button).toBeFocused();
  });

  test("Escape dismisses the intro", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");
    await expectIntro(page);

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
  });

  test("a video error opens the site immediately", async ({ page }) => {
    await clearIntroPreference(page);
    await page.goto("/");
    const intro = await expectIntro(page);

    await intro.locator("video").dispatchEvent("error");

    await expect(intro).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("blocked autoplay never traps the visitor", async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key);
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
    }, INTRO_KEY);
    await page.goto("/");

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("the 12 second safety timeout removes a stalled video", async ({ page }) => {
    await clearIntroPreference(page);
    await page.clock.install();
    await page.goto("/");
    await expectIntro(page);

    await page.clock.fastForward(12_001);

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
  });

  test("reduced motion skips playback and still saves the preference", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await clearIntroPreference(page);
    await page.goto("/");

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), INTRO_KEY)).toBe("true");
  });

  test("unavailable localStorage fails open", async ({ page }) => {
    await page.addInitScript((key) => {
      const read = Storage.prototype.getItem;
      const write = Storage.prototype.setItem;
      Storage.prototype.getItem = function getItem(candidate) {
        if (candidate === key) throw new DOMException("Storage unavailable", "SecurityError");
        return read.call(this, candidate);
      };
      Storage.prototype.setItem = function setItem(candidate, value) {
        if (candidate === key) throw new DOMException("Storage unavailable", "SecurityError");
        return write.call(this, candidate, value);
      };
    }, INTRO_KEY);
    await page.goto("/");

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
  });

  test("the development replay override stays disabled in production", async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, "true"), INTRO_KEY);
    await page.goto("/?replayIntro=1");

    await expect(page.getByTestId("site-intro")).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), INTRO_KEY)).toBe("true");
  });
});

test.skip("internal storefront routes never mount the intro", async ({ page }) => {
  await clearIntroPreference(page);
  await page.goto("/negozio");

  await expect(page.getByTestId("site-intro")).toHaveCount(0);
});

test.skip("admin routes never mount the intro", async ({ page }) => {
  await clearIntroPreference(page);
  const loginResponse = await page.goto("/admin/login");

  if (process.env["NEXT_PUBLIC_SUPABASE_URL"]) expect(loginResponse?.status()).toBeLessThan(500);
  await expect(page.getByTestId("site-intro")).toHaveCount(0);

  const adminResponse = await page.goto("/admin");
  if (process.env["NEXT_PUBLIC_SUPABASE_URL"]) expect(adminResponse?.status()).toBeLessThan(500);
  await expect(page.getByTestId("site-intro")).toHaveCount(0);
});

test.skip("mobile intro locks vertical scroll without horizontal overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only layout check");
  await clearIntroPreference(page);
  await page.goto("/");
  await expectIntro(page);

  const state = await page.evaluate(() => ({
    bodyOverflow: getComputedStyle(document.body).overflow,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    objectFit: getComputedStyle(document.querySelector("video")!).objectFit,
  }));

  expect(state.bodyOverflow).toBe("hidden");
  expect(state.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(state.objectFit).toBe("contain");
  const button = page.getByRole("button", { name: "Salta intro e apri il sito" });
  await expect(button).toBeFocused();
  const buttonBox = await button.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
});

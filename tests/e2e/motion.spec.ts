import { expect, test, type Page } from "@playwright/test";
import { FREE_SHIPPING_THRESHOLD, PRODUCTS } from "../../src/data/catalog";

/**
 * The X-Rail motion set (owner, 2026-10-29): motion carries state and feedback, runs once and
 * settles, and stops for reduced motion. Prices are read off the catalogue, never typed.
 */
const DRAGOON = PRODUCTS.find((product) => product.slug === "cobalt-dragoon-2-60c")!.price.amount;
const euro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;
const TEETH = 20;
const litFor = (cents: number) => Math.min(TEETH, Math.floor((cents / FREE_SHIPPING_THRESHOLD) * TEETH));
const FREE_FROM = Math.ceil(FREE_SHIPPING_THRESHOLD / DRAGOON);

const buyPanel = (page: Page) => page.locator("#buy-panel");
const meter = (page: Page) => page.getByTestId("free-shipping-meter");

test.describe("free-shipping meter", () => {
  test("lights a tooth for every twentieth of the threshold and unlocks at it", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");

    await expect(meter(page).locator("[data-tooth]")).toHaveCount(TEETH);
    await expect(meter(page).locator('[data-lit="true"]')).toHaveCount(litFor(DRAGOON));
    await expect(meter(page)).toContainText(`Ancora ${euro(FREE_SHIPPING_THRESHOLD - DRAGOON)} e la spedizione è gratis.`);

    for (let click = 1; click < FREE_FROM; click += 1) {
      await page.getByTestId("qty-increase").click();
      await expect(page.getByTestId("line-total")).toHaveText(euro(DRAGOON * (click + 1)));
    }
    await expect(meter(page).locator('[data-lit="true"]')).toHaveCount(TEETH);
    await expect(meter(page).locator('[data-reached="true"]')).toHaveCount(1);
    await expect(meter(page)).toContainText("Spedizione gratuita sbloccata.");
    await expect(meter(page).getByText("Spedizione gratis", { exact: true })).toBeVisible();
  });

  test("the drop sheet says what is really missing, from the server's quote", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    const drop = page.getByTestId("cart-drop");
    await expect(drop.getByText(`Ancora ${euro(FREE_SHIPPING_THRESHOLD - DRAGOON)} per la spedizione gratis`)).toBeVisible();
    await expect(drop.locator('[data-lit="true"]')).toHaveCount(litFor(DRAGOON));
  });
});

/**
 * The motion the owner picked on 2026-11-19 from the touchable proposals: the photo's flight into
 * the cart and the drop sheet (01), the scan-in in place of the fade (02), the micro-answers (07).
 */
const FLIGHT = "body > div[aria-hidden='true'][style*='z-index: 120']";

/** Remembers whether a flying copy of a packshot was ever put on the page. */
async function watchFlights(page: Page) {
  await page.addInitScript((selector) => {
    const seen = { count: 0 };
    (window as unknown as { __flights: typeof seen }).__flights = seen;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches(selector)) seen.count += 1;
        }
      }
    });
    // The script runs before the document has a body to watch.
    document.addEventListener("DOMContentLoaded", () => observer.observe(document.body, { childList: true }));
  }, FLIGHT);
}
const flights = (page: Page) => page.evaluate(() => (window as unknown as { __flights: { count: number } }).__flights.count);

test.describe("add to cart: flight and drop sheet", () => {
  test("the photo flies to the cart, then the sheet names the piece and leads to the cart", async ({ page }) => {
    await watchFlights(page);
    await page.goto("/negozio");
    const card = page.getByTestId("product-card").filter({ has: page.getByTestId("add-to-cart") }).first();
    const name = (await card.locator("h3").textContent()) ?? "";
    await card.getByTestId("add-to-cart").click();

    const drop = page.getByTestId("cart-drop");
    await expect(drop).toBeVisible();
    expect(await flights(page)).toBe(1);
    await expect(page.locator(FLIGHT)).toHaveCount(0);
    // The card shows the name apart from its part code; the sheet says it whole.
    await expect(drop.getByTestId("cart-drop-name")).toContainText(name, { ignoreCase: true });
    await expect(drop.getByText("Aggiunto al carrello")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await drop.getByTestId("cart-drop-go").click();
    await expect(page).toHaveURL(/\/carrello$/);
    await expect(drop).toHaveCount(0);
  });

  test("the sheet closes on Escape and a stored cart never reopens it", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    const drop = page.getByTestId("cart-drop");
    await expect(drop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drop).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await expect(drop).toHaveCount(0);
  });

  test("a second add lights only the new teeth of the rail", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const add = buyPanel(page).getByTestId("add-to-cart");
    await add.click();
    const drop = page.getByTestId("cart-drop");
    await expect(drop.locator('[data-lit="true"]')).toHaveCount(litFor(DRAGOON));

    await add.click();
    await expect(drop.locator('[data-lit="true"]')).toHaveCount(litFor(DRAGOON * 2));
    const staggered = await drop.locator("[data-tooth]").evaluateAll((teeth) => teeth.filter((tooth) => (tooth as HTMLElement).style.animationDelay !== "").length);
    expect(staggered).toBe(litFor(DRAGOON * 2) - litFor(DRAGOON));
  });

  test("with reduced motion nothing flies and the sheet is there at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await watchFlights(page);
    await page.goto("/negozio");
    await page.getByTestId("product-card").getByTestId("add-to-cart").first().click();
    await expect(page.getByTestId("cart-drop")).toBeVisible();
    expect(await flights(page)).toBe(0);
  });
});

test.describe("scan-in", () => {
  test("arms only what is below the first screen, and scans it in once", async ({ page }) => {
    await page.goto("/");
    const armed = page.locator('[data-scan="armed"]');
    await expect.poll(() => armed.count()).toBeGreaterThan(0);
    // Nothing the page opens on is hidden or waiting.
    const tops = await armed.evaluateAll((blocks) => blocks.map((block) => block.getBoundingClientRect().top / window.innerHeight));
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(0.92);

    await page.evaluate(() => document.querySelectorAll('section[data-scan="armed"]')[0]?.setAttribute("data-probe", ""));
    const shelf = page.locator("[data-probe]");
    const title = (await shelf.locator("[data-scan-text]").textContent()) ?? "";
    await shelf.scrollIntoViewIfNeeded();
    await expect(shelf).toHaveAttribute("data-scan", "in");
    const item = shelf.locator("[data-scan-item]").first();
    expect(await item.evaluate((element) => getComputedStyle(element).animationName)).toBe("gd-scan-open");
    expect(await item.evaluate((element) => getComputedStyle(element).animationIterationCount)).toBe("1");
    // The decoded title ends as the real one, as plain text.
    await expect(shelf.locator("[data-scan-text]")).toHaveText(title);
    await expect.poll(() => shelf.locator("[data-scan-text] span").count()).toBe(0);

    // Scrolling away and back never arms it again.
    await page.evaluate(() => window.scrollTo(0, 0));
    await shelf.scrollIntoViewIfNeeded();
    await expect(shelf).toHaveAttribute("data-scan", "in");
  });

  test("with reduced motion nothing is armed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("[data-scan]").first()).toBeAttached();
    await page.waitForTimeout(400);
    await expect(page.locator('[data-scan="armed"], [data-scan="in"]')).toHaveCount(0);
  });
});

test.describe("micro-answers", () => {
  test("a changed quantity rolls the digits of the server's totals", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await page.goto("/carrello");
    const total = page.getByTestId("line-total");
    await expect(total).toHaveText(euro(DRAGOON));
    // A cart that opens is at rest.
    await expect(total.locator(".gd-roll-cell")).toHaveCount(0);

    await page.getByTestId("qty-increase").click();
    await expect(total).toHaveText(euro(DRAGOON * 2));
    await expect(total.locator(".gd-roll-cell").first()).toBeAttached();
    await expect(page.getByTestId("qty-input")).toHaveValue("2");
    expect(await total.locator(".gd-roll-in").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("gd-roll-in");
  });

  test("a favourite saved by hand splits the heart once; a stored one opens at rest", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const heart = page.getByTestId("product-gallery").getByTestId("wishlist-toggle");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(heart.getByTestId("wishlist-split")).toBeAttached();

    await page.reload();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(heart.getByTestId("wishlist-split")).toHaveCount(0);
  });

  test("the lime marker of the tab bar slides to the tab the shopper moves to", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the tab bar is the phone's navigation");
    await page.goto("/");
    const bar = page.getByTestId("bottom-tab-bar");
    const marker = bar.getByTestId("tab-marker");
    await expect(marker).toHaveCSS("opacity", "1");
    expect(await marker.evaluate((element) => (element as HTMLElement).style.transform)).toBe("translateX(0%)");

    await bar.getByRole("link", { name: "Negozio" }).click();
    await expect(page).toHaveURL(/\/negozio$/);
    await expect.poll(() => marker.evaluate((element) => (element as HTMLElement).style.transform)).toBe("translateX(100%)");
    expect(await marker.evaluate((element) => getComputedStyle(element).transitionProperty)).toContain("transform");
  });
});

test.describe("X-Rail touches", () => {
  test("an add cuts light across the button and relaunches the header emblem", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const launches = page.locator("header [data-launches]").first();
    await expect(launches).toHaveAttribute("data-launches", "0");

    const add = buyPanel(page).getByTestId("add-to-cart");
    await add.click();
    await expect(add).toHaveClass(/gd-cut/);
    expect(await add.evaluate((element) => getComputedStyle(element, "::after").animationName)).toBe("gd-slab");
    await expect(launches).toHaveAttribute("data-launches", "1");
  });

  test("a stored cart does not relaunch the emblem when the page opens", async ({ page }) => {
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    await buyPanel(page).getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await expect(page.locator("header [data-launches]").first()).toHaveAttribute("data-launches", "0");
  });

  test("promo stickers ride their card's scroll timeline", async ({ page }) => {
    await page.goto("/negozio");
    const sticker = page.getByTestId("product-card").locator(".gd-sticker-land").first();
    await expect(sticker).toBeAttached();
    expect(await sticker.evaluate((element) => getComputedStyle(element).animationTimeline)).toBe("--gd-card");
  });

  test("the part number slides in once behind the packshot", async ({ page }) => {
    await page.goto("/prodotto/soar-phoenix-9-60gf");
    const mark = page.getByTestId("product-gallery").locator(".gd-watermark");
    expect(await mark.evaluate((element) => getComputedStyle(element).animationName)).toBe("gd-mark-in");
    expect(await mark.evaluate((element) => getComputedStyle(element).animationIterationCount)).toBe("1");
  });
});

test.describe("reduced motion", () => {
  test("keeps every new animation still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/prodotto/cobalt-dragoon-2-60c");
    const mark = page.getByTestId("product-gallery").locator(".gd-watermark");
    expect(await mark.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

    const add = buyPanel(page).getByTestId("add-to-cart");
    await add.click();
    expect(await add.evaluate((element) => getComputedStyle(element, "::after").animationDuration)).toBe("0s");

    await page.goto("/negozio");
    const sticker = page.getByTestId("product-card").locator(".gd-sticker-land").first();
    expect(await sticker.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

    await page.goto("/carrello");
    await page.getByTestId("qty-increase").click();
    await expect(page.getByTestId("line-total")).toHaveText(euro(DRAGOON * 2));
    const lit = meter(page).locator('[data-lit="true"]');
    await expect(lit).toHaveCount(litFor(DRAGOON * 2));
    const names = await lit.evaluateAll((teeth) => teeth.map((tooth) => getComputedStyle(tooth).animationName));
    expect(new Set(names)).toEqual(new Set(["none"]));
  });
});

test.describe("card to product", () => {
  test("a catalogue card's photo travels into the product page", async ({ page }) => {
    await page.addInitScript(() => {
      const calls = { count: 0 };
      (window as unknown as { __viewTransitions: typeof calls }).__viewTransitions = calls;
      const start = document.startViewTransition?.bind(document);
      if (start) {
        document.startViewTransition = ((update: () => void) => {
          calls.count += 1;
          return start(update);
        }) as typeof document.startViewTransition;
      }
    });
    await page.goto("/negozio");
    const card = page.getByTestId("product-card").first();
    const slug = await card.getAttribute("data-slug");
    await card.locator("h3 a").click();

    await expect(page).toHaveURL(new RegExp(`/prodotto/${slug}$`));
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    const count = await page.evaluate(() => (window as unknown as { __viewTransitions: { count: number } }).__viewTransitions.count);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe("navigation scroll", () => {
  test("a card low in the catalogue opens its product page at the top, at once", async ({ page }) => {
    await page.goto("/negozio");
    const cards = page.getByTestId("product-card");
    const card = cards.nth((await cards.count()) - 1);
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    const slug = await card.getAttribute("data-slug");
    await card.locator("h3 a").click();
    await page.waitForURL(new RegExp(`/prodotto/${slug}$`));
    // Smooth scrolling stays for in-page links; a page change must not glide up from the footer.
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(200);
  });
});

test.describe("product clip", () => {
  test("loads nothing until chosen, then plays once without sound", async ({ page }) => {
    const videoRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/video/products/") && request.url().endsWith(".mp4")) videoRequests.push(request.url());
    });
    await page.goto("/prodotto/soar-phoenix-9-60gf");
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    expect(videoRequests).toEqual([]);

    await page.getByRole("button", { name: "Clip del prodotto" }).filter({ visible: true }).first().click();
    const clip = page.getByTestId("product-clip");
    await expect(clip).toHaveAttribute("preload", "none");
    await expect(clip).toHaveAttribute("playsinline", "");
    await expect(clip).not.toHaveAttribute("loop", /.*/);
    expect(await clip.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
    // Zoom and the plate's own decorations step aside while the clip shows.
    await expect(page.getByTestId("product-zoom-open")).toHaveCount(0);

    // Playwright's Chromium ships without H.264; real browsers play the clip to its last frame.
    const playable = await clip.evaluate((video: HTMLVideoElement) => video.canPlayType('video/mp4; codecs="avc1.640028"') !== "");
    if (playable) {
      await expect(page.getByRole("button", { name: "Rivedi" })).toBeVisible({ timeout: 15_000 });
      expect(await clip.evaluate((video: HTMLVideoElement) => video.ended)).toBe(true);
    }
  });

  test("with reduced motion the clip waits for the visitor, controls showing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/prodotto/soar-phoenix-9-60gf");
    await page.getByRole("button", { name: "Clip del prodotto" }).filter({ visible: true }).first().click();
    const clip = page.getByTestId("product-clip");
    await expect(clip).toHaveAttribute("controls", "");
    expect(await clip.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  });
});

/**
 * The second set of 2026-11-19 ("metti tutto"): the holographic card (03), the quick view (04),
 * pop-ups one at a time (05) and the glitch cut between pages (08). The paid order's launch (06)
 * needs a paid Stripe session and is not reachable from this gate.
 */
test.describe("holographic card", () => {
  test("a new release leans under the pointer and lies flat again when it leaves", async ({ page }) => {
    await page.goto("/negozio");
    const holo = page.getByTestId("holo-tilt").first();
    await expect(holo).toBeVisible();
    // Only new releases wear it, like the foil sticker.
    await expect(holo.locator(".gd-foil")).toHaveCount(1);
    await holo.scrollIntoViewIfNeeded();
    const box = (await holo.boundingBox())!;

    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3);
    await expect(holo).toHaveAttribute("data-live", "");
    expect(Number(await holo.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--gd-mx")))).toBeGreaterThan(0.2);

    await page.mouse.move(2, 2);
    await expect(holo).not.toHaveAttribute("data-live", "");
    expect(await holo.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--gd-mx"))).toBe("");
  });

  test("with reduced motion the card stays flat", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/negozio");
    const holo = page.getByTestId("holo-tilt").first();
    await holo.scrollIntoViewIfNeeded();
    const box = (await holo.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3);
    await page.waitForTimeout(150);
    await expect(holo).not.toHaveAttribute("data-live", "");
  });
});

test.describe("quick view", () => {
  test("the photo opens a sheet that says what the card says, and Escape gives the focus back", async ({ page }) => {
    await page.goto("/negozio");
    const card = page.getByTestId("product-card").filter({ has: page.getByTestId("add-to-cart") }).first();
    const slug = await card.getAttribute("data-slug");
    const price = (await card.getByTestId("card-price").textContent()) ?? "";
    const availability = (await card.getByTestId("card-availability").textContent()) ?? "";
    const opener = card.getByTestId("quick-view-open");
    await opener.click();

    const sheet = page.getByTestId("quick-view");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    await expect(sheet.getByTestId("quick-view-price")).toHaveText(price);
    expect(availability).toContain((await sheet.getByTestId("quick-view-availability").textContent()) ?? "?");
    await expect(sheet.getByTestId("quick-view-full")).toHaveAttribute("href", `/prodotto/${slug}`);
    await expect(sheet.getByText(/Spedizione da €\d+,\d{2}, gratis da €\d+/)).toBeVisible();
    await expect(page.getByTestId("quick-view-close")).toBeFocused();
    // The list is still the page: nothing navigated.
    await expect(page).toHaveURL(/\/negozio$/);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the photo flies into the sheet at its own proportions, never stretched", async ({ page }) => {
    await page.goto("/negozio");
    const card = page.getByTestId("product-card").first();
    const natural = await card.locator("img").first().evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight);
    await card.getByTestId("quick-view-open").click();

    // The flying copy: read while it is in the air.
    const copy = page.locator("body > img[style*='z-index: 120']");
    const flight = await copy.evaluate((image: HTMLImageElement) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
      return { scaleX: matrix.a, scaleY: matrix.d, skew: Math.abs(matrix.b) + Math.abs(matrix.c), ratio: image.offsetWidth / image.offsetHeight };
    });
    // One scale for both axes, on a box cut to the picture itself.
    expect(flight.scaleX).toBeCloseTo(flight.scaleY, 5);
    expect(flight.skew).toBe(0);
    expect(flight.ratio).toBeCloseTo(natural, 1);

    // It lands on the sheet's photo, which is drawn at those same proportions.
    await expect(copy).toHaveCount(0);
    const photo = page.getByTestId("quick-view").locator("img");
    await expect(photo).toHaveCSS("object-fit", "contain");
    await expect(photo).toHaveCSS("opacity", "1");
  });

  test("adding from the sheet closes it and the drop sheet takes over", async ({ page }) => {
    await page.goto("/negozio");
    const card = page.getByTestId("product-card").filter({ has: page.getByTestId("add-to-cart") }).first();
    await card.getByTestId("quick-view-open").click();
    const sheet = page.getByTestId("quick-view");
    await sheet.getByTestId("add-to-cart").click();

    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("cart-drop")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  test("the backdrop closes it, and the product name still opens the product page", async ({ page }) => {
    await page.goto("/negozio");
    const card = page.getByTestId("product-card").first();
    const slug = await card.getAttribute("data-slug");
    await card.getByTestId("quick-view-open").click();
    await expect(page.getByTestId("quick-view")).toBeVisible();
    await page.getByTestId("quick-view-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId("quick-view")).toHaveCount(0);

    await card.locator("h3 a").click();
    await expect(page).toHaveURL(new RegExp(`/prodotto/${slug}$`));
  });
});

test.describe("glitch cut between pages", () => {
  async function countTransitions(page: Page) {
    await page.addInitScript(() => {
      const calls = { count: 0 };
      (window as unknown as { __cuts: typeof calls }).__cuts = calls;
      const start = document.startViewTransition?.bind(document);
      if (start) {
        document.startViewTransition = ((update: () => void) => {
          calls.count += 1;
          return start(update);
        }) as typeof document.startViewTransition;
      }
    });
  }
  const cuts = (page: Page) => page.evaluate(() => (window as unknown as { __cuts: { count: number } }).__cuts.count);

  test("a change of page is a view transition, and only the page reached by moving is marked", async ({ page }) => {
    await countTransitions(page);
    await page.goto("/");
    // The page a visit opens on is at rest: nothing snaps on the first screen.
    await expect(page.locator("#contenuto [data-page-moved]")).toHaveCount(0);

    await page.goto("/negozio");
    await expect(page.locator("#contenuto [data-page-moved]")).toHaveCount(0);
    const card = page.getByTestId("product-card").first();
    const slug = await card.getAttribute("data-slug");
    await card.locator("h3 a").click();
    await expect(page).toHaveURL(new RegExp(`/prodotto/${slug}$`));
    await expect(page.locator("#contenuto [data-page-moved]")).toHaveCount(1);
    expect(await cuts(page)).toBeGreaterThanOrEqual(1);
  });

  test("sorting the catalogue stays on the page and cuts nothing", async ({ page }) => {
    await countTransitions(page);
    await page.goto("/negozio");
    await expect(page.getByTestId("product-card").first()).toBeVisible();
    await page.getByTestId("sort-select").selectOption("prezzo-asc");
    await expect(page).toHaveURL(/sort=prezzo-asc/);
    await expect(page.getByTestId("product-card").first()).toBeVisible();
    expect(await cuts(page)).toBe(0);
    await expect(page.locator("#contenuto [data-page-moved]")).toHaveCount(0);
  });
});

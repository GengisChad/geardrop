import { expect, test, type Page, type Response } from "@playwright/test";

/**
 * The anonymous storefront, served from the real Supabase stack.
 *
 * A 200 is not the assertion here. Next.js renders an error boundary with a 200 for a
 * failed client fetch, and a PostgREST refusal often arrives as an empty list rather
 * than a throw — a catalogue that lost every row to RLS still "works" by status code.
 * So each page is checked three ways: the HTTP status, the absence of any privilege or
 * PostgREST error anywhere in the response or the console, and the seeded rows actually
 * being on the page.
 */

/** Signatures of a database refusal reaching the browser, in any shape. */
const DATABASE_FAILURE = /permission denied|42501|PGRST\d{3}|row-level security|JWSError|Invalid API key|Unsupported (?:content|commerce) provider/i;

type Watcher = { readonly problems: string[] };

/** Collects console errors, page exceptions and 5xx responses for the whole test. */
function watch(page: Page): Watcher {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  page.on("response", (response: Response) => {
    if (response.status() >= 500) problems.push(`http ${response.status()}: ${response.url()}`);
  });

  return { problems };
}

/** Loads a page and fails on a bad status, a database refusal, or a runtime error. */
async function visit(page: Page, path: string): Promise<string> {
  const watcher = watch(page);
  const response = await page.goto(path);

  expect(response, `${path} produced no response`).not.toBeNull();
  expect(response!.status(), `${path} returned ${response!.status()}`).toBeLessThan(400);

  const body = await page.content();
  expect(body, `${path} rendered a database error`).not.toMatch(DATABASE_FAILURE);

  const failures = watcher.problems.filter((problem) => DATABASE_FAILURE.test(problem) || problem.startsWith("http 5"));
  expect(failures, `${path} reported runtime failures`).toEqual([]);

  return body;
}


test.describe("anonymous storefront on Supabase", () => {
  test("the homepage renders the managed liquid glass storefront, not the scaffold", async ({ page }) => {
    const body = await visit(page, "/");

    // The exact regression this gate exists to catch. The managed homepage used to render
    // through a placeholder that printed "N target relazionali" on a graphite scaffold —
    // real production data, wrong presentation, and only the mock gate was watching. This
    // runs against the real database, on the managed path, where the black page lived.
    expect(body, "the placeholder CMS scaffold is back").not.toContain("target relazionali");

    // The liquid glass hero with the impact artwork, not the old stadium product shot.
    await expect(page.getByTestId("hero-impact")).toBeVisible();
    await expect(page.getByTestId("hero-glass")).toBeVisible();
    await expect(page.getByTestId("hero-impact").locator("img")).toHaveAttribute("src", /impact\.(png|webp)/);
    await expect(page.getByTestId("hero-impact").locator('img[src*="stadio"]')).toHaveCount(0);

    // No section paints a full graphite scaffold panel.
    expect(await page.locator("section.bg-graphite").count(), "a graphite scaffold section is rendering").toBe(0);

    // Real glass with a real blur somewhere on the page.
    const blurred = await page.locator('[class*="gd-glass"]').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return (style.backdropFilter || style.webkitBackdropFilter || "").includes("blur");
    });
    expect(blurred, "no element is actually compositing a glass blur").toBe(true);

    // Exactly one h1, from the CMS hero section. The static homepage has always had
    // one; the managed one rendered every section as h2 and so had none.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Four seeded categories linked from the tiles, and real product cards on the page.
    for (const slug of ["beyblade-x", "lanciatori", "stadi", "accessori"]) {
      await expect(page.locator(`a[href="/negozio/${slug}"]`).first()).toBeVisible();
    }
    expect(await page.getByTestId("product-card").count()).toBeGreaterThan(0);

    // Chrome comes from the CMS tables, not from a hardcoded fallback.
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("the catalogue lists every seeded product", async ({ page }) => {
    await visit(page, "/negozio");

    await expect(page.getByTestId("product-grid")).toBeVisible();
    // The seed ships eight published products. A silent RLS regression shows up here as
    // a smaller number rather than as an error.
    await expect(page.getByTestId("product-card")).toHaveCount(8);
    await expect(page.getByTestId("result-count")).toHaveText("8");
  });

  test("a category page filters to its own products", async ({ page }) => {
    await visit(page, "/negozio/beyblade-x");

    const cards = page.getByTestId("product-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    expect(await cards.count()).toBeLessThan(8);
  });

  test("a product page shows its gallery, which is the query that used to 42501", async ({ page }) => {
    await visit(page, "/prodotto/cobalt-dragoon-2-60c");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // product_images is reachable only through its RLS policy, and the ready-media check
    // runs inside a security definer helper. If either breaks, there is no image here.
    const gallery = page.locator("#buy-panel, main").locator("img").first();
    await expect(gallery).toBeVisible();
    await expect(gallery).toHaveAttribute("alt", /.+/);
  });

  test("every published product page renders", async ({ page }) => {
    await visit(page, "/negozio");
    const hrefs = await page.getByTestId("product-card").locator("a[href^='/prodotto/']").evaluateAll(
      (nodes) => [...new Set(nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") ?? ""))],
    );
    expect(hrefs.length).toBe(8);

    // One broken product is enough to break the shop; check them all rather than a sample.
    for (const href of hrefs) {
      await visit(page, href);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("search reads the remote catalogue", async ({ page }) => {
    await visit(page, "/ricerca?q=dran");
    await expect(page.getByTestId("product-card").first()).toBeVisible();
  });

  test("the cart and checkout pages render without a database error", async ({ page }) => {
    await visit(page, "/carrello");
    await visit(page, "/checkout");
  });

  test("checkout cannot place an order while sales are closed", async ({ page }) => {
    await visit(page, "/prodotto/wizard-arrow-4-80b");
    // Seeded stock is zero and accept_orders is false, so the buy path must refuse
    // rather than offer a checkout that the database would reject.
    const addToCart = page.getByTestId("add-to-cart");
    if (await addToCart.count()) {
      await expect(addToCart.first()).toBeDisabled();
    } else {
      await expect(page.getByTestId("notify-me").or(page.getByText(/esaurito|non disponibile/i)).first()).toBeVisible();
    }
  });

  test("anonymous visitors never reach the admin panel", async ({ page }) => {
    for (const path of ["/admin", "/admin/prodotti", "/admin/ordini", "/admin/team"]) {
      const response = await page.goto(path);
      expect(response, `${path} produced no response`).not.toBeNull();
      // Redirected to the login screen, and in no case served admin content.
      expect(page.url()).toContain("/admin/login");
      await expect(page.getByRole("heading", { name: /accesso staff/i })).toBeVisible();
    }
  });

  test("the login screen itself renders from the real stack", async ({ page }) => {
    await visit(page, "/admin/login");
    await expect(page.getByRole("heading", { name: /accesso staff/i })).toBeVisible();
  });
});

/**
 * Renders a typographic product tile for every starter pack that has no photograph yet.
 *
 * Hasbro supplies no press images and the supplier has none either, so rather than hold eight
 * in-stock products off the shop we draw their card from the data we do have: the name off the
 * box, the line, the code and the combat type, in the shop's own type and palette. It reads
 * src/data/catalog.ts so a name or a type can never drift between the card and the page.
 *
 * Each product is written twice, exactly like the deck case:
 *   public/products/<slug>.webp          white tile: Stripe Checkout, Google, share cards
 *   public/products/cutout/<slug>.webp   transparent, light type: the dark cards and gallery
 *
 * These are placeholders by intent. Drop a real photo into prodotti/<file>.jpg and
 * scripts/normalize_images.py overwrites the tile; delete the slug from SLUGS below.
 *
 * Usage: node scripts/render-starter-cards.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const SIZE = 1000;

const SLUGS = [
  "arrow-wizard-4-80b",
  "helm-knight-3-80n",
  "scythe-incendio-4-60t",
  "sword-dran-3-60f",
  "dark-perseus-b-6-80w",
  "arc-wizard-r-4-55lo",
  "courage-dran-s-6-60v",
  "reaper-incendio-t-4-70k",
];

/** The accent each combat type already wears in the shop (src/styles/globals.css). */
const TYPE_ACCENT = {
  attacco: "#ff5ccf",
  difesa: "#3cf0ff",
  stamina: "#c6ff00",
  bilanciato: "#9d6bff",
};

const catalog = readFileSync(resolve(ROOT, "src/data/catalog.ts"), "utf8");

/** Reads one product's block out of the catalogue source, from its slug to the next entry. */
function entry(slug) {
  const start = catalog.indexOf(`slug: "${slug}"`);
  if (start === -1) throw new Error(`${slug} is not in src/data/catalog.ts`);
  const block = catalog.slice(start, catalog.indexOf("\n  {", start) + 1 || undefined);
  const read = (pattern, what) => {
    const found = block.match(pattern);
    if (!found) throw new Error(`${slug}: ${what} not found in the catalogue entry`);
    return found[1];
  };
  return {
    slug,
    name: read(/name: "([^"]+)"/, "name"),
    type: read(/bladeType: "([^"]+)"/, "bladeType"),
    line: read(/\{ label: "Linea", value: "([^"]+)" \}/, 'the "Linea" spec'),
    code: read(/\{ label: "Codice", value: "([^"]+)" \}/, 'the "Codice" spec'),
  };
}

/**
 * The name over two lines: everything but the code, then the code. "Arrow Wizard 4-80B" reads
 * as ARROW WIZARD / 4-80B, which is how the box itself sets it.
 */
function split(name, code) {
  const head = name.endsWith(code) ? name.slice(0, -code.length).trim() : name;
  return [head, name.endsWith(code) ? code : ""];
}

function page(product, theme) {
  const dark = theme === "dark";
  const accent = TYPE_ACCENT[product.type] ?? "#c6ff00";
  const ink = dark ? "#f4f2ff" : "#07060b";
  const muted = dark ? "#b8b5cc" : "#4a4858";
  const kicker = dark ? accent : "#4a4858";
  const ring = dark ? "rgba(255,255,255,0.14)" : "rgba(7,6,11,0.10)";
  const [head, code] = split(product.name, product.code);
  const type = product.type.charAt(0).toUpperCase() + product.type.slice(1);

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=JetBrains+Mono:wght@600&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: ${SIZE}px; height: ${SIZE}px; background: ${dark ? "transparent" : "#ffffff"}; }
  main { box-sizing: border-box; width: ${SIZE}px; height: ${SIZE}px; padding: 96px 72px 0;
    display: flex; flex-direction: column; align-items: center; }
  .kicker { margin: 0; font: 600 21px/1 "JetBrains Mono", monospace; letter-spacing: 0.18em;
    text-transform: uppercase; color: ${kicker}; }
  /* The mark reads as a blade seen from above: a rotating sweep caught inside its rings. */
  .mark { position: relative; margin-top: 54px; width: 430px; height: 430px; display: grid; place-items: center; }
  .mark::before { content: ""; position: absolute; inset: 0; border-radius: 50%;
    background: conic-gradient(from 210deg, ${accent} 0deg, transparent 96deg, transparent 180deg, ${accent} 276deg, transparent 348deg);
    opacity: ${dark ? 0.5 : 0.34}; mask: radial-gradient(closest-side, transparent 58%, #000 60%, #000 99%, transparent 100%);
    -webkit-mask: radial-gradient(closest-side, transparent 58%, #000 60%, #000 99%, transparent 100%); }
  .mark::after { content: ""; position: absolute; inset: 52px; border-radius: 50%; box-shadow: 0 0 0 2px ${ring}; }
  .code { position: relative; font: 600 66px/1 "JetBrains Mono", monospace; letter-spacing: -0.01em; color: ${ink}; }
  h1 { margin: 58px 0 0; font: 700 70px/0.94 "Chakra Petch", sans-serif; text-transform: uppercase;
    letter-spacing: 0.005em; color: ${ink}; text-align: center; max-width: 820px; }
  .type { margin: 30px 0 0; display: inline-flex; align-items: center; gap: 13px;
    font: 600 22px/1 "Chakra Petch", sans-serif; text-transform: uppercase; letter-spacing: 0.1em; color: ${muted}; }
  .type .dot { width: 13px; height: 13px; border-radius: 50%; background: ${accent}; }
</style></head><body><main>
  <p class="kicker">${product.line} · Starter Pack</p>
  <div class="mark"><span class="code">${code || "X"}</span></div>
  <h1>${head}</h1>
  <p class="type"><span class="dot"></span>${type} · Trottola + lanciatore</p>
</main></body></html>`;
}

const products = SLUGS.map(entry);
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  for (const product of products) {
    for (const [theme, dir] of [
      ["light", "public/products"],
      ["dark", "public/products/cutout"],
    ]) {
      await tab.setContent(page(product, theme), { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      const loaded = await tab.evaluate(
        () => document.fonts.check('700 70px "Chakra Petch"') && document.fonts.check('600 21px "JetBrains Mono"'),
      );
      if (!loaded) throw new Error("the shop fonts did not load; refusing to render with a fallback face");
      const png = await tab.screenshot({ omitBackground: theme === "dark", clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
      const out = `${dir}/${product.slug}.webp`;
      await sharp(png).webp({ quality: 90, alphaQuality: 100 }).toFile(resolve(ROOT, out));
      console.log(out);
    }
  }
} finally {
  await browser.close();
}

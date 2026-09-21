/**
 * Renders the deck case's one product image: the owner's yellow case, "Scegli il tuo colore"
 * and a swatch for every colour sold (src/data/variant-families.ts). The page is laid out in
 * HTML with the shop's own type (Chakra Petch, JetBrains Mono, from Google Fonts at render time)
 * and photographed by Playwright's Chromium, twice:
 *
 *   public/products/porta-deck.webp          white tile: Stripe Checkout, Google, share cards
 *   public/products/cutout/porta-deck.webp   transparent, light type: the dark cards and gallery
 *
 * Usage: node scripts/render-deck-image.mjs <case.png>   (scripts/cut_deck_cases.py calls it)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const SIZE = 1000;

// The family index is TypeScript; its colours are read straight from the source.
const families = readFileSync(resolve(ROOT, "src/data/variant-families.ts"), "utf8");
const colours = [...families.matchAll(/label: "([^"]+)", swatch: "(#[0-9a-f]{6})"/g)].map(([, label, swatch]) => ({ label, swatch }));
if (colours.length === 0) throw new Error("no colours found in variant-families.ts");

const casePng = process.argv[2];
if (!casePng) throw new Error("usage: node scripts/render-deck-image.mjs <case.png>");
const caseImage = `data:image/png;base64,${readFileSync(casePng).toString("base64")}`;

function page(theme) {
  const dark = theme === "dark";
  const ink = dark ? "#f4f2ff" : "#07060b";
  const muted = dark ? "#b8b5cc" : "#4a4858";
  const kicker = dark ? "#c6ff00" : "#5b7600";
  const ring = dark ? "rgba(255,255,255,0.32)" : "rgba(7,6,11,0.16)";
  const floor = dark ? "rgba(0,0,0,0.55)" : "rgba(7,6,11,0.22)";
  const swatches = colours
    .map(
      ({ label, swatch }) => `
      <li><span class="dot" style="background:${swatch}"></span><span class="name">${label}</span></li>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=JetBrains+Mono:wght@600&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: ${SIZE}px; height: ${SIZE}px; background: ${dark ? "transparent" : "#ffffff"}; }
  main { box-sizing: border-box; width: ${SIZE}px; height: ${SIZE}px; padding: 118px 56px 0; display: flex; flex-direction: column; align-items: center; }
  .kicker { font: 600 22px/1 "JetBrains Mono", monospace; letter-spacing: 0.18em; text-transform: uppercase; color: ${kicker}; margin: 0; }
  .case { position: relative; margin-top: 46px; width: 840px; height: 390px; display: grid; place-items: center; }
  .case img { max-width: 100%; max-height: 100%; position: relative; z-index: 1; filter: saturate(1.08) contrast(1.04); }
  .case::after { content: ""; position: absolute; left: 12%; right: 12%; bottom: -14px; height: 42px; border-radius: 50%;
    background: radial-gradient(closest-side, ${floor}, transparent); }
  h1 { margin: 74px 0 0; font: 700 76px/0.95 "Chakra Petch", sans-serif; text-transform: uppercase; letter-spacing: 0.01em; color: ${ink}; text-align: center; }
  h1 span { background: linear-gradient(100deg, #c6ff00 0%, #3cf0ff 30%, #9d6bff 62%, #ff5ccf 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 0.06em; }
  ${dark ? "" : "h1 span { background: linear-gradient(100deg, #5b7600 0%, #0a8fa3 32%, #6b36e0 64%, #d42f9e 100%); -webkit-background-clip: text; background-clip: text; }"}
  ul { list-style: none; margin: 46px 0 0; padding: 0; display: flex; gap: 22px; }
  li { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 104px; }
  .dot { width: 70px; height: 70px; border-radius: 50%; box-shadow: 0 0 0 3px ${ring}, inset 0 -8px 16px rgba(0,0,0,0.18), inset 0 6px 12px rgba(255,255,255,0.28); }
  .name { font: 600 17px/1.15 "Chakra Petch", sans-serif; text-transform: uppercase; letter-spacing: 0.04em; color: ${muted}; text-align: center; }
</style></head><body><main>
  <p class="kicker">Porta deck · 3 scomparti</p>
  <div class="case"><img src="${caseImage}" alt=""></div>
  <h1>Scegli il tuo <span>colore</span></h1>
  <ul>${swatches}
  </ul>
</main></body></html>`;
}

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  for (const [theme, out] of [
    ["light", "public/products/porta-deck.webp"],
    ["dark", "public/products/cutout/porta-deck.webp"],
  ]) {
    await tab.setContent(page(theme), { waitUntil: "networkidle" });
    await tab.evaluate(() => document.fonts.ready);
    const loaded = await tab.evaluate(() => document.fonts.check('700 76px "Chakra Petch"') && document.fonts.check('600 22px "JetBrains Mono"'));
    if (!loaded) throw new Error("the shop fonts did not load; refusing to render with a fallback face");
    const png = await tab.screenshot({ omitBackground: theme === "dark", clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
    await sharp(png).webp({ quality: 90, alphaQuality: 100 }).toFile(resolve(ROOT, out));
    console.log(out);
  }
} finally {
  await browser.close();
}

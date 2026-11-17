/**
 * Renders the product clips (owner, 2026-10-29): `pnpm clips [slug ...]`.
 *
 * Each clip is an HTML and CSS composition (gallery.html for the product page, reel.html for
 * Instagram and YouTube) that render.mjs plays frame by frame in the preinstalled Playwright
 * Chromium and encodes with ffmpeg. The facts come from the catalogue through clip-data.ts, so a
 * clip never says anything the shop does not: no price, no availability, no "Novità".
 *
 * Gallery clips and their posters go to public/video/products/ and are served by the site.
 * Reels go to out/clips/, which is not committed: post them, do not ship them.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLIP_SPECS, clipData } from "./clip-data";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(import.meta.url);

/** One scratch folder for the run (fonts and data), removed when the run ends. */
const scratch = mkdtempSync(join(tmpdir(), "geardrop-clips-"));

/** The brand faces, copied from their pinned packages under the names render.mjs reads. */
function fontsDir(): string {
  const dir = join(scratch, "fonts");
  mkdirSync(dir);
  const faces = [
    "@fontsource-variable/anybody/files/anybody-latin-standard-normal.woff2",
    "@fontsource-variable/anybody/files/anybody-latin-standard-italic.woff2",
    "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2",
    "@fontsource/chakra-petch/files/chakra-petch-latin-700-italic.woff2",
  ];
  for (const request of faces) copyFileSync(require.resolve(request), join(dir, request.split("/").at(-1)!));
  return dir;
}

function render(template: "gallery" | "reel", data: object, out: string, poster: string, fonts: string): void {
  const file = join(scratch, `${template}.json`);
  writeFileSync(file, JSON.stringify(data));
  mkdirSync(dirname(out), { recursive: true });
  const run = spawnSync(
    process.execPath,
    [join(here, "render.mjs"), "--template", template, "--data", file, "--out", out, "--poster", poster, "--fonts", fonts, "--emblem", join(root, "public/brand/emblem.webp")],
    { stdio: "inherit" },
  );
  if (run.status !== 0) throw new Error(`render.mjs failed for ${out}`);
}

const wanted = new Set(process.argv.slice(2));
const specs = CLIP_SPECS.filter((spec) => wanted.size === 0 || wanted.has(spec.slug));
if (specs.length === 0) throw new Error(`No clip matches ${[...wanted].join(", ")}.`);

try {
  const fonts = fontsDir();
  for (const spec of specs) {
    const facts = clipData(spec);
    const data = { ...facts, cutout: pathToFileURL(join(root, "public", facts.cutout)).href };
    const products = join(root, "public/video/products");
    render("gallery", data, join(products, `${spec.slug}.mp4`), join(products, `${spec.slug}.jpg`), fonts);
    render("reel", data, join(root, "out/clips", `${spec.slug}-reel.mp4`), join(root, "out/clips", `${spec.slug}-reel.jpg`), fonts);
    console.log(`clips: ${spec.slug} done`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

import sharp from "sharp";
import { mkdirSync } from "node:fs";

/**
 * Packshots and cut-outs for the tops sold loose out of the Drop Attack Battle Set, and
 * for the two bundles built around them.
 *
 * Separate from scripts/cutout_products.py because these are not packshots to cut out:
 * the loose tops arrive as bare product renders on white, and the bundle tiles are
 * composed from the cut-outs rather than photographed. Node rather than Python so the
 * whole thing runs from `pnpm assets:tops` on a machine with no Python.
 *
 *   node scripts/build-loose-tops.mjs
 */

const SIZE = 1000;

/** Bare renders on white: trim the white, drop the supplier's disclaimer strip. */
const LOOSE = [
  { slug: "hover-wyvern-3-85n", src: "assets-source/products/hover-wyvern-3-85n.png", cropBottom: 0 },
  // The supplier's render carries a Japanese "image is for illustration" line along the
  // bottom edge, which would read as ours on a product page.
  { slug: "impact-drake-9-60lr", src: "assets-source/products/impact-drake-9-60lr.jpg", cropBottom: 0.07 },
];

/** Two across the top, one centred under them — the shape kit-doppio-starter-deck uses. */
const BUNDLES = [
  { slug: "deck-completo-meta", top: ["shadow-shinobi-1-80mn", "cobalt-dragoon-2-60c"], bottom: "impact-drake-9-60lr" },
  { slug: "trio-starter-arena", top: ["shatter-horus-9-65gb", "hurricane-enlil-is-7-55t"], bottom: "hover-wyvern-3-85n" },
];

mkdirSync("public/products/cutout", { recursive: true });

async function writePair(slug, composite, background) {
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(composite).webp({ quality: 88 }).toFile(`public/products/${slug}.webp`);
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background } })
    .composite(composite).webp({ quality: 90, alphaQuality: 100 }).toFile(`public/products/cutout/${slug}.webp`);
}

for (const job of LOOSE) {
  const meta = await sharp(job.src).metadata();
  const height = Math.round(meta.height * (1 - job.cropBottom));
  const cropped = await sharp(job.src).extract({ left: 0, top: 0, width: meta.width, height }).toBuffer();
  const trimmed = await sharp(cropped).trim({ threshold: 12 }).toBuffer();

  await sharp(trimmed)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .webp({ quality: 88 })
    .toFile(`public/products/${job.slug}.webp`);

  // Near-white becomes transparent, so the holographic card shows through behind the top.
  const { data, info } = await sharp(trimmed)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index] > 243 && data[index + 1] > 243 && data[index + 2] > 243) data[index + 3] = 0;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`public/products/cutout/${job.slug}.webp`);

  console.log(`${job.slug}: packshot + cut-out`);
}

async function fit(slug, boxWidth, boxHeight) {
  const trimmed = await sharp(`public/products/cutout/${slug}.webp`).trim({ threshold: 10 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const scale = Math.min(boxWidth / meta.width, boxHeight / meta.height);
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));
  return { buffer: await sharp(trimmed).resize(width, height, { fit: "fill" }).toBuffer(), width, height };
}

for (const job of BUNDLES) {
  const layers = [];
  for (const [index, slug] of job.top.entries()) {
    const piece = await fit(slug, 430, 470);
    const centre = index === 0 ? 260 : 740;
    layers.push({ input: piece.buffer, left: Math.round(centre - piece.width / 2), top: Math.round(60 + (470 - piece.height) / 2) });
  }
  const bottom = await fit(job.bottom, 520, 380);
  layers.push({ input: bottom.buffer, left: Math.round(500 - bottom.width / 2), top: Math.round(590 + (380 - bottom.height) / 2) });

  await writePair(job.slug, layers, { r: 0, g: 0, b: 0, alpha: 0 });
  console.log(`${job.slug}: ${[...job.top, job.bottom].join(" + ")}`);
}

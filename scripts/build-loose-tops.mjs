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
  // Rendered with a drop shadow under the base, which runs from where the chrome ring ends
  // (about 62% of the way down) to the floor; the threshold eases through that band.
  { slug: "hover-wyvern-3-85n", src: "assets-source/products/hover-wyvern-3-85n.png", cropBottom: 0, shadow: [0.74, 0.84] },
  // The supplier's render carries a Japanese "image is for illustration" line along the
  // bottom edge, which would read as ours on a product page.
  // No floor shadow in this render, so the strict threshold holds all the way down.
  { slug: "impact-drake-9-60lr", src: "assets-source/products/impact-drake-9-60lr.jpg", cropBottom: 0.07, shadow: null },
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

/**
 * Lift a top off its white studio background.
 *
 * A plain "near-white becomes transparent" pass is wrong twice over for these renders. It
 * keeps the soft grey drop shadow under the base, which on a dark card reads as a cloud,
 * and it punches holes in the chrome, whose highlights are as close to white as the
 * background is. So the background is found by connectivity instead: a flood from the
 * image's edges through light, colourless pixels, which spreads across the backdrop and
 * its shadow but stops at the top's outline, where the step in brightness is sharp. The
 * highlights inside the blade are never reached, because nothing light connects them to
 * the edge.
 */
async function liftOff(src, cropBottom, shadow) {
  const meta = await sharp(src).metadata();
  const height = Math.round(meta.height * (1 - cropBottom));
  const { data, info } = await sharp(src)
    .extract({ left: 0, top: 0, width: meta.width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, channels } = info;
  const total = width * info.height;
  const luminance = (pixel) => {
    const offset = pixel * channels;
    return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  };
  // Two different things have to go, and they live in different places. The drop shadow
  // sits under the base and fades to mid-grey where the top meets the floor, so down there
  // the floor has to be low. The chrome rim is everywhere else, and where the light catches
  // it it is nearly as bright as the backdrop and meets it with no outline at all — a low
  // floor up there takes bites out of the metal. So the floor is strict across the image
  // and only relaxes in the band the shadow occupies.
  // The floor eases from strict to loose across the shadow band rather than switching at
  // a line, because a hard switch leaves the shadow's upper edge as a visible straight cut.
  const floorAt = (row) => {
    if (!shadow) return 238;
    const progress = (row / info.height - shadow[0]) / (shadow[1] - shadow[0]);
    return 238 - Math.min(1, Math.max(0, progress)) * (238 - 150);
  };
  const neutralAndLight = (pixel) => {
    const offset = pixel * channels;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const floor = floorAt(Math.floor(pixel / width));
    // Colour is what keeps the green and teal blade out of either.
    return Math.max(r, g, b) - Math.min(r, g, b) <= 24 && luminance(pixel) >= floor;
  };

  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const seed = (pixel) => {
    if (!background[pixel] && neutralAndLight(pixel)) {
      background[pixel] = 1;
      queue[tail++] = pixel;
    }
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((info.height - 1) * width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const here = luminance(pixel);
    for (const next of [pixel - 1, pixel + 1, pixel - width, pixel + width]) {
      if (next < 0 || next >= total || background[next]) continue;
      if ((next === pixel - 1 && x === 0) || (next === pixel + 1 && x === width - 1)) continue;
      // A gentle gradient is still backdrop; a sharp step is the edge of the top.
      if (neutralAndLight(next) && Math.abs(luminance(next) - here) < 28) {
        background[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  for (let pixel = 0; pixel < total; pixel += 1) {
    if (background[pixel]) data[pixel * channels + 3] = 0;
  }

  // One pixel of feathering on the alpha alone, so the outline is anti-aliased rather than
  // stair-stepped; the colour channels are left exactly as rendered.
  const alpha = await sharp(data, { raw: { width, height: info.height, channels } })
    .extractChannel(3)
    .blur(0.8)
    .toBuffer();
  const feathered = Buffer.from(data);
  for (let pixel = 0; pixel < total; pixel += 1) {
    feathered[pixel * channels + 3] = Math.min(data[pixel * channels + 3], alpha[pixel]);
  }

  return sharp(feathered, { raw: { width, height: info.height, channels } }).png().toBuffer();
}

/**
 * The share of the tile the top may fill. The packshots it sits beside in a row are boxes
 * that fill about two thirds of theirs; a bare top drawn edge to edge looked half again as
 * big as everything around it.
 */
const LOOSE_FILL = 0.7;

for (const job of LOOSE) {
  const lifted = await sharp(await liftOff(job.src, job.cropBottom, job.shadow)).trim({ threshold: 1 }).toBuffer();
  const box = Math.round(SIZE * LOOSE_FILL);
  const top = await sharp(lifted)
    .resize(box, box, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  const placement = [{
    input: top.data,
    left: Math.round((SIZE - top.info.width) / 2),
    // A touch below centre: a top's weight sits low, and centring it mathematically makes
    // it look as if it floats off the top of the card.
    top: Math.round((SIZE - top.info.height) / 2 + SIZE * 0.03),
  }];

  await writePair(job.slug, placement, { r: 0, g: 0, b: 0, alpha: 0 });
  console.log(`${job.slug}: lifted off its background at ${Math.round(LOOSE_FILL * 100)}%`);
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

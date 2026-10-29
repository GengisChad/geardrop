#!/usr/bin/env node
/**
 * GEAR//DROP product clip renderer.
 *
 *   node render.mjs --template gallery|reel --data clip.json --out clip.mp4 --poster clip.jpg
 *                   [--contact sheet.png] [--fonts dir] [--emblem emblem.webp] [--ffmpeg ffmpeg]
 *                   [--crf 22] [--frames jpeg|png]
 *
 * Opens templates/<template>.html in headless Chromium with window.__CLIP__ set from the JSON,
 * waits for the template's layout (window.__CLIP_READY__), pauses every CSS animation and seeks
 * them frame by frame, piping each frame into ffmpeg: H.264 yuv420p BT.709, faststart, no audio.
 * The same data always gives the same video. Prints one JSON line with the result on stdout.
 *
 * Usually run through `pnpm clips` (render-clips.ts), which builds the data from the catalogue.
 * CLIP_CHROMIUM points at a Chromium binary when Playwright's own browser is not installed.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const TEMPLATES = {
  gallery: { width: 1080, height: 1080, seconds: 6, contact: { cols: 4, tile: 360, times: [0.3, 0.7, 1.1, 1.7, 2.1, 2.6, 3.1, 3.5, 3.8, 4.1, 4.6, 5.97] } },
  reel: { width: 1080, height: 1920, seconds: 8, contact: { cols: 6, tile: 270, times: [0.2, 0.6, 1.0, 1.4, 1.9, 2.4, 2.9, 3.3, 3.7, 4.1, 4.5, 4.9, 5.3, 5.7, 6.1, 6.6, 7.2, 7.97] } },
};
const FONT_FILES = {
  anybodyNormal: "anybody-latin-standard-normal.woff2",
  anybodyItalic: "anybody-latin-standard-italic.woff2",
  mono: "jetbrains-mono-latin-500-normal.woff2",
  chakra: "chakra-petch-latin-700-italic.woff2",
};
const USAGE = "usage: node render.mjs --template gallery|reel --data clip.json --out clip.mp4 --poster clip.jpg [--contact sheet.png] [--fonts dir] [--emblem file] [--ffmpeg bin] [--crf 22] [--frames jpeg|png]";

class UsageError extends Error {}

function parseArgs(argv) {
  const known = new Set(["template", "data", "out", "poster", "contact", "fonts", "emblem", "ffmpeg", "crf", "frames"]);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") throw new UsageError(USAGE);
    if (!flag.startsWith("--") || !known.has(flag.slice(2))) throw new UsageError(`unknown argument ${flag}\n${USAGE}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`missing value for ${flag}\n${USAGE}`);
    args[flag.slice(2)] = value;
  }
  for (const req of ["template", "data", "out", "poster"]) if (!args[req]) throw new UsageError(`--${req} is required\n${USAGE}`);
  if (!TEMPLATES[args.template]) throw new UsageError(`--template must be gallery or reel, got "${args.template}"`);
  args.crf = args.crf === undefined ? 22 : Number(args.crf);
  if (!Number.isInteger(args.crf) || args.crf < 0 || args.crf > 51) throw new UsageError("--crf must be an integer 0-51");
  args.frames = args.frames || "jpeg";
  if (!["jpeg", "png"].includes(args.frames)) throw new UsageError("--frames must be jpeg or png");
  return args;
}

/** Keeps only the documented fields and checks their types; the cutout becomes a file:// URL. */
function validateClip(raw, dataPath) {
  const bad = (msg) => { throw new UsageError(`${dataPath}: ${msg}`); };
  if (!raw || typeof raw !== "object") bad("not a JSON object");
  const str = (k) => { if (typeof raw[k] !== "string" || !raw[k].trim()) bad(`"${k}" must be a non-empty string`); return raw[k].trim(); };
  const opt = (k) => { if (raw[k] == null) return null; if (typeof raw[k] !== "string") bad(`"${k}" must be a string or null`); return raw[k].trim() || null; };
  if (!Array.isArray(raw.callouts) || raw.callouts.length !== 2 || raw.callouts.some((c) => typeof c !== "string" || !c.trim())) bad('"callouts" must be an array of two non-empty strings');
  if (typeof raw.tint !== "string" || !/^#[0-9a-f]{6}$/i.test(raw.tint)) bad('"tint" must be a #rrggbb hex colour');
  const cutoutPath = raw.cutout && String(raw.cutout).startsWith("file:") ? fileURLToPath(raw.cutout) : path.resolve(path.dirname(dataPath), String(raw.cutout || ""));
  if (!raw.cutout || !fs.existsSync(cutoutPath)) bad(`"cutout" file not found: ${raw.cutout}`);
  return {
    slug: str("slug"), name: str("name"), code: str("code"), mark: opt("mark"), type: opt("type"),
    callouts: raw.callouts.map((c) => c.trim()), tagline: opt("tagline"), tint: raw.tint.toLowerCase(),
    cutout: pathToFileURL(cutoutPath).href,
  };
}

function findFonts(dir) {
  if (!fs.existsSync(dir)) throw new UsageError(`fonts directory not found: ${dir}`);
  const found = {};
  const wanted = new Map(Object.entries(FONT_FILES).map(([k, f]) => [f, k]));
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 6) walk(p, depth + 1);
      else if (wanted.has(e.name) && !found[wanted.get(e.name)]) found[wanted.get(e.name)] = p;
    }
  };
  walk(dir, 0);
  const missing = Object.entries(FONT_FILES).filter(([k]) => !found[k]).map(([, f]) => f);
  if (missing.length) throw new UsageError(`fonts directory ${dir} is missing: ${missing.join(", ")}`);
  return found;
}

function fontCss(f) {
  const url = (p) => JSON.stringify(pathToFileURL(p).href);
  return [
    `@font-face{font-family:"Anybody Variable";font-style:normal;font-weight:100 900;font-stretch:50% 150%;src:url(${url(f.anybodyNormal)}) format("woff2")}`,
    `@font-face{font-family:"Anybody Variable";font-style:italic;font-weight:100 900;font-stretch:50% 150%;src:url(${url(f.anybodyItalic)}) format("woff2")}`,
    `@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:500;src:url(${url(f.mono)}) format("woff2")}`,
    `@font-face{font-family:"Chakra Petch";font-style:italic;font-weight:700;src:url(${url(f.chakra)}) format("woff2")}`,
  ].join("\n");
}

function loadChromium() {
  for (const id of ["playwright", "@playwright/test", "playwright-core"]) {
    try { const m = require(id); if (m && m.chromium) return m.chromium; } catch { /* try the next one */ }
  }
  throw new Error("Playwright not found: install playwright (or @playwright/test) where this script can require it");
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited with ${code}: ${err.trim()}`))));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tpl = TEMPLATES[args.template];
  const dataPath = path.resolve(args.data);
  const clip = validateClip(JSON.parse(fs.readFileSync(dataPath, "utf8")), dataPath);
  if (!args.fonts) throw new UsageError("--fonts is required: a folder with the @fontsource 5.3.0 files (render-clips.ts builds one)");
  const fonts = findFonts(path.resolve(args.fonts));
  // The supplied emblem itself, never redrawn (components/layout/logo.tsx).
  const emblem = path.resolve(args.emblem || path.join(HERE, "..", "..", "public", "brand", "emblem.webp"));
  if (!fs.existsSync(emblem)) throw new UsageError(`emblem image not found: ${emblem}`);
  const ffmpeg = args.ffmpeg || "ffmpeg";
  const out = path.resolve(args.out), poster = path.resolve(args.poster), contact = args.contact ? path.resolve(args.contact) : null;
  for (const f of [out, poster, contact].filter(Boolean)) fs.mkdirSync(path.dirname(f), { recursive: true });

  const executablePath = process.env.CLIP_CHROMIUM;
  const browser = await loadChromium().launch({
    args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars"],
    ...(executablePath ? { executablePath } : {}),
  });
  const warnings = [];
  try {
    const page = await browser.newPage({ viewport: { width: tpl.width, height: tpl.height }, deviceScaleFactor: 1 });
    page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warnings.push(m.text()); });
    page.on("pageerror", (e) => warnings.push(String(e)));
    await page.addInitScript((init) => { window.__CLIP__ = init.clip; window.__FONT_CSS__ = init.css; window.__BRAND__ = { emblem: init.emblem }; }, { clip, css: fontCss(fonts), emblem: pathToFileURL(emblem).href });
    await page.goto(pathToFileURL(path.join(HERE, "templates", `${args.template}.html`)).href);
    await page.waitForFunction(() => window.__CLIP_READY__ === true || typeof window.__CLIP_ERROR__ === "string", null, { timeout: 30000 });
    const failure = await page.evaluate(() => window.__CLIP_ERROR__ || null);
    if (failure) throw new Error(`template layout failed: ${failure}`);
    const layout = await page.evaluate(() => window.__CLIP_LAYOUT__);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    const seek = (ms) => page.evaluate(async (t) => {
      for (const a of document.getAnimations()) a.currentTime = t;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, ms);

    // Frames go straight into ffmpeg; nothing is written to disk. JPEG frames are converted with
    // their own BT.601 full-range matrix, PNG frames from RGB, both to BT.709 limited range.
    const vf = args.frames === "jpeg" ? "scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p" : "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
    const ff = spawn(ffmpeg, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", args.frames === "jpeg" ? "mjpeg" : "png", "-i", "-",
      "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", String(args.crf), "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-movflags", "+faststart", "-an", out], { stdio: ["pipe", "ignore", "pipe"] });
    let ffErr = "";
    ff.stderr.on("data", (d) => { ffErr += d; });
    const ffDone = new Promise((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${ffErr.trim()}`))));
    });
    ff.stdin.on("error", () => { /* surfaced by ffDone */ });
    const cdp = await page.context().newCDPSession(page);
    const shot = args.frames === "jpeg" ? { format: "jpeg", quality: 95, optimizeForSpeed: true } : { format: "png", optimizeForSpeed: true };
    const frames = Math.round(tpl.seconds * FPS);
    for (let i = 0; i < frames; i++) {
      await seek((i * 1000) / FPS);
      const { data } = await cdp.send("Page.captureScreenshot", shot);
      if (!ff.stdin.write(Buffer.from(data, "base64"))) await Promise.race([once(ff.stdin, "drain"), ffDone]);
    }
    ff.stdin.end();
    await ffDone;

    await seek(tpl.seconds * 1000);
    await page.screenshot({ path: poster, type: "jpeg", quality: 85 });

    if (contact) {
      const c = tpl.contact, nums = c.times.map((t) => Math.min(frames - 1, Math.round(t * FPS)));
      const rows = Math.ceil(nums.length / c.cols);
      await run(ffmpeg, ["-v", "error", "-y", "-i", out, "-vf", `select='${nums.map((n) => `eq(n,${n})`).join("+")}',scale=${c.tile}:-2,tile=${c.cols}x${rows}:padding=6:color=0x3c3c3c`, "-fps_mode", "vfr", "-frames:v", "1", contact]);
    }
    const result = { template: args.template, slug: clip.slug, width: tpl.width, height: tpl.height, fps: FPS, seconds: tpl.seconds, frames, out, bytes: fs.statSync(out).size, poster, contact, trimmed: layout && layout.trimmed, trim: layout && layout.trim, loosePiece: layout && layout.loosePiece, warnings };
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write(`render.mjs: ${e instanceof UsageError ? e.message : e.stack || e}\n`);
  process.exit(e instanceof UsageError ? 2 : 1);
});

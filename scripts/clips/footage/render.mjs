#!/usr/bin/env node
/**
 * SPIN reel compositor: the motion-design overlay (overlay.html) on the battle footage, with music.
 *
 *   node render.mjs --video in.mp4 --audio music.wav --timeline ../timeline.json --labels labels.json --out out.mp4
 *                   [--cover T] [--sheet [sheet.jpg]] [--debug] [--crf 17] [--ffmpeg bin] [--ffprobe bin]
 *
 *   --audio      the music; "anullsrc" (or "silence") lays silence instead, for tests.
 *   --cover T    also writes <out>-cover.jpg: the footage frame at T seconds with the hook title.
 *   --sheet      also writes a contact sheet of the result, one frame every 0.5 s (default
 *                <out>-sheet.jpg, or the path that follows the flag).
 *   --debug      draws the Reels safe area, the frame number and a binary frame code (tests only).
 *
 * Opens overlay.html in headless Chromium with the timeline and the labels, steps window.seek(t)
 * through every frame of the input video and screenshots each one on a transparent background
 * (the omitBackground override, set once), piping the PNG frames into one ffmpeg run that:
 *   - punches in on the footage at each impact, frame-exact: a perspective transform whose corners
 *     are per-frame tables (zoom and shake from window.__PLAN__, the overlay's own impact plan);
 *   - lays the overlay over it, converted to BT.709 limited range like the footage;
 *   - muxes the music trimmed or padded to the exact length of the video.
 * Output: H.264 High yuv420p, CRF 17, preset slow, AAC-LC 256 kb/s 48 kHz stereo, +faststart, and
 * exactly as many frames as the input. Frames whose overlay did not change reuse the previous PNG.
 * Prints one JSON line with the result on stdout; the progress goes to stderr.
 */
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_RATE = 48000;
const USAGE = "usage: node render.mjs --video in.mp4 --audio music.wav|anullsrc --timeline ../timeline.json --labels labels.json --out out.mp4 [--cover T] [--sheet [sheet.jpg]] [--debug] [--crf 17] [--ffmpeg bin] [--ffprobe bin]";

class UsageError extends Error {}

function parseArgs(argv) {
  const valued = new Set(["video", "audio", "timeline", "labels", "out", "cover", "crf", "ffmpeg", "ffprobe"]);
  const args = { debug: false, sheet: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") throw new UsageError(USAGE);
    const key = flag.startsWith("--") ? flag.slice(2) : null;
    if (key === "debug") { args.debug = true; continue; }
    if (key === "sheet") {
      const next = argv[i + 1];
      args.sheet = next && !next.startsWith("--") ? argv[++i] : true;
      continue;
    }
    if (!key || !valued.has(key)) throw new UsageError(`unknown argument ${flag}\n${USAGE}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`missing value for ${flag}\n${USAGE}`);
    args[key] = value;
  }
  for (const req of ["video", "audio", "timeline", "labels", "out"]) if (!args[req]) throw new UsageError(`--${req} is required\n${USAGE}`);
  args.crf = args.crf === undefined ? 17 : Number(args.crf);
  if (!Number.isInteger(args.crf) || args.crf < 0 || args.crf > 51) throw new UsageError("--crf must be an integer 0-51");
  if (args.cover !== undefined) {
    args.cover = Number(args.cover);
    if (!Number.isFinite(args.cover) || args.cover < 0) throw new UsageError("--cover takes a time in seconds");
  }
  args.ffmpeg = args.ffmpeg || "ffmpeg";
  args.ffprobe = args.ffprobe || "ffprobe";
  return args;
}

/* ------------------------------------------------------------------ data checks */

const FORBIDDEN = /€|\bprezz|\bcost[ao]\b|\bsconto|\bofferta|\bdisponibil|\bin stock\b|\besaurit|\bpreordin|\bpre-ordin|\bspedizion|\bnovit/i;

function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { throw new UsageError(`${what} ${file}: ${e.message}`); }
}

function checkTimeline(tl, file) {
  const bad = (m) => { throw new UsageError(`${file}: ${m}`); };
  if (!tl || typeof tl !== "object") bad("not a JSON object");
  for (const k of ["fps", "width", "height", "duration"]) if (typeof tl[k] !== "number" || !(tl[k] > 0)) bad(`"${k}" must be a positive number`);
  if (!Array.isArray(tl.shots) || tl.shots.length < 2) bad('"shots" must list the shots');
  tl.shots.forEach((s, i) => {
    if (typeof s.start !== "number" || typeof s.end !== "number" || !(s.end > s.start)) bad(`shot ${i}: start/end`);
    if (i && Math.abs(s.start - tl.shots[i - 1].end) > 0.05) bad(`shot ${i} does not start where shot ${i - 1} ends`);
    if (typeof s.src !== "string" || !s.src) bad(`shot ${i}: "src" names the top on screen`);
    if (!["fast", "lead", "slow"].includes(s.kind)) bad(`shot ${i}: "kind" must be fast, lead or slow`);
    if (typeof s.speed !== "number" || !(s.speed > 0)) bad(`shot ${i}: "speed" must be a positive number`);
  });
  if (!Array.isArray(tl.impacts) || tl.impacts.some((t) => typeof t !== "number" || t < 0 || t > tl.duration)) bad('"impacts" must be times within the video');
}

function checkLabels(lb, tl, file) {
  const bad = (m) => { throw new UsageError(`${file}: ${m}`); };
  const texts = [];
  const str = (v, where, opt = false) => {
    if (v == null && opt) return;
    if (typeof v !== "string" || !v.trim()) bad(`${where} must be a non-empty string`);
    texts.push([where, v]);
  };
  if (!lb || typeof lb !== "object" || !lb.tops || typeof lb.tops !== "object") bad('"tops" is required');
  for (const src of new Set(tl.shots.map((s) => s.src))) if (!lb.tops[src]) bad(`no entry in "tops" for "${src}" (used by the timeline)`);
  for (const [k, t] of Object.entries(lb.tops)) {
    str(t.name, `tops.${k}.name`); str(t.short, `tops.${k}.short`, true); str(t.code, `tops.${k}.code`, true);
    if (typeof t.color !== "string" || !/^#[0-9a-f]{6}$/i.test(t.color)) bad(`tops.${k}.color must be #rrggbb`);
    if (["#c6ff00", "#7a3cff"].includes(t.color.toLowerCase())) bad(`tops.${k}.color is the brand lime/violet, which mean "ships now"/"on its way": pick the top's own colour`);
  }
  const h = lb.hook || {};
  str(h.vs, "hook.vs", true);
  if (!Array.isArray(h.question) || h.question.length !== 2) bad("hook.question must be two lines");
  h.question.forEach((q, i) => str(q, `hook.question[${i}]`));
  if (!Array.isArray(lb.impacts)) bad('"impacts" must be an array (one entry per impact, or none)');
  lb.impacts.forEach((e, i) => {
    if (e.center != null && !(Array.isArray(e.center) && e.center.length === 2 && e.center.every((v) => typeof v === "number"))) bad(`impacts[${i}].center must be [x, y] in frame pixels or null`);
    str(e.word, `impacts[${i}].word`, true);
  });
  str((lb.slowmo || {}).text, "slowmo.text", true);
  const fn = lb.finale || {};
  if (!Array.isArray(fn.question) || !fn.question.length) bad("finale.question must list its words");
  fn.question.forEach((s, i) => { str(s.text, `finale.question[${i}].text`); if (s.top != null && !lb.tops[s.top]) bad(`finale.question[${i}].top "${s.top}" is not in "tops"`); });
  str(fn.cta, "finale.cta");
  if (lb.outro_logo != null && !["geardrop", "none"].includes(lb.outro_logo)) bad('outro_logo must be "geardrop" or "none"');
  const p = lb.punch || {};
  if (p.scale != null && !(p.scale >= 1 && p.scale <= 1.2)) bad("punch.scale must be between 1 and 1.2");
  if (p.shake_px != null && !(p.shake_px >= 0 && p.shake_px <= 6)) bad("punch.shake_px must be between 0 and 6");
  const fl = lb.flash || {};
  if (fl.opacity != null && !(fl.opacity >= 0 && fl.opacity <= 0.55)) bad("flash.opacity must be at most 0.55");
  if (fl.max_per_second != null && !(fl.max_per_second >= 0 && fl.max_per_second <= 3)) bad("flash.max_per_second must be at most 3 (WCAG 2.3.1)");
  // A video cannot follow the catalogue: no price, availability or "Novità".
  for (const [where, v] of texts) if (FORBIDDEN.test(v)) bad(`${where} "${v}" talks about price, availability or news: a video cannot keep that up to date`);
}

/* ------------------------------------------------------------------ tools */

function tool(bin, args, { capture = "stdout" } = {}) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${bin} could not start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${bin} ${args.join(" ")}\nexited with ${r.status}: ${(r.stderr || "").trim().slice(-2000)}`);
  return capture === "stderr" ? r.stderr : r.stdout;
}

function probe(ffprobe, file, stream, fields, count = false) {
  const j = JSON.parse(tool(ffprobe, ["-v", "error", ...(count ? ["-count_frames"] : []), "-select_streams", stream, "-show_entries", `stream=${fields}`, "-of", "json", file]));
  return (j.streams || [])[0] || null;
}

function rate(s) {
  const [a, b] = String(s || "").split("/").map(Number);
  return a > 0 && b > 0 ? { num: a, den: b, fps: a / b } : null;
}

function loadChromium() {
  for (const id of ["playwright", "@playwright/test", "playwright-core", "/opt/node-tools/node_modules/playwright"]) {
    try { const m = require(id); if (m && m.chromium) return m.chromium; } catch { /* next */ }
  }
  throw new Error("Playwright not found: install playwright, or keep it at /opt/node-tools/node_modules/playwright");
}

async function launch() {
  const chromium = loadChromium();
  // --disable-partial-raster: every frame is rastered whole, so the anti-aliasing of a wipe's edge
  // cannot depend on the frame drawn before it (tested: identical pixels in any seek order).
  const opts = { args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text", "--disable-partial-raster"] };
  const paths = [process.env.SPIN_CHROMIUM, null, "/opt/pw-browsers/chromium"].filter((p, i) => i === 1 || p);
  let last;
  for (const executablePath of paths) {
    try { return await chromium.launch({ ...opts, ...(executablePath ? { executablePath } : {}) }); }
    catch (e) { last = e; }
  }
  throw last;
}

/* ------------------------------------------------------------------ punch-in */

/** Perspective corners (sense=source) for a zoom s around (cx, cy) with a shake (dx, dy) in output pixels. */
function corners(p, W, H) {
  const sx = (X) => p.cx + (X - p.cx - p.dx) / p.s;
  const sy = (Y) => p.cy + (Y - p.cy - p.dy) / p.s;
  return { x0: sx(0), y0: sy(0), x1: sx(W), y2: sy(H) };
}

/** One perspective filter whose corners are per-frame tables over the punch frames (in = frame + 1). */
function punchFilter(plan, W, H) {
  if (!plan.punch.length) return null;
  const rows = plan.punch.map((p) => ({ n: p.n, ...corners(p, W, H) }));
  for (const r of rows) {
    if (r.x0 < -1e-6 || r.y0 < -1e-6 || r.x1 > W + 1e-6 || r.y2 > H + 1e-6) throw new Error(`punch-in at frame ${r.n} would show past the edge of the footage`);
  }
  const table = (key, base) => {
    const terms = rows.filter((r) => Math.abs(r[key] - base) > 5e-5).map((r) => `eq(in,${r.n + 1})*(${(r[key] - base).toFixed(4)})`);
    return terms.length ? `${base}+${terms.join("+")}` : String(base);
  };
  const x0 = table("x0", 0), y0 = table("y0", 0), x1 = table("x1", W), y2 = table("y2", H);
  // Only the punch frames go through the filter; every other frame passes untouched.
  const runs = [];
  for (const r of rows) {
    const last = runs[runs.length - 1];
    if (last && r.n === last[1] + 1) last[1] = r.n; else runs.push([r.n, r.n]);
  }
  const enable = runs.map(([a, b]) => `between(n,${a},${b})`).join("+");
  return `perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y0}':x2='${x0}':y2='${y2}':x3='${x1}':y3='${y2}':interpolation=cubic:sense=source:eval=frame:enable='${enable}'`;
}

/* ------------------------------------------------------------------ main */

async function main() {
  const t0 = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const video = path.resolve(args.video);
  if (!fs.existsSync(video)) throw new UsageError(`video not found: ${video}`);
  const silent = ["anullsrc", "silence"].includes(args.audio);
  const audio = silent ? null : path.resolve(args.audio);
  if (audio && !fs.existsSync(audio)) throw new UsageError(`audio not found: ${audio}`);
  const tlPath = path.resolve(args.timeline), lbPath = path.resolve(args.labels);
  const timeline = readJson(tlPath, "timeline"), labels = readJson(lbPath, "labels");
  checkTimeline(timeline, tlPath);
  checkLabels(labels, timeline, lbPath);
  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const stem = out.replace(/\.[^./]+$/, "");
  const coverOut = args.cover !== undefined ? `${stem}-cover.jpg` : null;
  const sheetOut = args.sheet ? (args.sheet === true ? `${stem}-sheet.jpg` : path.resolve(args.sheet)) : null;
  const warnings = [];

  // The input decides the frame count and rate; the overlay is drawn for exactly those frames.
  const v = probe(args.ffprobe, video, "v:0", "width,height,r_frame_rate,nb_read_frames,pix_fmt", true);
  if (!v) throw new UsageError(`${video} has no video stream`);
  const W = Number(v.width), H = Number(v.height), N = Number(v.nb_read_frames), R = rate(v.r_frame_rate);
  if (W !== 1080 || H !== 1920) throw new UsageError(`${video} is ${W}x${H}: the overlay is drawn for 1080x1920`);
  if (!R || !Number.isInteger(N) || N <= 0) throw new UsageError(`${video}: cannot read its frame rate and count`);
  if (Math.abs(R.fps - timeline.fps) > 1e-6) throw new UsageError(`${video} runs at ${R.num}/${R.den} fps, the timeline at ${timeline.fps}`);
  const videoSeconds = (N * R.den) / R.num;
  if (Math.abs(videoSeconds - timeline.duration) > 1.5 / R.fps) warnings.push(`video lasts ${videoSeconds.toFixed(3)} s, timeline.json says ${timeline.duration}`);
  const samples = Math.round(videoSeconds * AUDIO_RATE);
  let mono = false;
  if (audio) {
    const a = probe(args.ffprobe, audio, "a:0", "sample_rate,channels,duration");
    if (!a) throw new UsageError(`${audio} has no audio stream`);
    mono = Number(a.channels) === 1;
    const dur = Number(a.duration);
    if (Number.isFinite(dur) && dur < videoSeconds - 0.02) warnings.push(`music lasts ${dur.toFixed(3)} s, padded with silence to ${videoSeconds.toFixed(3)} s`);
    if (Number.isFinite(dur) && dur > videoSeconds + 0.02) {
      const tail = tool(args.ffmpeg, ["-hide_banner", "-nostats", "-i", audio, "-af", `atrim=start=${videoSeconds},volumedetect`, "-f", "null", "-"], { capture: "stderr" });
      const peak = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(tail);
      if (peak && peak[1] !== "-inf" && Number(peak[1]) > -60) warnings.push(`music runs ${(dur - videoSeconds).toFixed(3)} s past the video and is cut while audible (${peak[1]} dBFS)`);
    }
  }

  const browser = await launch();
  let result;
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.addInitScript((init) => {
      window.__TIMELINE__ = init.timeline; window.__LABELS__ = init.labels; window.__FRAMES__ = init.frames;
      window.__DEBUG__ = init.debug; window.__ASSETS__ = { emblem: init.emblem };
    }, { timeline, labels, frames: N, debug: args.debug, emblem: pathToFileURL(path.join(HERE, "brand", "emblem.webp")).href });
    await page.goto(pathToFileURL(path.join(HERE, "overlay.html")).href);
    await page.waitForFunction(() => window.__READY__ === true || typeof window.__ERROR__ === "string", null, { timeout: 30000 });
    const failure = await page.evaluate(() => window.__ERROR__ || null);
    if (failure) throw new Error(`overlay.html failed: ${failure}`);
    const layout = await page.evaluate(() => window.__LAYOUT__);
    const plan = await page.evaluate(() => window.__PLAN__);
    warnings.push(...layout.warnings);
    if (layout.safeAtRest !== "ok") warnings.push(...layout.safeAtRest);

    // Transparent page background for every capture (what omitBackground does), set once.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    const capture = async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false })).data, "base64");

    const punch = punchFilter(plan, W, H);
    const fps = `${R.num}/${R.den}`;
    const graph = [
      `[0:v]${punch ? punch + "," : ""}setpts=N/(${fps})/TB,format=yuv444p[base]`,
      `[1:v]setpts=N/(${fps})/TB,format=rgba,scale=out_color_matrix=bt709:out_range=tv,format=yuva444p[ovl]`,
      `[base][ovl]overlay=x=0:y=0:format=yuv444:alpha=straight:eof_action=pass:repeatlast=0,format=yuv420p[v]`,
      // The music is never re-levelled: a mono file goes to both channels at unity (the default
      // upmix would take 3 dB off), anything else is resampled and mapped to stereo as it is.
      `[2:a]aresample=${AUDIO_RATE},${mono ? "pan=stereo|c0=c0|c1=c0," : ""}aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_len=${samples},atrim=end_sample=${samples}[a]`,
    ].join(";");
    const ffArgs = [
      "-hide_banner", "-v", "error", "-y",
      "-i", video,
      "-thread_queue_size", "1024", "-f", "image2pipe", "-framerate", fps, "-c:v", "png", "-i", "-",
      ...(audio ? ["-i", audio] : ["-f", "lavfi", "-t", videoSeconds.toFixed(6), "-i", `anullsrc=r=${AUDIO_RATE}:cl=stereo`]),
      "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", String(args.crf), "-pix_fmt", "yuv420p",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "256k", "-ar", String(AUDIO_RATE), "-ac", "2",
      // The edit lists are written in the movie timescale: 48000 (a multiple of the frame rate and the
      // sample rate) keeps both tracks exact; the default 1000 cuts 16.2333 s to 16.233 s.
      "-frames:v", String(N), "-movie_timescale", String(AUDIO_RATE), "-movflags", "+faststart", out,
    ];
    const ff = spawn(args.ffmpeg, ffArgs, { stdio: ["pipe", "ignore", "pipe"] });
    let ffErr = "";
    ff.stderr.on("data", (d) => { ffErr += d; });
    const ffDone = new Promise((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${ffErr.trim().slice(-3000)}`))));
    });
    ff.stdin.on("error", () => { /* surfaced by ffDone */ });

    const unsafe = new Map();
    let prevSig = null, prevPng = null, captured = 0;
    for (let n = 0; n < N; n++) {
      const { sig, bad } = await page.evaluate((i) => ({ sig: window.seekFrame(i), bad: window.checkSafe() }), n);
      for (const b of bad) { const id = b.replace(/^f\d+: /, "").split(" at ")[0]; if (!unsafe.has(id)) unsafe.set(id, b); }
      let png = prevPng;
      if (sig !== prevSig) { png = await capture(); captured++; }
      if (n === 0) {
        // The first frame must really be transparent around the graphics.
        const tmp = path.join(os.tmpdir(), `spin-overlay-${process.pid}.png`);
        fs.writeFileSync(tmp, png);
        const px = spawnSync(args.ffmpeg, ["-v", "error", "-i", tmp, "-vf", "crop=2:2:1070:1900,format=rgba", "-f", "rawvideo", "-"]);
        fs.rmSync(tmp, { force: true });
        if (px.status !== 0 || px.stdout.length < 4) throw new Error(`cannot read the first overlay frame: ${px.stderr}`);
        if (px.stdout[3] !== 0) throw new Error("overlay frames are not transparent: check the page background");
      }
      prevSig = sig; prevPng = png;
      if (!ff.stdin.write(png)) await Promise.race([once(ff.stdin, "drain"), ffDone]);
      if (n % 60 === 0 || n === N - 1) process.stderr.write(`render.mjs: frame ${n + 1}/${N} (${captured} captured)\n`);
    }
    ff.stdin.end();
    await ffDone;
    if (unsafe.size) warnings.push(...[...unsafe.values()].map((m) => `safe area: ${m}`));
    if (pageErrors.length) warnings.push(...pageErrors.map((m) => `page: ${m}`));

    // Cover: the hook title, settled, over the clean footage frame at T.
    if (coverOut) {
      const coverBad = await page.evaluate(() => window.cover());
      warnings.push(...coverBad);
      const png = await capture();
      const tmp = path.join(os.tmpdir(), `spin-cover-${process.pid}.png`);
      fs.writeFileSync(tmp, png);
      const k = Math.min(N - 1, Math.max(0, Math.round(args.cover * R.fps)));
      tool(args.ffmpeg, ["-v", "error", "-y", "-i", video, "-i", tmp, "-filter_complex",
        `[0:v]select='eq(n,${k})',scale=in_color_matrix=bt709:in_range=tv,format=gbrp[bg];[1:v]format=rgba[t];[bg][t]overlay=format=gbrp,scale=out_color_matrix=bt601:out_range=pc,format=yuvj420p`,
        "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "2", coverOut]);
      fs.rmSync(tmp, { force: true });
    }
    result = { plan, captured, warnings };
  } finally {
    await browser.close();
  }

  // Check what was written.
  const ov = probe(args.ffprobe, out, "v:0", "codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames,color_space,color_range", true);
  const oa = probe(args.ffprobe, out, "a:0", "codec_name,profile,sample_rate,channels,bit_rate,duration_ts");
  const problems = [];
  if (Number(ov.nb_read_frames) !== N) problems.push(`${ov.nb_read_frames} frames written, the input has ${N}`);
  if (ov.codec_name !== "h264" || ov.profile !== "High" || ov.pix_fmt !== "yuv420p") problems.push(`video is ${ov.codec_name} ${ov.profile} ${ov.pix_fmt}`);
  if (!oa || oa.codec_name !== "aac" || Number(oa.sample_rate) !== AUDIO_RATE || Number(oa.channels) !== 2) problems.push(`audio is ${JSON.stringify(oa)}`);
  if (oa && Math.abs(Number(oa.duration_ts) - samples) > 1) problems.push(`audio has ${oa.duration_ts} samples, the video needs ${samples}`);
  if (problems.length) throw new Error(`${out}: ${problems.join("; ")}`);

  if (sheetOut) {
    const times = [];
    for (let t = 0; t <= videoSeconds - 1 / R.fps + 1e-9; t += 0.5) times.push(Math.round(t * 1000) / 1000);
    const nums = times.map((t) => Math.min(N - 1, Math.round(t * R.fps)));
    const cols = 11, rows = Math.ceil(nums.length / cols);
    const font = ["/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"].find((f) => fs.existsSync(f));
    const label = font ? `,drawtext=fontfile='${font}':text='%{pts\\:hms}  f%{eif\\:t*${R.fps}+0.5\\:d}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=5` : "";
    tool(args.ffmpeg, ["-v", "error", "-y", "-i", out, "-vf",
      `select='${nums.map((n) => `eq(n,${n})`).join("+")}',scale=240:-2${label},tile=${cols}x${rows}:padding=6:margin=6:color=0x202024`,
      "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "3", sheetOut]);
  }

  const res = {
    out, frames: N, fps: R.fps, seconds: Number(videoSeconds.toFixed(4)), width: W, height: H,
    video: `${ov.codec_name} ${ov.profile} ${ov.pix_fmt} ${ov.color_space || ""} CRF ${args.crf}`.trim(),
    audio: `${oa.codec_name} ${oa.profile} ${oa.sample_rate} Hz ${oa.channels} ch, 256 kb/s target (${Math.round(Number(oa.bit_rate) / 1000)} measured), ${oa.duration_ts} samples, ${silent ? "silence" : path.basename(audio)}`,
    bytes: fs.statSync(out).size, cover: coverOut, sheet: sheetOut,
    overlayCaptures: result.captured, impacts: result.plan.impacts, punchFrames: result.plan.punch.length, cues: result.plan.cues,
    seconds_to_render: Math.round((Date.now() - t0) / 100) / 10,
    warnings: result.warnings,
  };
  process.stdout.write(JSON.stringify(res) + "\n");
}

main().catch((e) => {
  process.stderr.write(`render.mjs: ${e instanceof UsageError ? e.message : e.stack || e}\n`);
  process.exit(e instanceof UsageError ? 2 : 1);
});

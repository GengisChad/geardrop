/**
 * Renders the product clips (owner, 2026-10-29): `pnpm clips [slug ...]`, or the drop reel with
 * `pnpm clips --drop`.
 *
 * Each clip is an HTML and CSS composition (gallery.html for the product page, reel.html for
 * Instagram and YouTube) that render.mjs plays frame by frame in the preinstalled Playwright
 * Chromium and encodes with ffmpeg. The facts come from the catalogue through clip-data.ts, so a
 * clip never says anything the shop does not: no price, no availability, no "Novità".
 *
 * Gallery clips and their posters go to public/video/products/ and are served by the site.
 * Reels go to out/clips/, which is not committed: post them, do not ship them.
 *
 * The drop reel (drop.html) runs five products on one 128 BPM grid, 24.4 s. `--drop` writes the
 * original music with music.py (python3 and numpy; CLIP_PYTHON picks another interpreter), renders
 * the silent video to out/clips/drop/geardrop-drop.mp4 with its poster and contact sheet, then muxes
 * both into out/clips/geardrop-drop-reel.mp4 (the video copied, the music as AAC-LC 48 kHz stereo
 * 256 kb/s, never normalised again) with its cover out/clips/geardrop-drop-reel.jpg.
 */
import { spawnSync, type StdioOptions } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLIP_SPECS, clipData, type ClipSpec } from "./clip-data";

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

function render(template: "gallery" | "reel" | "drop", data: object, out: string, poster: string, fonts: string, contact?: string): void {
  const file = join(scratch, `${template}.json`);
  writeFileSync(file, JSON.stringify(data));
  mkdirSync(dirname(out), { recursive: true });
  const run = spawnSync(
    process.execPath,
    [
      join(here, "render.mjs"), "--template", template, "--data", file, "--out", out, "--poster", poster, "--fonts", fonts, "--emblem", join(root, "public/brand/emblem.webp"),
      ...(contact ? ["--contact", contact] : []),
    ],
    { stdio: "inherit" },
  );
  if (run.status !== 0) throw new Error(`render.mjs failed for ${out}`);
}

/** The catalogue facts of a clip, with its cut-out as a file:// URL for render.mjs. */
function renderData(spec: ClipSpec) {
  const facts = clipData(spec);
  return { ...facts, cutout: pathToFileURL(join(root, "public", facts.cutout)).href };
}

/** The drop reel's running order: one product per two bars, in this order. */
const DROP_ORDER = ["soar-phoenix-9-60gf", "hover-wyvern-3-85n", "glory-valkerion-lf", "impact-drake-9-60lr", "wand-wizard-1-60r"] as const;

/** The reel's audio rate: music.py writes 48 kHz and the mux never resamples. */
const DROP_AUDIO_RATE = 48_000;

/**
 * The reel's cover frame: 5.0 s, Soar Phoenix with its code, blade type, name and callout already
 * still, between two kicks (frame 150 at 30 fps). The caption notes pick the same frame.
 */
const DROP_COVER_S = 5.0;

/** Runs a tool to the end and returns the stream it captures (stdout or stderr), if any; anything but exit 0 throws. */
function tool(bin: string, args: string[], capture?: "stdout" | "stderr"): string {
  const stdio: StdioOptions = capture === "stdout" ? ["ignore", "pipe", "inherit"] : capture === "stderr" ? ["ignore", "inherit", "pipe"] : "inherit";
  const run = spawnSync(bin, args, { stdio, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (run.error) throw new Error(`${bin} could not start: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`${bin} failed with exit ${run.status}: ${bin} ${args.join(" ")}${capture === "stderr" ? `\n${run.stderr}` : ""}`);
  return capture ? run[capture] : "";
}

/** One stream's fields from ffprobe, as strings. */
function probe(file: string, stream: "v:0" | "a:0", fields: string): Record<string, string> {
  const json = JSON.parse(tool("ffprobe", ["-v", "error", "-select_streams", stream, "-show_entries", `stream=${fields}`, "-of", "json", file], "stdout")) as { streams?: Record<string, string | number>[] };
  const found = json.streams?.[0];
  if (!found) throw new Error(`${file} has no ${stream} stream`);
  return Object.fromEntries(Object.entries(found).map(([key, value]) => [key, String(value)]));
}

/** The video's frame count and rate, and the audio samples that last exactly as long. */
function videoLength(video: string): { frames: number; fps: number; samples: number } {
  const v = probe(video, "v:0", "nb_frames,r_frame_rate");
  const frames = Number(v.nb_frames);
  const [num, den] = (v.r_frame_rate ?? "").split("/").map(Number);
  if (!Number.isInteger(frames) || frames <= 0 || !num || !den) throw new Error(`${video}: cannot read its frame count and rate`);
  const samples = (frames * den * DROP_AUDIO_RATE) / num;
  if (!Number.isInteger(samples)) throw new Error(`${video}: ${frames} frames at ${num}/${den} fps is not a whole number of ${DROP_AUDIO_RATE} Hz samples`);
  return { frames, fps: num / den, samples };
}

/**
 * Muxes the silent drop video with its music: the H.264 stream is copied as it is, the music is
 * padded with silence or trimmed to the video's exact length and encoded once as AAC-LC 48 kHz
 * stereo at 256 kb/s, with the index at the front (faststart). It refuses to trim anything audible:
 * whatever runs past the video's end must be below -60 dBFS. Then it checks what it wrote and pulls
 * the cover frame.
 */
function muxDrop(video: string, music: string, out: string, cover: string): void {
  const { frames, fps, samples } = videoLength(video);
  const a = probe(music, "a:0", "sample_rate,channels,duration_ts");
  if (Number(a.sample_rate) !== DROP_AUDIO_RATE || Number(a.channels) !== 2) throw new Error(`${music}: expected ${DROP_AUDIO_RATE} Hz stereo, got ${a.sample_rate} Hz with ${a.channels} channels`);
  const have = Number(a.duration_ts);
  if (have > samples) {
    const tail = tool("ffmpeg", ["-hide_banner", "-nostats", "-i", music, "-af", `atrim=start_sample=${samples},volumedetect`, "-f", "null", "-"], "stderr");
    const peak = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(tail)?.[1];
    if (peak === undefined) throw new Error(`${music}: cannot measure the ${have - samples} samples past the video's end`);
    if (peak !== "-inf" && Number(peak) > -60) throw new Error(`${music} runs ${((have - samples) / DROP_AUDIO_RATE).toFixed(3)} s past the video and is still audible there (${peak} dBFS): fix the music or the video length, do not cut it`);
  }
  console.log(`clips: muxing ${frames} frames with ${have} samples of music, ${have < samples ? `padded by ${samples - have}` : have > samples ? `trimmed by ${have - samples} silent` : "exact"}`);
  tool("ffmpeg", [
    "-v", "error", "-y", "-i", video, "-i", music, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-af", `apad=whole_len=${samples},atrim=end_sample=${samples}`, "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "256k", "-ar", String(DROP_AUDIO_RATE), "-ac", "2",
    "-movflags", "+faststart", out,
  ]);

  const muxedVideo = probe(out, "v:0", "codec_name,nb_frames");
  const muxedAudio = probe(out, "a:0", "codec_name,profile,sample_rate,channels,duration_ts");
  if (muxedVideo.codec_name !== "h264" || Number(muxedVideo.nb_frames) !== frames) throw new Error(`${out}: expected ${frames} H.264 frames, got ${muxedVideo.nb_frames} ${muxedVideo.codec_name}`);
  if (muxedAudio.codec_name !== "aac" || muxedAudio.profile !== "LC" || Number(muxedAudio.sample_rate) !== DROP_AUDIO_RATE || Number(muxedAudio.channels) !== 2 || Number(muxedAudio.duration_ts) !== samples) {
    throw new Error(`${out}: expected AAC-LC ${DROP_AUDIO_RATE} Hz stereo, ${samples} samples, got ${JSON.stringify(muxedAudio)}`);
  }

  // The cover comes from the reel itself, converted from its BT.709 limited range to a full-range
  // JPEG so the lime and violet stay true.
  const coverFrame = Math.round(DROP_COVER_S * fps);
  tool("ffmpeg", [
    "-v", "error", "-y", "-i", out, "-map", "0:v:0", "-vf", `select='eq(n,${coverFrame})',scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=pc,format=yuvj420p`,
    "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "2", cover,
  ]);
}

const args = process.argv.slice(2);
const drop = args.includes("--drop");
const wanted = new Set(args.filter((arg) => arg !== "--drop"));
if (drop && wanted.size > 0) throw new Error(`--drop renders the whole drop reel: leave out ${[...wanted].join(", ")}.`);
const specs = CLIP_SPECS.filter((spec) => wanted.size === 0 || wanted.has(spec.slug));
if (specs.length === 0) throw new Error(`No clip matches ${[...wanted].join(", ")}.`);

try {
  const fonts = fontsDir();
  if (drop) {
    const clips = DROP_ORDER.map((slug) => {
      const spec = CLIP_SPECS.find((candidate) => candidate.slug === slug);
      if (!spec) throw new Error(`The drop reel plays "${slug}", which has no entry in CLIP_SPECS.`);
      return renderData(spec);
    });
    const dir = join(root, "out/clips/drop");
    mkdirSync(dir, { recursive: true });
    // The music first: it takes seconds, so a missing numpy fails before the long video render.
    const music = join(dir, "geardrop-drop-music.wav");
    tool(process.env.CLIP_PYTHON ?? "python3", [join(here, "music.py"), "--out", music]);
    const video = join(dir, "geardrop-drop.mp4");
    render("drop", clips, video, join(dir, "geardrop-drop.jpg"), fonts, join(dir, "geardrop-drop-contact.png"));
    const reel = join(root, "out/clips/geardrop-drop-reel.mp4");
    muxDrop(video, music, reel, join(root, "out/clips/geardrop-drop-reel.jpg"));
    console.log(`clips: drop reel done, ${reel}`);
  } else {
    for (const spec of specs) {
      const data = renderData(spec);
      const products = join(root, "public/video/products");
      render("gallery", data, join(products, `${spec.slug}.mp4`), join(products, `${spec.slug}.jpg`), fonts);
      render("reel", data, join(root, "out/clips", `${spec.slug}-reel.mp4`), join(root, "out/clips", `${spec.slug}-reel.jpg`), fonts);
      console.log(`clips: ${spec.slug} done`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

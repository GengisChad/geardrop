import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { getAccessToken } from "./youtube-seo";

/**
 * Publishes a finished video on the @GengisChadBBX channel through the YouTube Data API v3.
 *
 *   pnpm yt:publish --whoami                 which channel the saved token belongs to
 *   pnpm yt:publish --latest                 the last 8 uploads (id, privacy, scheduled time, title)
 *   pnpm yt:publish upload <job.json>        resumable upload + metadata + thumbnail (+ playlist)
 *   pnpm yt:publish update <videoId> <job>   same metadata, thumbnail and schedule on a video he uploaded in Studio
 *   add --dry-run to print what would be sent without calling the API
 *
 * OAuth is the one of `pnpm yt:seo` (.secrets/youtube-oauth.json + youtube-token.json, scope youtube).
 *
 * Google's rule: videos sent with videos.insert from an API project that has not passed the YouTube API audit are
 * locked to PRIVATE, and that lock cannot be lifted later. Until the project is audited, `upload` always sends
 * privacyStatus=private and says so; `update` works on videos uploaded in Studio or the app, which carry no lock,
 * so there the job's privacy and publishAt (scheduled release) are applied.
 *
 * Quota (10,000 units a day): videos.insert ~1,600, videos.update 50, thumbnails.set 50, playlistItems.insert 50.
 */

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const CHANNEL_ID = "UCMMABcKm2rdcHlFIj6SWzRw"; // @GengisChadBBX
const CHUNK = 16 * 1024 * 1024; // resumable chunks: multiples of 256 KiB

const Job = z.object({
  file: z.string().optional(),
  title: z.string().min(1).max(100),
  description: z.string().max(5000).default(""),
  tags: z.array(z.string()).default([]),
  categoryId: z.string().default("20"), // Gaming
  language: z.string().default("it"),
  privacy: z.enum(["private", "unlisted", "public"]).default("private"),
  publishAt: z.string().datetime({ offset: true }).optional(), // needs privacy "private": YouTube flips it public at that time
  thumbnail: z.string().optional(), // JPEG/PNG, 16:9, under 2 MB
  playlistId: z.string().optional(),
  madeForKids: z.boolean().default(false),
  audited: z.boolean().default(false), // set true only once Google has approved the API audit for this project
});
type Job = z.infer<typeof Job>;

async function api<T>(token: string, method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ json: T; res: Response }> {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string; errors?: { reason?: string }[] } };
  if (!res.ok) {
    const reason = json.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded") throw new Error("Quota YouTube esaurita per oggi: riprova domani.");
    throw new Error(`${method} ${url.split("?")[0]} ${res.status}${reason ? ` (${reason})` : ""}: ${json.error?.message ?? text.slice(0, 300)}`);
  }
  return { json, res };
}

async function readJob(file: string): Promise<{ job: Job; dir: string }> {
  const job = Job.parse(JSON.parse(await readFile(file, "utf8")));
  if (job.publishAt && job.privacy !== "private") throw new Error("publishAt vuole privacy \"private\": è YouTube a renderlo pubblico all'ora indicata.");
  if (job.publishAt && new Date(job.publishAt).getTime() < Date.now() + 15 * 60_000) throw new Error("publishAt deve essere almeno 15 minuti nel futuro.");
  return { job, dir: path.dirname(path.resolve(file)) };
}

const abs = (dir: string, p: string) => (path.isAbsolute(p) ? p : path.join(dir, p));

function snippetOf(job: Job) {
  return {
    title: job.title,
    description: job.description,
    tags: job.tags,
    categoryId: job.categoryId,
    defaultLanguage: job.language,
    defaultAudioLanguage: job.language,
  };
}

function statusOf(job: Job, forcePrivate: boolean) {
  const privacy = forcePrivate ? "private" : job.privacy;
  return {
    // videos.update resets every status field it is not sent: these keep the channel's usual settings
    embeddable: true,
    publicStatsViewable: true,
    license: "youtube",
    privacyStatus: privacy,
    selfDeclaredMadeForKids: job.madeForKids,
    ...(job.publishAt && privacy === "private" && !forcePrivate ? { publishAt: job.publishAt } : {}),
  };
}

async function whoami(token: string): Promise<void> {
  const { json } = await api<{ items?: { id: string; snippet: { title: string; customUrl?: string }; statistics: { subscriberCount: string; videoCount: string } }[] }>(
    token, "GET", `${API}/channels?part=snippet,statistics&mine=true`);
  const ch = json.items?.[0];
  if (!ch) throw new Error("Il token non ha un canale YouTube collegato.");
  console.log(`${ch.snippet.title} ${ch.snippet.customUrl ?? ""} (${ch.id}) · ${ch.statistics.subscriberCount} iscritti · ${ch.statistics.videoCount} video`);
  if (ch.id !== CHANNEL_ID) console.log(`ATTENZIONE: non è @GengisChadBBX (${CHANNEL_ID}). Rifai l'accesso con l'account del canale.`);
}

async function latest(token: string): Promise<void> {
  const ch = await api<{ items: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(token, "GET", `${API}/channels?part=contentDetails&mine=true`);
  const uploads = ch.json.items[0].contentDetails.relatedPlaylists.uploads;
  const pl = await api<{ items: { contentDetails: { videoId: string } }[] }>(token, "GET", `${API}/playlistItems?part=contentDetails&maxResults=8&playlistId=${uploads}`);
  const ids = pl.json.items.map((i) => i.contentDetails.videoId).join(",");
  const v = await api<{ items: { id: string; snippet: { title: string; publishedAt: string }; status: { privacyStatus: string; publishAt?: string; uploadStatus: string } }[] }>(
    token, "GET", `${API}/videos?part=snippet,status&id=${ids}`);
  for (const it of v.json.items) {
    console.log(`${it.id}  ${it.status.privacyStatus.padEnd(8)} ${it.status.publishAt ?? "".padEnd(24)}  ${it.status.uploadStatus.padEnd(9)} ${it.snippet.title}`);
  }
}

/** Resumable upload, 16 MiB chunks; a dropped chunk is retried from the byte YouTube says it has. */
async function insert(token: string, job: Job, file: string): Promise<string> {
  const size = (await stat(file)).size;
  const meta = { snippet: snippetOf(job), status: statusOf(job, !job.audited) };
  const start = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(size), "x-upload-content-type": "video/mp4" },
    body: JSON.stringify(meta),
  });
  if (!start.ok) throw new Error(`Avvio upload ${start.status}: ${(await start.text()).slice(0, 400)}`);
  const session = start.headers.get("location");
  if (!session) throw new Error("YouTube non ha restituito l'indirizzo di upload.");
  const fh = await open(file, "r");
  try {
    let offset = 0;
    let tries = 0;
    while (offset < size) {
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, offset);
      const res = await fetch(session, {
        method: "PUT",
        headers: { "content-length": String(len), "content-range": `bytes ${offset}-${offset + len - 1}/${size}` },
        body: buf,
      }).catch((e: unknown) => ({ status: 0, error: e }) as unknown as Response);
      if (res.status === 200 || res.status === 201) {
        const body = (await res.json()) as { id: string };
        process.stdout.write(`\rcaricato 100 %            \n`);
        return body.id;
      }
      if (res.status === 308) {
        const range = res.headers.get("range"); // "bytes=0-N"
        offset = range ? Number(range.split("-")[1]) + 1 : 0;
        tries = 0;
        process.stdout.write(`\rcaricato ${((offset / size) * 100).toFixed(0)} % (${(offset / 1048576).toFixed(0)} di ${(size / 1048576).toFixed(0)} MB)`);
        continue;
      }
      if (++tries > 5) throw new Error(`Upload interrotto a ${offset} byte (HTTP ${res.status}).`);
      await new Promise((r) => setTimeout(r, 2000 * tries));
      const probe = await fetch(session, { method: "PUT", headers: { "content-length": "0", "content-range": `bytes */${size}` } });
      const range = probe.headers.get("range");
      offset = probe.status === 308 && range ? Number(range.split("-")[1]) + 1 : probe.status === 308 ? 0 : offset;
    }
  } finally {
    await fh.close();
  }
  throw new Error("Upload finito senza risposta di YouTube.");
}

async function setThumbnail(token: string, videoId: string, file: string): Promise<void> {
  const data = await readFile(file);
  if (data.length > 2 * 1024 * 1024) throw new Error(`Copertina ${path.basename(file)} sopra i 2 MB (${(data.length / 1048576).toFixed(1)} MB).`);
  const res = await fetch(`${UPLOAD}/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" },
    body: data,
  });
  if (!res.ok) throw new Error(`Copertina ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function addToPlaylist(token: string, videoId: string, playlistId: string): Promise<void> {
  await api(token, "POST", `${API}/playlistItems?part=snippet`, { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } });
}

async function update(token: string, videoId: string, job: Job): Promise<void> {
  // videos.update rewrites every mutable field of the parts it gets: start from what the video has now, then apply the job
  const cur = await api<{ items: { status: Record<string, unknown> }[] }>(token, "GET", `${API}/videos?part=status&id=${videoId}`);
  if (!cur.json.items.length) throw new Error(`Video ${videoId} non trovato sul canale.`);
  const { uploadStatus: _u, failureReason: _f, rejectionReason: _r, madeForKids: _m, ...keep } = cur.json.items[0].status;
  void _u; void _f; void _r; void _m;
  await api(token, "PUT", `${API}/videos?part=snippet,status`, { id: videoId, snippet: snippetOf(job), status: { ...keep, ...statusOf(job, false) } });
}

export async function main(argv: readonly string[]): Promise<void> {
  const dry = argv.includes("--dry-run");
  const args = argv.filter((a) => a !== "--dry-run");
  if (args[0] === "--whoami") return whoami(await getAccessToken());
  if (args[0] === "--latest") return latest(await getAccessToken());

  if (args[0] === "upload" && args[1]) {
    const { job, dir } = await readJob(args[1]);
    if (!job.file) throw new Error("Il job non ha \"file\".");
    const file = abs(dir, job.file);
    console.log(`video: ${file} (${((await stat(file)).size / 1048576).toFixed(0)} MB)`);
    console.log(`titolo: ${job.title}`);
    if (!job.audited) console.log("Progetto API non ancora approvato da Google: il video resta PRIVATO (regola di YouTube, non si sblocca dopo).");
    if (dry) return console.log("dry run: niente inviato.", JSON.stringify({ snippet: snippetOf(job), status: statusOf(job, !job.audited) }, null, 2));
    const token = await getAccessToken();
    const id = await insert(token, job, file);
    console.log(`video caricato: https://youtu.be/${id}`);
    if (job.thumbnail) {
      await setThumbnail(token, id, abs(dir, job.thumbnail));
      console.log("copertina impostata");
    }
    if (job.playlistId) await addToPlaylist(token, id, job.playlistId);
    return;
  }

  if (args[0] === "update" && args[1] && args[2]) {
    const { job, dir } = await readJob(args[2]);
    if (dry) return console.log("dry run: niente inviato.", JSON.stringify({ id: args[1], snippet: snippetOf(job), status: statusOf(job, false) }, null, 2));
    const token = await getAccessToken();
    await update(token, args[1], job);
    console.log(`metadati aggiornati: https://youtu.be/${args[1]} (${job.privacy}${job.publishAt ? `, esce il ${job.publishAt}` : ""})`);
    if (job.thumbnail) {
      await setThumbnail(token, args[1], abs(dir, job.thumbnail));
      console.log("copertina impostata");
    }
    if (job.playlistId) await addToPlaylist(token, args[1], job.playlistId);
    return;
  }

  console.log("uso: pnpm yt:publish --whoami | --latest | upload <job.json> | update <videoId> <job.json> [--dry-run]");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

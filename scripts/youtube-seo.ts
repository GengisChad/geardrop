import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/**
 * Writes the channel's SEO metadata through the YouTube Data API v3, so two dozen
 * video descriptions and the channel keywords stop being a manual afternoon in Studio.
 *
 * The plan file is the source of truth and the API is only made to match it. Two API
 * facts shape the whole design:
 *
 *  - `videos.update` OVERWRITES every mutable property of the parts it is sent. A
 *    request carrying only a description wipes the title and the category with it. So
 *    every video is read first and its snippet resent whole, with only planned fields
 *    changed.
 *  - `channels.update` does the same to `brandingSettings`, so the existing branding is
 *    read and merged rather than replaced.
 *
 * The appended commerce block is delimited by a marker: a re-run replaces the previous
 * block instead of stacking a second copy underneath it.
 *
 * Dry run by default; nothing is written without `--apply`.
 *
 *   pnpm yt:seo --list          print id, views and title for every upload
 *   pnpm yt:seo --backup        save the channel and every snippet as they are now
 *   pnpm yt:seo                 preview every change, video by video
 *   pnpm yt:seo --apply         write them to the channel
 *   pnpm yt:seo --channel-only  touch only the channel branding
 *   pnpm yt:seo --videos-only   touch only the videos
 *   pnpm yt:seo --plan=<file>   read a plan other than the default
 *
 * Quota: videos.update and channels.update cost 50 units each, reads cost 1, and the
 * daily allowance is 10,000 — 25 videos plus the channel is about 1,300 units.
 */

const API = "https://www.googleapis.com/youtube/v3";
const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/youtube";

const SECRETS_DIR = path.join(process.cwd(), ".secrets");
const CLIENT_FILE = path.join(SECRETS_DIR, "youtube-oauth.json");
const TOKEN_FILE = path.join(SECRETS_DIR, "youtube-token.json");
const DEFAULT_PLAN = path.join(process.cwd(), "output", "ads", "youtube-seo-plan.json");

/**
 * The block we append is fenced by this line, top and bottom. Everything from the first
 * occurrence down belongs to us and is rewritten on every run, so re-running replaces
 * the block instead of stacking a second copy under it.
 */
const BLOCK_MARKER = "— — — — — — — — — — — — — — — — —";

/** API limits, checked here so a rejected request never costs 50 units. */
export const LIMITS = {
  channelTitle: 30,
  channelDescription: 1000,
  channelKeywords: 500,
  videoTitle: 100,
  videoDescription: 5000,
  videoTagsTotal: 500,
} as const;

// ---------------------------------------------------------------- plan

const planSchema = z.object({
  channel: z
    .object({
      /**
       * The API documents this field as writable and then ignores it: the channel's name
       * follows the Google account, not the channel, so only Studio changes it. Setting it
       * here costs 50 units and reports a difference that never goes away.
       */
      title: z.string().max(LIMITS.channelTitle).optional(),
      description: z.string().max(LIMITS.channelDescription).optional(),
      /** Space-separated over the wire; written here as a list and joined with quoting. */
      keywords: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  /** Appended under the marker to every video description. */
  block: z.string().optional(),
  /** Added to every video's tags, on top of whatever it already carries. */
  tags: z.array(z.string().min(1)).default([]),
  /**
   * Videos that already carry at least this many tags are left alone.
   *
   * A few of these videos have a hand-picked set of twenty-odd tags; piling generic ones
   * on top dilutes a list that is already precise, which is the opposite of the point.
   * The ones worth filling are the ones sitting at zero.
   */
  tagFloor: z.number().int().min(0).default(12),
  /** Per-video overrides, keyed by video id. */
  videos: z
    .record(
      z.string(),
      z.object({
        title: z.string().max(LIMITS.videoTitle).optional(),
        /** Replaces the text above the marker. Omit to keep what is there. */
        description: z.string().optional(),
        /** Replaces the shared block for this video, for the ones showing a named product. */
        block: z.string().optional(),
        tags: z.array(z.string().min(1)).optional(),
      }),
    )
    .default({}),
});

export type Plan = z.infer<typeof planSchema>;

export function parsePlan(raw: string): Plan {
  return planSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------- pure helpers

/**
 * A tag containing a space counts its surrounding quotes against the 500-character
 * budget, which is how YouTube measures it; mirroring that here keeps us from sending a
 * list the API would reject.
 */
export function tagsLength(tags: readonly string[]): number {
  if (tags.length === 0) return 0;
  return tags.reduce((total, tag) => total + (tag.includes(" ") ? tag.length + 2 : tag.length) + 1, 0) - 1;
}

/** Merge planned tags into the existing ones, case-insensitively, stopping at the limit. */
export function mergeTags(existing: readonly string[], extra: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [...existing, ...extra]) {
    const tag = candidate.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    if (tagsLength([...out, tag]) > LIMITS.videoTagsTotal) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** The description with our block stripped off: what the owner actually wrote. */
export function ownText(description: string): string {
  const index = description.indexOf(BLOCK_MARKER);
  return (index === -1 ? description : description.slice(0, index)).trimEnd();
}

/**
 * Rebuild a description: the owner's text, then our fenced block, exactly once.
 *
 * `{{id}}` in the block becomes the video id, which gives every link a distinct
 * `utm_content` without anyone inventing a slug per video.
 */
export function composeDescription(
  current: string,
  planned: string | undefined,
  block: string | undefined,
  videoId: string,
): string {
  const head = (planned ?? ownText(current)).trimEnd();
  if (!block) return head.slice(0, LIMITS.videoDescription);
  const filled = block.trim().replaceAll("{{id}}", videoId);
  const body = `${BLOCK_MARKER}\n${filled}\n${BLOCK_MARKER}`;
  // Most of these videos have no description at all; opening one with two blank lines
  // would put the shop below a gap the viewer has to scroll past for nothing.
  return (head ? `${head}\n\n${body}` : body).slice(0, LIMITS.videoDescription);
}

/** Keywords go over the wire space-separated, with multi-word phrases quoted. */
export function encodeKeywords(keywords: readonly string[]): string {
  const encoded = keywords.map((word) => (word.includes(" ") ? `"${word}"` : word)).join(" ");
  if (encoded.length > LIMITS.channelKeywords) {
    throw new Error(`Channel keywords are ${encoded.length} characters; the API allows ${LIMITS.channelKeywords}.`);
  }
  return encoded;
}

// ---------------------------------------------------------------- oauth

type ClientSecrets = { readonly client_id: string; readonly client_secret: string };

async function readClientSecrets(): Promise<ClientSecrets> {
  let raw: string;
  try {
    raw = await readFile(CLIENT_FILE, "utf8");
  } catch {
    throw new Error(
      `Manca ${CLIENT_FILE}.\n` +
        "Crea un progetto su Google Cloud, abilita YouTube Data API v3, crea un client OAuth di tipo " +
        '"App desktop" e salva lì il JSON scaricato.',
    );
  }
  const parsed = JSON.parse(raw) as Record<string, ClientSecrets | undefined>;
  const client = parsed.installed ?? parsed.web;
  if (!client?.client_id || !client.client_secret) throw new Error(`${CLIENT_FILE} non è un file di client OAuth Google.`);
  return client;
}

function openBrowser(url: string): void {
  // Best effort: the URL is printed as well, so a failure here is not fatal.
  try {
    const [command, args] =
      process.platform === "win32"
        ? (["cmd", ["/c", "start", "", url]] as const)
        : process.platform === "darwin"
          ? (["open", [url]] as const)
          : (["xdg-open", [url]] as const);
    spawn(command, [...args], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* the printed URL is the fallback */
  }
}

/**
 * A one-shot loopback listener for the ?code= Google redirects back to. The port has to
 * be known before the consent URL is built, so the server is started first and its
 * address read back.
 */
function startLoopback(expectedState: string): Promise<{ redirectUri: string; code: Promise<string> }> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCode: (value: string) => void;
    let rejectCode: (reason: Error) => void;
    const code = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
        response.writeHead(404).end();
        return;
      }
      const received = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const state = url.searchParams.get("state");
      const ok = Boolean(received) && state === expectedState;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><meta charset="utf-8"><body style="font:16px/1.6 system-ui;padding:3rem;background:#0b0b10;color:#f5f5f7">${
          ok ? "Autorizzazione completata. Puoi chiudere questa scheda." : "Autorizzazione non riuscita."
        }</body>`,
      );
      server.close();
      if (error) rejectCode(new Error(`Google ha risposto "${error}".`));
      else if (!received) rejectCode(new Error("Google non ha restituito un codice di autorizzazione."));
      else if (state !== expectedState) rejectCode(new Error("State non corrispondente sul redirect OAuth: interrotto."));
      else resolveCode(received);
    });

    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolveServer({ redirectUri: `http://127.0.0.1:${address.port}`, code });
    });
  });
}

async function postToken(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const response = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Token endpoint ${response.status}: ${JSON.stringify(json)}`);
  return json as { access_token: string; refresh_token?: string };
}

/** The cached refresh token if there is one, otherwise the consent flow, once. */
async function getAccessToken(): Promise<string> {
  const client = await readClientSecrets();

  try {
    const cached = JSON.parse(await readFile(TOKEN_FILE, "utf8")) as { refresh_token?: string };
    if (cached.refresh_token) {
      const refreshed = await postToken({
        client_id: client.client_id,
        client_secret: client.client_secret,
        refresh_token: cached.refresh_token,
        grant_type: "refresh_token",
      });
      return refreshed.access_token;
    }
  } catch {
    /* no usable cache: fall through to consent */
  }

  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const { redirectUri, code } = await startLoopback(state);

  const consent = new URL(OAUTH_AUTH);
  consent.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // Offline plus an explicit prompt is what makes Google hand back a refresh token.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  console.log("\nAutorizza l'accesso al canale nel browser che si sta aprendo.");
  console.log(`Se non si apre, incolla questo indirizzo:\n${consent.toString()}\n`);
  openBrowser(consent.toString());

  const tokens = await postToken({
    client_id: client.client_id,
    client_secret: client.client_secret,
    code: await code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  if (tokens.refresh_token) {
    await mkdir(SECRETS_DIR, { recursive: true });
    await writeFile(TOKEN_FILE, `${JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2)}\n`, "utf8");
    console.log(`Token salvato in ${TOKEN_FILE} — le prossime esecuzioni non chiedono più nulla.\n`);
  }
  return tokens.access_token;
}

// ---------------------------------------------------------------- api

type VideoSnippet = {
  title: string;
  description: string;
  categoryId: string;
  tags?: string[];
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
};

type BrandingChannel = Record<string, unknown> & { title?: string; description?: string; keywords?: string };

async function call<T>(token: string, method: "GET" | "PUT", resource: string, query: Record<string, string>, body?: unknown): Promise<T> {
  const url = new URL(`${API}/${resource}`);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await response.json()) as T & { error?: { message?: string; errors?: { reason?: string }[] } };
  if (!response.ok) {
    const reason = json.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded") throw new Error("Quota YouTube esaurita per oggi. Riprendi domani: il piano è già salvato.");
    throw new Error(`${method} ${resource} ${response.status}${reason ? ` (${reason})` : ""}: ${json.error?.message ?? ""}`);
  }
  return json;
}

type ChannelResource = {
  id: string;
  contentDetails: { relatedPlaylists: { uploads: string } };
  brandingSettings: { channel?: BrandingChannel };
};

async function fetchChannel(token: string): Promise<ChannelResource> {
  const result = await call<{ items?: ChannelResource[] }>(token, "GET", "channels", {
    part: "id,contentDetails,brandingSettings",
    mine: "true",
  });
  const channel = result.items?.[0];
  if (!channel) throw new Error("Nessun canale su questo account. Hai autorizzato con l'account proprietario del canale?");
  return channel;
}

/** Every upload id, 50 per page, 1 quota unit per page. */
async function fetchUploadIds(token: string, playlistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await call<{ items?: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(token, "GET", "playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.items ?? []) ids.push(item.contentDetails.videoId);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

/** Snippets for up to 50 ids per call, so reading the whole channel costs almost nothing. */
async function fetchSnippets(token: string, ids: readonly string[]): Promise<Map<string, VideoSnippet>> {
  const out = new Map<string, VideoSnippet>();
  for (let index = 0; index < ids.length; index += 50) {
    const page = await call<{ items?: { id: string; snippet: VideoSnippet }[] }>(token, "GET", "videos", {
      part: "snippet",
      id: ids.slice(index, index + 50).join(","),
    });
    for (const item of page.items ?? []) out.set(item.id, item.snippet);
  }
  return out;
}

/** Id, title and view count for every upload: what `--list` prints to build a plan from. */
async function fetchVideoRows(token: string, ids: readonly string[]): Promise<{ id: string; title: string; views: number }[]> {
  const rows: { id: string; title: string; views: number }[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const page = await call<{ items?: { id: string; snippet: { title: string }; statistics: { viewCount?: string } }[] }>(
      token,
      "GET",
      "videos",
      { part: "snippet,statistics", id: ids.slice(index, index + 50).join(",") },
    );
    for (const item of page.items ?? []) {
      rows.push({ id: item.id, title: item.snippet.title, views: Number(item.statistics.viewCount ?? 0) });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- planning

export type VideoChange = {
  readonly id: string;
  readonly before: VideoSnippet;
  readonly after: VideoSnippet;
  readonly fields: readonly string[];
};

/** What would change for one video, or null when the API already matches the plan. */
export function planVideo(id: string, snippet: VideoSnippet, plan: Plan): VideoChange | null {
  const override = plan.videos[id];
  const existing = snippet.tags ?? [];
  const extra = existing.length >= plan.tagFloor ? [] : [...plan.tags, ...(override?.tags ?? [])];
  const after: VideoSnippet = {
    ...snippet,
    title: override?.title ?? snippet.title,
    description: composeDescription(snippet.description, override?.description, override?.block ?? plan.block, id),
    tags: mergeTags(existing, extra),
  };
  const fields: string[] = [];
  if (after.title !== snippet.title) fields.push("titolo");
  if (after.description !== snippet.description) fields.push("descrizione");
  if ((after.tags ?? []).join("\u0000") !== (snippet.tags ?? []).join("\u0000")) fields.push("tag");
  return fields.length ? { id, before: snippet, after, fields } : null;
}

// ---------------------------------------------------------------- reporting

const clip = (value: string, length = 280) => (value.length > length ? `${value.slice(0, length)}…` : value);
const indent = (value: string) => value.split("\n").map((line) => `    ${line}`).join("\n");

function reportVideo(change: VideoChange): void {
  console.log(`\n  ${change.id}  —  ${change.before.title}`);
  console.log(`  cambia: ${change.fields.join(", ")}`);
  if (change.fields.includes("titolo")) console.log(`    titolo: "${change.before.title}" → "${change.after.title}"`);
  if (change.fields.includes("descrizione")) {
    console.log("    descrizione, prima:");
    console.log(indent(clip(change.before.description) || "(vuota)"));
    console.log("    descrizione, dopo:");
    console.log(indent(clip(change.after.description)));
  }
  if (change.fields.includes("tag")) {
    console.log(`    tag prima (${(change.before.tags ?? []).length}): ${(change.before.tags ?? []).join(", ") || "(nessuno)"}`);
    console.log(`    tag dopo  (${(change.after.tags ?? []).length}): ${(change.after.tags ?? []).join(", ")}`);
  }
}

// ---------------------------------------------------------------- main

export async function main(argv: readonly string[]): Promise<void> {
  const apply = argv.includes("--apply");
  const channelOnly = argv.includes("--channel-only");
  const videosOnly = argv.includes("--videos-only");
  const planFile = argv.find((arg) => arg.startsWith("--plan="))?.slice("--plan=".length) ?? DEFAULT_PLAN;

  // Everything this script writes overwrites what is there, so the state it is about to
  // replace gets written to disk first: a restore is then an ordinary plan file.
  if (argv.includes("--backup")) {
    const token = await getAccessToken();
    const channel = await fetchChannel(token);
    const ids = await fetchUploadIds(token, channel.contentDetails.relatedPlaylists.uploads);
    const snippets = await fetchSnippets(token, ids);
    const file = argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length) ?? "youtube-backup.json";
    await writeFile(
      file,
      `${JSON.stringify(
        {
          channelId: channel.id,
          brandingSettings: channel.brandingSettings,
          videos: Object.fromEntries([...snippets].map(([id, snippet]) => [id, snippet])),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`Salvato lo stato di ${snippets.size} video e del canale in ${file}`);
    return;
  }

  // `--list` needs no plan: it is how the ids that go into one are discovered.
  if (argv.includes("--list")) {
    const token = await getAccessToken();
    const channel = await fetchChannel(token);
    const ids = await fetchUploadIds(token, channel.contentDetails.relatedPlaylists.uploads);
    const rows = await fetchVideoRows(token, ids);
    rows.sort((a, b) => b.views - a.views);
    console.log(`\n${rows.length} video, dal più visto:\n`);
    for (const row of rows) console.log(`${row.id}\t${String(row.views).padStart(7)}\t${row.title}`);
    console.log(`\nQuota consumata: circa ${2 + Math.ceil(ids.length / 50) * 2} unità su 10.000.`);
    return;
  }

  const plan = parsePlan(await readFile(planFile, "utf8"));
  console.log(`Piano: ${planFile}`);
  console.log(apply ? "Modalità: SCRITTURA (--apply)\n" : "Modalità: prova a vuoto — nessuna modifica verrà scritta.\n");

  const token = await getAccessToken();
  const channel = await fetchChannel(token);
  let units = 2;

  if (!videosOnly && plan.channel) {
    const current = channel.brandingSettings.channel ?? {};
    // channels.update replaces the whole brandingSettings part, so the existing values
    // are carried over and only the planned keys are overwritten.
    const after: BrandingChannel = {
      ...current,
      ...(plan.channel.title ? { title: plan.channel.title } : {}),
      ...(plan.channel.description ? { description: plan.channel.description } : {}),
      ...(plan.channel.keywords ? { keywords: encodeKeywords(plan.channel.keywords) } : {}),
    };
    const changed = (["title", "description", "keywords"] as const).filter((key) => after[key] !== current[key]);

    console.log("CANALE");
    if (changed.length === 0) console.log("  già allineato al piano.");
    for (const key of changed) {
      console.log(`  ${key}:`);
      console.log(indent(`prima: ${clip(String(current[key] ?? "(vuoto)"), 400)}`));
      console.log(indent(`dopo:  ${clip(String(after[key]), 400)}`));
    }

    if (apply && changed.length > 0) {
      await call(token, "PUT", "channels", { part: "brandingSettings" }, { id: channel.id, brandingSettings: { channel: after } });
      units += 50;
      console.log("  scritto.");
    }
  }

  if (!channelOnly) {
    const ids = await fetchUploadIds(token, channel.contentDetails.relatedPlaylists.uploads);
    const snippets = await fetchSnippets(token, ids);
    units += Math.ceil(ids.length / 50) * 2;

    const unknown = Object.keys(plan.videos).filter((id) => !snippets.has(id));
    if (unknown.length) console.log(`\nAttenzione: ${unknown.length} id nel piano non esistono sul canale: ${unknown.join(", ")}`);

    const changes = ids.flatMap((id) => {
      const snippet = snippets.get(id);
      const change = snippet ? planVideo(id, snippet, plan) : null;
      return change ? [change] : [];
    });

    console.log(`\nVIDEO — ${ids.length} caricati, ${changes.length} da aggiornare`);
    for (const change of changes) reportVideo(change);

    if (apply) {
      for (const [index, change] of changes.entries()) {
        // The whole snippet is resent: title and categoryId are required and anything
        // omitted from the part would be cleared.
        await call(token, "PUT", "videos", { part: "snippet" }, { id: change.id, snippet: change.after });
        units += 50;
        console.log(`  [${index + 1}/${changes.length}] ${change.id} aggiornato`);
      }
    }
  }

  console.log(`\nQuota consumata: circa ${units} unità su 10.000 giornaliere.`);
  if (!apply) console.log("Niente è stato scritto. Rilancia con --apply quando il risultato ti convince.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILE,
  explainStatus,
  selectSubmittableUrls,
  submitUrls,
} from "../src/lib/indexnow";
import { PRODUCTION_ORIGIN } from "../src/lib/site-url";

/**
 * Submits the shop's URLs to IndexNow, so Bing and Yandex come and crawl within hours instead
 * of finding the domain on their own. Google ignores the protocol; the sitemap in Search
 * Console covers that side.
 *
 * The URL list is read from the deployed sitemap rather than from the sitemap module, because
 * what matters is the pages that are actually live: submitting a URL that 404s is the one thing
 * that gets a host distrusted by the engines.
 *
 * Dry run by default; nothing is submitted without `--apply`.
 *
 *   pnpm seo:indexnow                     read the live sitemap and print what would be sent
 *   pnpm seo:indexnow --apply             submit every URL in the sitemap
 *   pnpm seo:indexnow --url=/prodotto/x --apply   submit single pages (repeatable, path or absolute)
 *   pnpm seo:indexnow --sitemap=<url>     read a sitemap other than production's
 *
 * Re-running is harmless: the protocol is a hint that a URL changed, and the engines dedupe.
 * Submitting the whole sitemap daily, though, is what rate limiting is for — use `--url=` for
 * the pages that actually changed and keep the full sweep for a deploy that touches everything.
 */

const DEFAULT_SITEMAP = new URL("/sitemap.xml", PRODUCTION_ORIGIN).toString();

/**
 * Node reports every network failure as a bare "fetch failed" and hides the reason — the DNS
 * error, the refused connection, the proxy, the certificate — one level down in `cause`. Printing
 * only the message turns a five-second diagnosis into a guess, so the whole chain is unwrapped.
 */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const chain = [error.message];
  let cause: unknown = error.cause;
  while (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    chain.push(code ? `${code}: ${cause.message}` : cause.message);
    cause = cause.cause;
  }
  return chain.join(" — ");
}

function readFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function readArg(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readAll(argv: readonly string[], name: string): readonly string[] {
  const prefix = `--${name}=`;
  return argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length));
}

/** Our own sitemap, so a regex over `<loc>` is enough and no XML parser is pulled in. */
function locations(xml: string): readonly string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!.trim());
}

async function fetchSitemap(url: string): Promise<readonly string[]> {
  const response = await fetch(url, { headers: { accept: "application/xml" } }).catch((error: unknown) => {
    throw new Error(`${url} could not be fetched — ${describe(error)}`);
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const urls = locations(await response.text());
  if (urls.length === 0) throw new Error(`${url} holds no <loc> entries`);
  return urls;
}

/**
 * The engines fetch the key file before they accept anything, so it is checked first: a 403
 * on a 47-URL submission is indistinguishable from a broken deploy, and this says which it is.
 */
async function keyFileIsLive(): Promise<{ ok: boolean; detail: string }> {
  const url = new URL(INDEXNOW_KEY_FILE, PRODUCTION_ORIGIN).toString();
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { ok: false, detail: `${url} answered ${response.status}` };
    const body = (await response.text()).trim();
    if (body !== INDEXNOW_KEY) return { ok: false, detail: `${url} holds "${body}", expected the key` };
    return { ok: true, detail: url };
  } catch (error) {
    return { ok: false, detail: `${url} could not be fetched: ${describe(error)}` };
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = readFlag(argv, "apply");
  const explicit = readAll(argv, "url");

  const raw = explicit.length
    ? explicit.map((url) => new URL(url, PRODUCTION_ORIGIN).toString())
    : await fetchSitemap(readArg(argv, "sitemap") ?? DEFAULT_SITEMAP);

  const { accepted, rejected } = selectSubmittableUrls(raw);
  for (const { url, reason } of rejected) console.warn(`skipped ${url} — ${reason}`);
  if (accepted.length === 0) throw new Error("no submittable URL");

  console.log(`${accepted.length} URL${accepted.length === 1 ? "" : "s"} for ${INDEXNOW_ENDPOINT}`);
  for (const url of accepted) console.log(`  ${url}`);

  const key = await keyFileIsLive();
  console.log(key.ok ? `key file live at ${key.detail}` : `key file NOT live — ${key.detail}`);

  if (!apply) {
    console.log("\ndry run: nothing submitted. Re-run with --apply.");
    return;
  }
  if (!key.ok) {
    throw new Error("refusing to submit: deploy the key file first, or the engines answer 403");
  }

  const results = await submitUrls(accepted);
  let failed = false;
  for (const result of results) {
    const line = `${result.urls} URLs → ${result.status} ${explainStatus(result.status)}`;
    if (result.ok) console.log(line);
    else {
      failed = true;
      console.error(`${line}${result.body ? `\n  ${result.body}` : ""}`);
    }
  }
  if (failed) throw new Error("at least one batch was refused");
}

main().catch((error: unknown) => {
  console.error(describe(error));
  process.exitCode = 1;
});

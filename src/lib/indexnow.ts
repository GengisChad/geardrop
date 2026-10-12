import { PRODUCTION_ORIGIN } from "@/lib/site-url";

/**
 * IndexNow: a ping that tells Bing, Yandex and the other engines on the protocol that a URL
 * exists or changed, instead of waiting for them to come back on their own. Google is not a
 * member — there the sitemap in Search Console stays the only lever — but on a domain with no
 * backlinks the Bing side is the one that can be crawled within hours, and the protocol is free.
 *
 * Ownership is proved by a key file at the site root: the engines fetch `/<key>.txt` and accept
 * the submission only if it holds the same key they were sent. The key is public by design, so
 * it lives here next to the file that serves it; if the two ever drift the engines answer 403
 * and nothing is submitted, which is why a unit test pins the constant to the file on disk.
 */
export const INDEXNOW_KEY = "11964181e904961a35a25699fbdcbe07";

/** Path of the key file the engines fetch to verify we own the host being submitted. */
export const INDEXNOW_KEY_FILE = `/${INDEXNOW_KEY}.txt`;

/** api.indexnow.org fans one submission out to every participating engine. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** The protocol's own ceiling for a single request. */
export const MAX_URLS_PER_SUBMISSION = 10_000;

/** The only host we can submit: a URL list mixing hosts is refused whole with a 422. */
export const INDEXNOW_HOST = new URL(PRODUCTION_ORIGIN).host;

export type IndexNowPayload = {
  readonly host: string;
  readonly key: string;
  readonly keyLocation: string;
  readonly urlList: readonly string[];
};

export type UrlSelection = {
  /** Deduplicated, in the order first seen, all on the production host. */
  readonly accepted: readonly string[];
  /** Everything dropped, with the reason, so a bad feed is visible instead of silent. */
  readonly rejected: readonly { readonly url: string; readonly reason: string }[];
};

/**
 * Splits a raw URL list into what IndexNow will accept and what it would reject. Done here
 * rather than letting the API judge because one off-host URL fails the entire batch, taking
 * the good URLs down with it.
 */
export function selectSubmittableUrls(urls: readonly string[]): UrlSelection {
  const accepted: string[] = [];
  const rejected: { url: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const raw of urls) {
    const url = raw.trim();
    if (!url) continue;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      rejected.push({ url, reason: "not a URL" });
      continue;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      rejected.push({ url, reason: `protocol ${parsed.protocol} is not crawlable` });
      continue;
    }
    if (parsed.host !== INDEXNOW_HOST) {
      rejected.push({ url, reason: `host ${parsed.host} is not ${INDEXNOW_HOST}` });
      continue;
    }
    if (seen.has(parsed.toString())) continue;
    seen.add(parsed.toString());
    accepted.push(parsed.toString());
  }

  return { accepted, rejected };
}

/** One request per `MAX_URLS_PER_SUBMISSION` URLs; the catalogue fits in one, the guard is for later. */
export function submissionBatches(urls: readonly string[]): readonly (readonly string[])[] {
  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_SUBMISSION) {
    batches.push(urls.slice(i, i + MAX_URLS_PER_SUBMISSION));
  }
  return batches;
}

export function indexNowPayload(urls: readonly string[]): IndexNowPayload {
  return {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: new URL(INDEXNOW_KEY_FILE, PRODUCTION_ORIGIN).toString(),
    urlList: urls,
  };
}

export type SubmissionResult = {
  readonly urls: number;
  readonly status: number;
  readonly ok: boolean;
  readonly body: string;
};

/**
 * What each status means, so a failure reads as an instruction instead of a number.
 * 200 accepted, 202 accepted with the key still to be verified — both are a success.
 */
export function explainStatus(status: number): string {
  switch (status) {
    case 200:
      return "accepted";
    case 202:
      return "accepted, key validation pending";
    case 400:
      return "bad request: the payload was malformed";
    case 403:
      return `key refused: ${INDEXNOW_KEY_FILE} is missing from production or holds a different key`;
    case 422:
      return "rejected: a URL does not belong to this host, or the key does not match it";
    case 429:
      return "rate limited: too many submissions, retry later";
    default:
      return `unexpected status ${status}`;
  }
}

/**
 * Posts every batch and reports each one. `fetchImpl` is injected so the unit tests can run
 * the whole path without a network, and so a caller can add its own timeout.
 */
export async function submitUrls(
  urls: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<readonly SubmissionResult[]> {
  const results: SubmissionResult[] = [];

  for (const batch of submissionBatches(urls)) {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload(batch)),
    });
    results.push({
      urls: batch.length,
      status: response.status,
      ok: response.status === 200 || response.status === 202,
      body: (await response.text()).trim(),
    });
  }

  return results;
}

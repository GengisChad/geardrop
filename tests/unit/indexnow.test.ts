import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILE,
  MAX_URLS_PER_SUBMISSION,
  explainStatus,
  indexNowPayload,
  selectSubmittableUrls,
  submissionBatches,
  submitUrls,
} from "@/lib/indexnow";

// Same stand-in as the sitemap's own test: the published meta months come from Supabase and
// this file is about which URLs can be submitted, not about what is in that table.
vi.mock("@/lib/storefront/meta-repository", () => ({
  getStorefrontMetaArchive: async () => [
    { month: "2026-10", title: "Meta ottobre 2026", publishedAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z" },
  ],
}));

describe("the IndexNow key file", () => {
  // The engines fetch this file and compare it byte for byte with the key they were sent.
  // An editor adding a trailing newline is enough to earn a 403, so the file is read raw.
  it("holds exactly the key the submission carries", () => {
    const onDisk = readFileSync(new URL(`../../public${INDEXNOW_KEY_FILE}`, import.meta.url), "utf8");
    expect(onDisk).toBe(INDEXNOW_KEY);
  });

  it("is named after the key, which is within the protocol's character set", () => {
    expect(INDEXNOW_KEY_FILE).toBe(`/${INDEXNOW_KEY}.txt`);
    expect(INDEXNOW_KEY).toMatch(/^[a-zA-Z0-9-]{8,128}$/);
  });
});

describe("selectSubmittableUrls", () => {
  it("keeps production URLs once each, in the order first seen", () => {
    const { accepted } = selectSubmittableUrls([
      "https://geardropshop.it/",
      "https://geardropshop.it/negozio",
      "https://geardropshop.it/",
    ]);
    expect(accepted).toEqual(["https://geardropshop.it/", "https://geardropshop.it/negozio"]);
  });

  it("drops anything off-host, because one foreign URL fails the whole batch", () => {
    const { accepted, rejected } = selectSubmittableUrls([
      "https://geardropshop.it/negozio",
      "https://geardrop-preview.vercel.app/negozio",
      "http://localhost:3000/negozio",
    ]);
    expect(accepted).toEqual(["https://geardropshop.it/negozio"]);
    expect(rejected.map((entry) => entry.reason)).toEqual([
      "host geardrop-preview.vercel.app is not geardropshop.it",
      "host localhost:3000 is not geardropshop.it",
    ]);
  });

  it("drops what no crawler can fetch", () => {
    const { accepted, rejected } = selectSubmittableUrls(["/negozio", "mailto:infogeardrop@gmail.com", "  "]);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([
      { url: "/negozio", reason: "not a URL" },
      { url: "mailto:infogeardrop@gmail.com", reason: "protocol mailto: is not crawlable" },
    ]);
  });
});

describe("the submission payload", () => {
  it("names the host and where the key can be verified", () => {
    const payload = indexNowPayload(["https://geardropshop.it/"]);
    expect(payload).toEqual({
      host: "geardropshop.it",
      key: INDEXNOW_KEY,
      keyLocation: `https://geardropshop.it${INDEXNOW_KEY_FILE}`,
      urlList: ["https://geardropshop.it/"],
    });
  });

  it("splits at the protocol's ceiling", () => {
    const urls = Array.from({ length: MAX_URLS_PER_SUBMISSION + 1 }, (_, i) => `https://geardropshop.it/p/${i}`);
    expect(submissionBatches(urls).map((batch) => batch.length)).toEqual([MAX_URLS_PER_SUBMISSION, 1]);
    expect(submissionBatches([])).toEqual([]);
  });
});

describe("submitUrls", () => {
  it("posts the payload as JSON and reads 202 as a success", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("", { status: 202 });
    }) as unknown as typeof fetch;

    const results = await submitUrls(["https://geardropshop.it/"], fakeFetch);

    expect(calls[0]?.url).toBe(INDEXNOW_ENDPOINT);
    expect(calls[0]?.body).toMatchObject({ host: "geardropshop.it", key: INDEXNOW_KEY });
    expect(results).toEqual([{ urls: 1, status: 202, ok: true, body: "" }]);
  });

  it("reports a refused key instead of pretending the URLs are queued", async () => {
    const fakeFetch = (async () => new Response("key not valid", { status: 403 })) as unknown as typeof fetch;
    const [result] = await submitUrls(["https://geardropshop.it/"], fakeFetch);
    expect(result).toMatchObject({ ok: false, status: 403, body: "key not valid" });
    expect(explainStatus(403)).toContain(INDEXNOW_KEY_FILE);
  });
});

describe("the sitemap feeds the submission", () => {
  it("has every one of its URLs accepted", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    const { accepted, rejected } = selectSubmittableUrls(urls);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(urls.length);
    expect(accepted.length).toBeGreaterThan(40);
  });
});

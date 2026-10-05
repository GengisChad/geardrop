import "server-only";

import { draftMode } from "next/headers";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import {
  getLatestSnapshotRow,
  getSnapshotRowByMonth,
  listArchive,
  listMetaVideos,
  listRankingRows,
  resolveSnapshot,
} from "@/lib/meta/repository";
import type { MetaArchiveItem, MetaSnapshot, MetaVideoRow } from "@/lib/meta/types";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cacheStorefrontRead, STOREFRONT_CACHE_TAGS } from "./cache";

/**
 * The storefront's door onto the META ATTUALE tables: cached public reads, with the same
 * draft-mode bypass the rest of the storefront uses so staff can look at a month before
 * it is published.
 *
 * The catalogue is attached outside the cache: it has its own, keyed on live stock, and a
 * tier list is of no use quoting a price that moved.
 */

async function previewClient() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  await requireStaffRole(client, ["owner", "admin", "editor"]);
  return client;
}

async function previewEnabled() {
  return (await draftMode()).isEnabled;
}

/**
 * A read that fails leaves the section empty instead of taking the page down.
 *
 * Migrations are applied by hand here, so there is a window between a deploy and the
 * tables existing in which every one of these queries fails. The shop is not broken in
 * that window — the meta simply has nothing to show yet, and that is what a visitor
 * should see. The error still goes to the server log so the gap is not silent.
 *
 * Only the public reads degrade. `src/lib/meta/repository.ts` still throws, because the
 * panel's job is to tell the owner when something is wrong.
 */
async function soft<T>(what: string, fallback: T, read: () => Promise<T>): Promise<T> {
  // A stalled database never throws, it just never answers; without a bound the section
  // would hold the whole page open instead of rendering empty.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("nessuna risposta entro 4 secondi")), 4_000);
  });
  try {
    return await Promise.race([read(), stalled]);
  } catch (error) {
    console.error(`[meta] ${what} non disponibile:`, error instanceof Error ? error.message : error);
    return fallback;
  } finally {
    // A read that answers in time must not leave the timer holding the process open.
    clearTimeout(timer);
  }
}

export async function getStorefrontMetaSnapshot(month?: string): Promise<MetaSnapshot | null> {
  // The mock storefront runs with no Supabase at all; /meta then shows its empty state
  // rather than failing the whole route on a missing environment variable.
  if (!hasPublicSupabaseEnv()) return null;

  const read = async (includeDrafts: boolean) => {
    const client = includeDrafts ? await previewClient() : createSupabasePublicClient();
    const snapshot = month
      ? await getSnapshotRowByMonth(client, month, { includeDrafts })
      : await getLatestSnapshotRow(client, { includeDrafts });
    if (!snapshot) return null;
    return { snapshot, rows: await listRankingRows(client, snapshot.id) };
  };

  return soft("il meta", null, async () => {
    const loaded = (await previewEnabled())
      ? await read(true)
      : await cacheStorefrontRead(["meta", month ?? "latest"], [STOREFRONT_CACHE_TAGS.meta], () => read(false));

    return loaded ? await resolveSnapshot(loaded.snapshot, loaded.rows) : null;
  });
}

export async function getStorefrontMetaVideos(): Promise<readonly MetaVideoRow[]> {
  if (!hasPublicSupabaseEnv()) return [];
  return soft<readonly MetaVideoRow[]>("i video del meta", [], async () => {
    if (await previewEnabled()) return listMetaVideos(await previewClient(), { includeDrafts: true });
    return cacheStorefrontRead(["meta", "videos"], [STOREFRONT_CACHE_TAGS.meta], () => listMetaVideos(createSupabasePublicClient()));
  });
}

export async function getStorefrontMetaArchive(): Promise<readonly MetaArchiveItem[]> {
  if (!hasPublicSupabaseEnv()) return [];
  return soft<readonly MetaArchiveItem[]>("l'archivio del meta", [], async () => {
    if (await previewEnabled()) return listArchive(await previewClient(), { includeDrafts: true });
    return cacheStorefrontRead(["meta", "archive"], [STOREFRONT_CACHE_TAGS.meta], () => listArchive(createSupabasePublicClient()));
  });
}

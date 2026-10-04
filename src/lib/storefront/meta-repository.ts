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

  const loaded = (await previewEnabled())
    ? await read(true)
    : await cacheStorefrontRead(["meta", month ?? "latest"], [STOREFRONT_CACHE_TAGS.meta], () => read(false));

  return loaded ? resolveSnapshot(loaded.snapshot, loaded.rows) : null;
}

export async function getStorefrontMetaVideos(): Promise<readonly MetaVideoRow[]> {
  if (!hasPublicSupabaseEnv()) return [];
  if (await previewEnabled()) return listMetaVideos(await previewClient(), { includeDrafts: true });
  return cacheStorefrontRead(["meta", "videos"], [STOREFRONT_CACHE_TAGS.meta], () => listMetaVideos(createSupabasePublicClient()));
}

export async function getStorefrontMetaArchive(): Promise<readonly MetaArchiveItem[]> {
  if (!hasPublicSupabaseEnv()) return [];
  if (await previewEnabled()) return listArchive(await previewClient(), { includeDrafts: true });
  return cacheStorefrontRead(["meta", "archive"], [STOREFRONT_CACHE_TAGS.meta], () => listArchive(createSupabasePublicClient()));
}

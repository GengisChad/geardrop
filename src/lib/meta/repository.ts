import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCommerceProvider } from "@/lib/commerce/provider";
import type { Product } from "@/lib/commerce/types";
import { storefrontOrganizationId } from "@/lib/org/storefront";
import {
  META_TIERS,
  type MetaArchiveItem,
  type MetaEntry,
  type MetaRankingRow,
  type MetaSnapshot,
  type MetaSnapshotRow,
  type MetaTier,
  type MetaVideoRow,
} from "@/lib/meta/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Reads for the META ATTUALE section. RLS is authoritative on what the public may see;
 * the explicit filters here only keep the payload small and let the admin pass
 * `includeDrafts` to look at a month it has not published yet.
 */

type Client = SupabaseClient<Database>;
type ReadOptions = { readonly includeDrafts?: boolean };

function published<T extends { eq(column: string, value: unknown): T }>(query: T, includeDrafts: boolean): T {
  return includeDrafts ? query : query.eq("publication_status", "published").eq("active", true);
}

/** The newest month, which is what `/meta` shows. */
export async function getLatestSnapshotRow(client: Client, { includeDrafts = false }: ReadOptions = {}): Promise<MetaSnapshotRow | null> {
  const query = client.from("meta_snapshots").select("*").eq("organization_id", await storefrontOrganizationId()).order("month", { ascending: false }).limit(1);
  const result = await published(query, includeDrafts);
  if (result.error) throw new Error("Impossibile caricare il meta");
  return result.data?.[0] ?? null;
}

export async function getSnapshotRowByMonth(client: Client, month: string, { includeDrafts = false }: ReadOptions = {}): Promise<MetaSnapshotRow | null> {
  const query = client.from("meta_snapshots").select("*").eq("organization_id", await storefrontOrganizationId()).eq("month", month).limit(1);
  const result = await published(query, includeDrafts);
  if (result.error) throw new Error("Impossibile caricare il meta");
  return result.data?.[0] ?? null;
}

export async function listRankingRows(client: Client, snapshotId: number): Promise<readonly MetaRankingRow[]> {
  const result = await client.from("meta_rankings").select("*").eq("snapshot_id", snapshotId).order("tier_type").order("rank");
  if (result.error) throw new Error("Impossibile caricare le classifiche");
  return result.data ?? [];
}

export async function listMetaVideos(client: Client, { includeDrafts = false }: ReadOptions = {}): Promise<readonly MetaVideoRow[]> {
  const query = client.from("meta_videos").select("*").eq("organization_id", await storefrontOrganizationId()).order("sort_order").order("id");
  const result = includeDrafts ? await query : await query.eq("active", true);
  if (result.error) throw new Error("Impossibile caricare i video");
  return result.data ?? [];
}

export async function listArchive(client: Client, { includeDrafts = false }: ReadOptions = {}): Promise<readonly MetaArchiveItem[]> {
  const query = client.from("meta_snapshots").select("month,title,published_at,updated_at").eq("organization_id", await storefrontOrganizationId()).order("month", { ascending: false });
  const result = await published(query, includeDrafts);
  if (result.error) throw new Error("Impossibile caricare l'archivio del meta");
  return (result.data ?? []).map((row) => ({
    month: row.month,
    title: row.title,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Attach the catalogue to the rankings and group them by tier.
 *
 * The lookup goes through the commerce provider rather than the products table, because
 * the catalogue is the storefront's source of truth and the provider is what puts live
 * stock on top of it. A slug the catalogue does not know simply resolves to null: to a
 * reader, a piece we cannot supply and a piece we never named are the same thing.
 */
export async function resolveSnapshot(snapshot: MetaSnapshotRow, rows: readonly MetaRankingRow[]): Promise<MetaSnapshot> {
  const slugs = [...new Set(rows.flatMap((row) => (row.product_slug ? [row.product_slug] : [])))];
  const commerce = await getCommerceProvider();
  const products = slugs.length ? await commerce.getProductsBySlugs(slugs) : [];
  // Keyed by plain string: the slug comes from the panel, and the catalogue's own slug
  // union cannot speak for what someone typed there last month.
  const bySlug = new Map<string, Product>(products.map((product) => [product.slug, product]));

  const entries = {} as Record<MetaTier, readonly MetaEntry[]>;
  for (const tier of META_TIERS) {
    entries[tier] = rows
      .filter((row) => row.tier_type === tier)
      .map((row): MetaEntry => ({ ...row, product: (row.product_slug ? bySlug.get(row.product_slug) : undefined) ?? null }));
  }

  return { ...snapshot, entries };
}

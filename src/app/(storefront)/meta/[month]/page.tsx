import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { MetaView } from "@/components/meta/meta-view";
import { META_TIERS, monthLabel, TIER_LABEL } from "@/lib/meta/types";
import { breadcrumbJsonLd, jsonLd, metaPageJsonLd } from "@/lib/seo";
import {
  getStorefrontMetaArchive,
  getStorefrontMetaSnapshot,
  getStorefrontMetaVideos,
} from "@/lib/storefront/meta-repository";

/** A month's permanent URL: what /meta showed when that month was current. */

type Params = { readonly params: Promise<{ readonly month: string }> };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { month } = await params;
  if (!MONTH.test(month)) return {};
  const snapshot = await getStorefrontMetaSnapshot(month);
  if (!snapshot) return {};
  const description =
    snapshot.seo_description ?? `Classifica Blade, Ratchet e Bit di Beyblade X per ${monthLabel(month)}. ${snapshot.source_note}`;
  return {
    title: snapshot.seo_title ?? snapshot.title,
    description,
    alternates: { canonical: `/meta/${month}` },
    openGraph: { type: "article", url: `/meta/${month}`, title: snapshot.title, description },
    twitter: { card: "summary_large_image" },
  };
}

export default async function MetaMonthPage({ params }: Params) {
  const { month } = await params;
  if (!MONTH.test(month)) notFound();

  const [snapshot, videos, archive] = await Promise.all([
    getStorefrontMetaSnapshot(month),
    getStorefrontMetaVideos(),
    getStorefrontMetaArchive(),
  ]);
  if (!snapshot) notFound();

  const breadcrumbData = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Meta attuale", path: "/meta" },
    { name: monthLabel(month), path: `/meta/${month}` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbData) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            metaPageJsonLd({
              path: `/meta/${month}`,
              title: snapshot.title,
              description: snapshot.source_note,
              datePublished: snapshot.published_at,
              dateModified: snapshot.updated_at,
              rankings: META_TIERS.map((tier) => ({
                tier: TIER_LABEL[tier],
                pieces: snapshot.entries[tier].map((entry) => entry.piece_name),
              })),
            }),
          ),
        }}
      />

      <CatalogHero
        title={snapshot.title}
        tagline={monthLabel(month)}
        description="La classifica di questo mese, com'era quando è uscita. Il meta corrente sta su /meta."
        crumbs={[{ label: "Home", href: "/" }, { label: "Meta attuale", href: "/meta" }, { label: monthLabel(month) }]}
      />

      <MetaView archive={archive} snapshot={snapshot} videos={videos} />
    </>
  );
}

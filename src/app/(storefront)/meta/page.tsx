import type { Metadata } from "next";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { MetaView } from "@/components/meta/meta-view";
import { META_TIERS, monthLabel, TIER_LABEL } from "@/lib/meta/types";
import { breadcrumbJsonLd, jsonLd, metaPageJsonLd } from "@/lib/seo";
import {
  getStorefrontMetaArchive,
  getStorefrontMetaSnapshot,
  getStorefrontMetaVideos,
} from "@/lib/storefront/meta-repository";

/**
 * /meta always shows the newest published month. The month keeps its own permanent URL
 * under /meta/<month>, so a link shared in October still shows October's list in March.
 */

const DESCRIPTION =
  "I migliori Blade, Ratchet e Bit di Beyblade X, aggiornati a ogni nuova classifica dai risultati dei tornei. Diciamo anche quali pezzi non vendiamo.";

export const metadata: Metadata = {
  title: "Meta attuale Beyblade X: i migliori Blade, Ratchet e Bit",
  description: DESCRIPTION,
  alternates: { canonical: "/meta" },
  openGraph: { type: "website", url: "/meta", title: "Meta attuale Beyblade X", description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default async function MetaPage() {
  const [snapshot, videos, archive] = await Promise.all([
    getStorefrontMetaSnapshot(),
    getStorefrontMetaVideos(),
    getStorefrontMetaArchive(),
  ]);

  const breadcrumbData = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Meta attuale", path: "/meta" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbData) }} />
      {snapshot ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(
              metaPageJsonLd({
                path: "/meta",
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
      ) : null}

      <CatalogHero
        title="Meta attuale"
        {...(snapshot ? { tagline: monthLabel(snapshot.month) } : {})}
        description={DESCRIPTION}
        crumbs={[{ label: "Home", href: "/" }, { label: "Meta attuale" }]}
      />

      {snapshot ? (
        <MetaView archive={archive} snapshot={snapshot} videos={videos} />
      ) : (
        <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
          <p className="max-w-2xl text-body text-grey-600">
            La prima classifica sta arrivando. Esce quando i dati del mese sono completi: meglio tardi che inventata.
          </p>
        </div>
      )}
    </>
  );
}

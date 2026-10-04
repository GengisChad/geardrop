import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { STOCK_CHIP, STOCK_LABEL } from "@/lib/labels";
import { META_TIERS, monthLabel, TIER_LABEL, TIER_LEAD, type MetaEntry, type MetaArchiveItem, type MetaSnapshot, type MetaVideoRow } from "@/lib/meta/types";

/**
 * The tier list as the reader meets it.
 *
 * The row that matters most is the one under a piece we do not stock. A tier list whose
 * every entry happens to be for sale reads as an advert, and the competitive audience it
 * is written for can tell; saying "non lo vendiamo" out loud is what makes the rest of
 * the page worth believing.
 */

function PieceRow({ entry }: { readonly entry: MetaEntry }) {
  return (
    <li className="gd-glass-card rounded-[--radius-glass] p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="gd-display-wide mt-0.5 shrink-0 text-[1.75rem] font-extrabold leading-none text-lime-ink"
        >
          {entry.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="gd-display-wide text-h4 font-extrabold leading-tight text-graphite">{entry.piece_name}</h3>
            <span className="rounded-full bg-violet/12 px-2.5 py-0.5 text-caption font-semibold text-violet">
              {entry.archetype}
            </span>
          </div>
          <p className="mt-2 text-small text-grey-600">{entry.reason}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
            {entry.product ? (
              <Link
                className="font-semibold text-violet underline-offset-4 hover:underline"
                href={`/prodotto/${entry.product.slug}`}
              >
                Lo trovi in {entry.product.name} — {formatPrice(entry.product.price)}
              </Link>
            ) : (
              <span className="text-grey-600">Non ce l&rsquo;abbiamo a catalogo.</span>
            )}
            {entry.product ? (
              <span className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${STOCK_CHIP[entry.product.stock]}`}>
                {STOCK_LABEL[entry.product.stock]}
              </span>
            ) : null}
            {entry.video_url ? (
              <a
                className="font-semibold text-graphite underline-offset-4 hover:underline"
                href={entry.video_url}
                rel="noopener"
                target="_blank"
              >
                Guarda il test
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function Tier({ tier, entries }: { readonly tier: (typeof META_TIERS)[number]; readonly entries: readonly MetaEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby={`meta-${tier}`} className="mt-12 first:mt-0">
      <h2 className="gd-display-wide text-h2 font-extrabold leading-tight text-graphite" id={`meta-${tier}`}>
        {TIER_LABEL[tier]}
      </h2>
      <p className="mt-2 max-w-2xl text-small text-grey-600">{TIER_LEAD[tier]}</p>
      <ul className="mt-5 grid gap-3">
        {entries.map((entry) => (
          <PieceRow entry={entry} key={entry.id} />
        ))}
      </ul>
    </section>
  );
}

function Videos({ videos }: { readonly videos: readonly MetaVideoRow[] }) {
  if (videos.length === 0) return null;
  return (
    <section aria-labelledby="meta-video" className="mt-16">
      <h2 className="gd-display-wide text-h2 font-extrabold leading-tight text-graphite" id="meta-video">
        Guarda i test
      </h2>
      <p className="mt-2 max-w-2xl text-small text-grey-600">
        Le classifiche qui sopra non escono da una tabella: sono pezzi provati in arena. Qui sotto i video dove li
        vedi girare.
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {videos.map((video) => (
          <li className="gd-glass-card rounded-[--radius-glass] p-4 sm:p-5" key={video.id}>
            <a
              className="gd-display-wide text-h4 font-extrabold leading-tight text-graphite underline-offset-4 hover:underline"
              href={video.youtube_url}
              rel="noopener"
              target="_blank"
            >
              {video.title}
            </a>
            {video.description ? <p className="mt-2 text-small text-grey-600">{video.description}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Archive({ archive, current }: { readonly archive: readonly MetaArchiveItem[]; readonly current: string }) {
  const others = archive.filter((item) => item.month !== current);
  if (others.length === 0) return null;
  return (
    <section aria-labelledby="meta-archivio" className="mt-16">
      <h2 className="gd-display-wide text-h3 font-extrabold leading-tight text-graphite" id="meta-archivio">
        I mesi precedenti
      </h2>
      <p className="mt-2 max-w-2xl text-small text-grey-600">
        Le classifiche vecchie restano online: il meta si capisce guardando come cambia.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {others.map((item) => (
          <li key={item.month}>
            <Link
              className="gd-glass-card inline-block rounded-full px-4 py-2 text-small font-semibold text-graphite hover:text-violet"
              href={`/meta/${item.month}`}
            >
              {monthLabel(item.month)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MetaView({
  snapshot,
  videos,
  archive,
}: {
  readonly snapshot: MetaSnapshot;
  readonly videos: readonly MetaVideoRow[];
  readonly archive: readonly MetaArchiveItem[];
}) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <p className="text-small text-grey-600">{snapshot.source_note}</p>
      {snapshot.intro ? <p className="mt-4 max-w-2xl text-body text-grey-600">{snapshot.intro}</p> : null}

      <div className="mt-10">
        {META_TIERS.map((tier) => (
          <Tier entries={snapshot.entries[tier]} key={tier} tier={tier} />
        ))}
      </div>

      <Videos videos={videos} />
      <Archive archive={archive} current={snapshot.month} />
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import {
  saveMetaRankingsAction,
  saveMetaSnapshotAction,
  saveMetaVideosAction,
  type MetaActionState,
} from "@/app/admin/actions/meta";
import type { MetaRankingRow, MetaSnapshotRow, MetaTier, MetaVideoRow } from "@/lib/meta/types";
import { META_TRENDS, TIER_LABEL, TREND_LABEL, TREND_MARK } from "@/lib/meta/types";
import styles from "@/components/admin/content/content.module.css";

const initialState: MetaActionState = { ok: false, message: "" };
const key = () => crypto.randomUUID();
const move = <T,>(items: T[], index: number, delta: -1 | 1): T[] => {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
};

function Feedback({ state }: { readonly state: MetaActionState }) {
  return state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null;
}

export function MetaSnapshotForm({ snapshot }: { readonly snapshot: MetaSnapshotRow | null }) {
  const [state, action, pending] = useActionState(saveMetaSnapshotAction, initialState);
  return (
    <form action={action} className={styles.panel}>
      <header>
        <div>
          <p>META / {snapshot ? snapshot.month : "nuovo mese"}</p>
          <h2>{snapshot ? snapshot.title : "Crea un mese"}</h2>
        </div>
      </header>
      {snapshot ? <input name="id" type="hidden" value={snapshot.id} /> : null}
      <div className={styles.grid}>
        <label>
          Periodo
          <input defaultValue={snapshot?.month ?? ""} name="month" placeholder="2026-10 per il mese, 2026-10-05 per la settimana" required />
        </label>
        <label>
          Titolo
          <input defaultValue={snapshot?.title ?? ""} maxLength={160} name="title" placeholder="Meta di ottobre 2026" required />
        </label>
        <label className={styles.wide}>
          Da dove vengono i dati
          <input
            defaultValue={snapshot?.source_note ?? ""}
            maxLength={400}
            name="sourceNote"
            placeholder="Podi top 3 di 153 tornei WBO, 31 agosto – 27 settembre 2026"
            required
          />
        </label>
        <label className={styles.wide}>
          Introduzione (facoltativa)
          <textarea defaultValue={snapshot?.intro ?? ""} maxLength={2000} name="intro" rows={4} />
        </label>
        <label>
          Stato
          <select defaultValue={snapshot?.publication_status ?? "draft"} name="publicationStatus">
            <option value="draft">Bozza</option>
            <option value="published">Pubblicato</option>
            <option value="archived">Archiviato</option>
          </select>
        </label>
        <label className={styles.check}>
          <input defaultChecked={snapshot?.active ?? false} name="active" type="checkbox" />
          Visibile sul sito
        </label>
        <label>
          Titolo SEO (max 70)
          <input defaultValue={snapshot?.seo_title ?? ""} maxLength={70} name="seoTitle" />
        </label>
        <label>
          Descrizione SEO (max 180)
          <input defaultValue={snapshot?.seo_description ?? ""} maxLength={180} name="seoDescription" />
        </label>
      </div>
      <p className={styles.hint}>
        Il mese resta invisibile finché non è «Pubblicato» <em>e</em> «Visibile». Le bozze le vedi solo tu.
      </p>
      <Feedback state={state} />
      <div className={styles.actions}>
        <button disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva il mese"}</button>
      </div>
    </form>
  );
}

type EditableEntry = {
  key: string;
  pieceName: string;
  archetype: string;
  reason: string;
  trend: string;
  productSlug: string;
  videoUrl: string;
};

const fromRow = (row: MetaRankingRow): EditableEntry => ({
  key: `db-${row.id}`,
  pieceName: row.piece_name,
  archetype: row.archetype,
  reason: row.reason,
  trend: row.trend ?? "",
  productSlug: row.product_slug ?? "",
  videoUrl: row.video_url ?? "",
});

export function MetaRankingEditor({
  snapshotId,
  tier,
  rows,
  catalogue,
}: {
  readonly snapshotId: number;
  readonly tier: MetaTier;
  readonly rows: readonly MetaRankingRow[];
  readonly catalogue: readonly { readonly slug: string; readonly name: string }[];
}) {
  const [entries, setEntries] = useState<EditableEntry[]>(() => rows.map(fromRow));
  const [state, action, pending] = useActionState(saveMetaRankingsAction, initialState);
  const update = (index: number, entry: EditableEntry) =>
    setEntries(entries.map((current, at) => (at === index ? entry : current)));

  const payload = JSON.stringify(
    entries.map(({ pieceName, archetype, reason, trend, productSlug, videoUrl }) => ({
      pieceName,
      archetype,
      reason,
      trend,
      productSlug,
      videoUrl,
    })),
  );

  return (
    <form action={action} className={styles.panel}>
      <input name="snapshotId" type="hidden" value={snapshotId} />
      <input name="tierType" type="hidden" value={tier} />
      <input name="entries" type="hidden" value={payload} />
      <header>
        <div>
          <p>CLASSIFICA</p>
          <h2>{TIER_LABEL[tier]}</h2>
        </div>
        <button
          onClick={() =>
            setEntries([...entries, { key: key(), pieceName: "", archetype: "", reason: "", trend: "", productSlug: "", videoUrl: "" }])
          }
          type="button"
        >
          + Voce
        </button>
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>Nessuna voce. La classifica non comparirà sul sito finché è vuota.</p>
      ) : (
        <div className={styles.itemList}>
          {entries.map((entry, index) => (
            <div className={styles.itemCard} key={entry.key}>
              <div className={styles.itemFields}>
                <label>
                  #{index + 1} Pezzo
                  <input
                    onChange={(event) => update(index, { ...entry, pieceName: event.target.value })}
                    placeholder="Es. Low Flat (LF)"
                    value={entry.pieceName}
                  />
                </label>
                <label>
                  Ruolo
                  <input
                    onChange={(event) => update(index, { ...entry, archetype: event.target.value })}
                    placeholder="Attacco / Stamina / Difesa"
                    value={entry.archetype}
                  />
                </label>
                <label className={styles.wide}>
                  Perché sta qui
                  <textarea
                    onChange={(event) => update(index, { ...entry, reason: event.target.value })}
                    rows={2}
                    value={entry.reason}
                  />
                </label>
                <label>
                  Tendenza
                  <select
                    onChange={(event) => update(index, { ...entry, trend: event.target.value })}
                    value={entry.trend}
                  >
                    <option value="">— nessuna —</option>
                    {META_TRENDS.map((trend) => (
                      <option key={trend} value={trend}>
                        {TREND_MARK[trend]} {TREND_LABEL[trend]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Dove si trova a catalogo
                  <input
                    list={`catalogo-${tier}`}
                    onChange={(event) => update(index, { ...entry, productSlug: event.target.value })}
                    placeholder="lascia vuoto se non lo vendiamo"
                    value={entry.productSlug}
                  />
                </label>
                <label>
                  Video del test (facoltativo)
                  <input
                    onChange={(event) => update(index, { ...entry, videoUrl: event.target.value })}
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={entry.videoUrl}
                  />
                </label>
              </div>
              <div className={styles.rowActions}>
                <button
                  aria-label={`Sposta ${entry.pieceName || "voce"} su`}
                  disabled={index === 0}
                  onClick={() => setEntries(move(entries, index, -1))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Sposta ${entry.pieceName || "voce"} giù`}
                  disabled={index === entries.length - 1}
                  onClick={() => setEntries(move(entries, index, 1))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  className={styles.danger}
                  onClick={() => setEntries(entries.filter((_, at) => at !== index))}
                  type="button"
                >
                  Rimuovi
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <datalist id={`catalogo-${tier}`}>
        {catalogue.map((product) => (
          <option key={product.slug} value={product.slug}>
            {product.name}
          </option>
        ))}
      </datalist>

      <p className={styles.hint}>
        La posizione nella lista è la posizione in classifica. Se un pezzo non è in nessuna delle nostre trottole, lascia
        vuoto il campo: la pagina scriverà che non ce l&rsquo;abbiamo, ed è giusto così.
      </p>
      <Feedback state={state} />
      <div className={styles.actions}>
        <button disabled={pending} type="submit">{pending ? "Salvataggio…" : `Salva ${TIER_LABEL[tier]}`}</button>
      </div>
    </form>
  );
}

type EditableVideo = { key: string; youtubeUrl: string; title: string; description: string; active: boolean };

export function MetaVideoEditor({ rows }: { readonly rows: readonly MetaVideoRow[] }) {
  const [videos, setVideos] = useState<EditableVideo[]>(() =>
    rows.map((row) => ({
      key: `db-${row.id}`,
      youtubeUrl: row.youtube_url,
      title: row.title,
      description: row.description ?? "",
      active: row.active,
    })),
  );
  const [state, action, pending] = useActionState(saveMetaVideosAction, initialState);
  const update = (index: number, video: EditableVideo) =>
    setVideos(videos.map((current, at) => (at === index ? video : current)));

  const payload = JSON.stringify(
    videos.map(({ youtubeUrl, title, description, active }) => ({ youtubeUrl, title, description, active })),
  );

  return (
    <form action={action} className={styles.panel}>
      <input name="videos" type="hidden" value={payload} />
      <header>
        <div>
          <p>META</p>
          <h2>Video dei test</h2>
        </div>
        <button
          onClick={() => setVideos([...videos, { key: key(), youtubeUrl: "", title: "", description: "", active: true }])}
          type="button"
        >
          + Video
        </button>
      </header>

      {videos.length === 0 ? (
        <p className={styles.empty}>Nessun video. La sezione non comparirà sul sito.</p>
      ) : (
        <div className={styles.itemList}>
          {videos.map((video, index) => (
            <div className={styles.itemCard} key={video.key}>
              <div className={styles.itemFields}>
                <label>
                  Titolo
                  <input onChange={(event) => update(index, { ...video, title: event.target.value })} value={video.title} />
                </label>
                <label>
                  Link YouTube
                  <input
                    onChange={(event) => update(index, { ...video, youtubeUrl: event.target.value })}
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={video.youtubeUrl}
                  />
                </label>
                <label className={styles.wide}>
                  Una riga di descrizione
                  <input
                    onChange={(event) => update(index, { ...video, description: event.target.value })}
                    value={video.description}
                  />
                </label>
                <label className={styles.check}>
                  <input
                    checked={video.active}
                    onChange={(event) => update(index, { ...video, active: event.target.checked })}
                    type="checkbox"
                  />
                  Visibile
                </label>
              </div>
              <div className={styles.rowActions}>
                <button
                  aria-label={`Sposta ${video.title || "video"} su`}
                  disabled={index === 0}
                  onClick={() => setVideos(move(videos, index, -1))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Sposta ${video.title || "video"} giù`}
                  disabled={index === videos.length - 1}
                  onClick={() => setVideos(move(videos, index, 1))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  className={styles.danger}
                  onClick={() => setVideos(videos.filter((_, at) => at !== index))}
                  type="button"
                >
                  Rimuovi
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Feedback state={state} />
      <div className={styles.actions}>
        <button disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva i video"}</button>
      </div>
    </form>
  );
}

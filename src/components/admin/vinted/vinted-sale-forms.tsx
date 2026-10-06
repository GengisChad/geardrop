"use client";

import { useActionState, useState } from "react";
import { applyVintedSaleAction, dismissVintedSaleAction, type VintedActionState } from "@/app/admin/actions/vinted";
import styles from "@/components/admin/content/content.module.css";

const initial: VintedActionState = { ok: false, message: "" };

type Line = { readonly key: string; slug: string; quantity: number };
type Option = { readonly slug: string; readonly name: string; readonly stock: number | null };

function Feedback({ state }: { readonly state: VintedActionState }) {
  return state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null;
}

/**
 * Which pieces left with one Vinted sale. Prefilled with the reader's suggestion; for a
 * "Set di N articoli" it opens N empty rows, because the email never names them.
 */
export function PendingVintedSale({
  saleId,
  itemCount,
  suggested,
  options,
}: {
  readonly saleId: number;
  readonly itemCount: number;
  readonly suggested: readonly { readonly slug: string; readonly quantity: number }[];
  readonly options: readonly Option[];
}) {
  const [applyState, applyAction, applying] = useActionState(applyVintedSaleAction, initial);
  const [dismissState, dismissAction, dismissing] = useActionState(dismissVintedSaleAction, initial);
  const [lines, setLines] = useState<Line[]>(() => {
    const fromSuggestion = suggested.map((line) => ({ key: crypto.randomUUID(), slug: line.slug, quantity: line.quantity }));
    if (fromSuggestion.length > 0) return fromSuggestion;
    return Array.from({ length: Math.max(1, Math.min(itemCount, 10)) }, () => ({ key: crypto.randomUUID(), slug: "", quantity: 1 }));
  });
  const update = (key: string, patch: Partial<Omit<Line, "key">>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const chosen = lines.filter((line) => line.slug);
  const done = applyState.ok || dismissState.ok;

  return (
    <div className={styles.stack}>
      <form action={applyAction} className={styles.itemList}>
        <input name="saleId" type="hidden" value={saleId} />
        <input name="lines" type="hidden" value={JSON.stringify(chosen.map(({ slug, quantity }) => ({ slug, quantity })))} />
        {lines.map((line, index) => (
          <div className={styles.itemFields} key={line.key}>
            <label>
              Pezzo {index + 1}
              <select onChange={(event) => update(line.key, { slug: event.target.value })} value={line.slug}>
                <option value="">Scegli il prodotto…</option>
                {options.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.name}{option.stock === null ? "" : ` · ${option.stock} a magazzino`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantità
              <input
                max={50}
                min={1}
                onChange={(event) => update(line.key, { quantity: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })}
                type="number"
                value={line.quantity}
              />
            </label>
            <div className={styles.rowActions}>
              <button
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                type="button"
              >
                Togli
              </button>
            </div>
          </div>
        ))}
        <div className={styles.actions}>
          <button
            disabled={lines.length >= 20}
            onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), slug: "", quantity: 1 }])}
            type="button"
          >
            Aggiungi un pezzo
          </button>
          <button disabled={applying || done || chosen.length === 0} type="submit">
            {applying ? "Registrazione…" : "Registra e scala il magazzino"}
          </button>
        </div>
        <Feedback state={applyState} />
      </form>
      <form action={dismissAction} className={styles.actions}>
        <input name="saleId" type="hidden" value={saleId} />
        <input maxLength={1000} name="note" placeholder="Perché la scarti (facoltativo)" />
        <button disabled={dismissing || done} type="submit">{dismissing ? "…" : "Non è una vendita: scarta"}</button>
        <Feedback state={dismissState} />
      </form>
    </div>
  );
}

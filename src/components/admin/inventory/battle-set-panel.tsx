"use client";

import { useActionState } from "react";
import { countBattleSetAction, openBattleSetsAction, type BattleSetActionState } from "@/app/admin/actions/battle-sets";
import type { BattleSetView } from "@/lib/admin/battle-sets";
import styles from "./inventory.module.css";

const initial: BattleSetActionState = { ok: false, message: "" };

function Feedback({ state }: { readonly state: BattleSetActionState }) {
  return state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null;
}

/**
 * A Battle Set and its pieces. Selling a loose piece takes an opened one first and opens a sealed
 * set only when none is left; these two forms are for what the shelf cannot know by itself: a
 * batch opened in one go, and a count made by hand.
 */
export function BattleSetPanel({ set }: { readonly set: BattleSetView }) {
  const [openState, openAction, opening] = useActionState(openBattleSetsAction, initial);
  const [countState, countAction, counting] = useActionState(countBattleSetAction, initial);

  return (
    <section className={styles.panel}>
      <header>
        <h2>{set.name}: set aperti</h2>
        <span>
          {set.sealed} sigillati. Ogni pezzo si vende finché ce n&rsquo;è uno sciolto o un set da aprire.
        </span>
      </header>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Pezzo</th><th>Sciolti</th><th>Disponibili (sciolti + set sigillati)</th></tr></thead>
          <tbody>
            {set.pieces.map((piece) => (
              <tr key={piece.slug}>
                <td>{piece.name}</td>
                <td className={styles.numeric}>{piece.loose}</td>
                <td className={styles.numeric}>{piece.available}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={openAction} className={styles.adjustmentForm}>
        <header><p>Apertura</p><h2>Hai aperto dei set tutti insieme?</h2><span>I set scendono, i pezzi sciolti salgono. Quello che il sito può vendere non cambia.</span></header>
        <input name="setSlug" type="hidden" value={set.slug} />
        <label>Set aperti<input inputMode="numeric" max={Math.max(1, set.sealed)} min={1} name="count" required type="number" /></label>
        <button disabled={opening || set.sealed === 0} type="submit">{opening ? "Registrazione…" : "Registra apertura"}</button>
        <Feedback state={openState} />
      </form>

      <form action={countAction} className={styles.adjustmentForm}>
        <header><p>Conteggio fisico</p><h2>Quello che c&rsquo;è sullo scaffale</h2><span>Scrivi i numeri contati a mano: il magazzino e il sito ripartono da qui.</span></header>
        <input name="setSlug" type="hidden" value={set.slug} />
        <label>Set sigillati<input defaultValue={set.sealed} inputMode="numeric" min={0} name="sealed" required type="number" /></label>
        {set.pieces.map((piece) => (
          <label key={piece.slug}>
            {piece.name} sciolti
            <input defaultValue={piece.loose} inputMode="numeric" min={0} name={`loose:${piece.slug}`} required type="number" />
          </label>
        ))}
        <label className={styles.confirm}><input name="confirmed" required type="checkbox" />Confermo che sono i numeri contati</label>
        <button disabled={counting} type="submit">{counting ? "Salvataggio…" : "Salva il conteggio"}</button>
        <Feedback state={countState} />
      </form>
    </section>
  );
}

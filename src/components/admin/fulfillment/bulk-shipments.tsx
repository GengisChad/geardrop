"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createInpostShipmentsAction, type BulkShipmentState } from "@/app/admin/actions/orders";
import styles from "./fulfillment.module.css";

export type BulkShipmentRow = {
  readonly id: number;
  readonly orderNumber: string;
  readonly pieces: number;
  readonly destination: string;
  /** ready = can be shipped here; tracked = InPost shipment already made; the rest go from the order page. */
  readonly state: "ready" | "tracked" | "manual-locker" | "not-inpost" | "not-shippable";
  readonly trackingCode: string | null;
};

const initial: BulkShipmentState = { ok: false, message: "", results: [] };

const WHY: Record<Exclude<BulkShipmentRow["state"], "ready" | "tracked">, string> = {
  "manual-locker": "Locker scritto a mano dal cliente: sceglilo nella scheda dell'ordine.",
  "not-inpost": "Non va con InPost: spedisci dalla scheda dell'ordine.",
  "not-shippable": "Non è un ordine pagato da spedire.",
};

function labelsHref(ids: readonly number[], format: "a4" | "a6") {
  return `/admin/magazzino/etichette?ordini=${ids.join(",")}&formato=${format}`;
}

/**
 * The batch of "Spedizioni in blocco": one row per chosen order, compartment size and weight
 * for each, one click for all; then one PDF with every label, four per A4 sheet or one per A6.
 */
export function BulkShipments({ rows }: { readonly rows: readonly BulkShipmentRow[] }) {
  const [state, action, pending] = useActionState(createInpostShipmentsAction, initial);
  const results = new Map(state.results.map((result) => [result.orderId, result]));
  const ready = rows.filter((row) => row.state === "ready");
  const done = state.results.length > 0;
  const labelled = rows.filter((row) => row.state === "tracked" || results.get(row.id)?.trackingNumber).map((row) => row.id);

  return (
    <form action={action} className={styles.sheet}>
      <table className={styles.pickTable}>
        <thead>
          <tr>
            <th>Ordine</th>
            <th>Destinazione</th>
            <th className={styles.num}>Pezzi</th>
            <th>Vano</th>
            <th>Peso kg</th>
            <th>Esito</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const result = results.get(row.id);
            return (
              <tr key={row.id} data-testid="bulk-row">
                <td>
                  <Link href={`/admin/ordini/${row.id}`}>{row.orderNumber}</Link>
                </td>
                <td>{row.destination}</td>
                <td className={styles.num}>{row.pieces}</td>
                {row.state === "ready" ? (
                  <>
                    <td>
                      <input name="orderId" type="hidden" value={row.id} />
                      <select aria-label={`Vano ${row.orderNumber}`} defaultValue={row.pieces > 4 ? "B" : "A"} disabled={done} name={`size-${row.id}`}>
                        <option value="A">A · 8 cm</option>
                        <option value="B">B · 19 cm</option>
                        <option value="C">C · 41 cm</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Peso ${row.orderNumber}`}
                        defaultValue="1"
                        disabled={done}
                        inputMode="decimal"
                        max="25"
                        min="0.1"
                        name={`weight-${row.id}`}
                        step="0.1"
                        style={{ width: "5em" }}
                        type="number"
                      />
                    </td>
                  </>
                ) : (
                  <td colSpan={2}>—</td>
                )}
                <td>
                  {result ? (
                    <p className={styles.feedback} data-error={result.ok ? undefined : ""} role="status">
                      {result.message}
                    </p>
                  ) : row.state === "tracked" ? (
                    <span className={styles.badge} data-tone="active">Già creata · {row.trackingCode}</span>
                  ) : row.state === "ready" ? (
                    <span className={styles.badge}>Da creare</span>
                  ) : (
                    <span className={styles.badge} data-tone="warning">{WHY[row.state]}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={styles.printBar}>
        {ready.length > 0 && !done ? (
          <button className={styles.primary} disabled={pending} type="submit">
            {pending ? `Creo ${ready.length} spedizioni…` : `Crea ${ready.length} spedizioni InPost e avvisa i clienti`}
          </button>
        ) : null}
        {labelled.length > 0 ? (
          <>
            <a className={styles.secondary} href={labelsHref(labelled, "a4")} rel="noopener" target="_blank">
              Etichette su A4 (4 per foglio)
            </a>
            <a className={styles.secondary} href={labelsHref(labelled, "a6")} rel="noopener" target="_blank">
              Etichette A6 (stampante etichette)
            </a>
          </>
        ) : null}
        <Link className={styles.secondary} href="/admin/magazzino">
          Torna a Da spedire
        </Link>
      </div>
      {state.message ? (
        <p className={styles.feedback} data-error={state.ok ? undefined : ""} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

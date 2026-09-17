"use client";

import { useActionState } from "react";
import { sendRestockNoticesAction, type RestockNotifyActionState } from "@/app/admin/actions/inventory";
import type { RestockDemand } from "@/lib/admin/inventory-restock";
import styles from "./inventory.module.css";

type ProductDemandRow = RestockDemand & {
  readonly productName: string;
  readonly isPurchasable: boolean;
};

type RestockDemandPanelProps = {
  readonly rows: readonly ProductDemandRow[];
};

const initial: RestockNotifyActionState = { ok: false, message: "" };

function NotifyForm({ slug, name }: { slug: string; name: string }) {
  const [state, formAction, pending] = useActionState(sendRestockNoticesAction, initial);
  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="productSlug" value={slug} />
      <input type="hidden" name="productName" value={name} />
      <button type="submit" disabled={pending} className={styles.notifyButton}>
        {pending ? "Invio…" : "Avvisa chi aspetta"}
      </button>
      {state.message ? (
        <span className={state.ok ? styles.success : styles.error} role="status" style={{ marginLeft: 8 }}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

/** Shows pending restock notices and pre-order demand per product, with a "Avvisa" button. */
export function RestockDemandPanel({ rows }: RestockDemandPanelProps) {
  const relevant = rows.filter((row) => row.pendingNotices > 0 || row.preorderDemand > 0);

  return (
    <section className={styles.panel}>
      <header>
        <h2>Domanda in attesa</h2>
        <span>Avvisi email pendenti e pezzi in pre-ordine da evadere per prodotto.</span>
      </header>
      {relevant.length === 0 ? (
        <div className={styles.empty}>
          <p>Nessun avviso in attesa e nessun pre-ordine da evadere.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>In attesa di avviso</th>
                <th>Pre-ordini da evadere</th>
                <th>Azione</th>
              </tr>
            </thead>
            <tbody>
              {relevant.map((row) => (
                <tr key={row.productSlug}>
                  <td>{row.productName}</td>
                  <td className={styles.numeric}>
                    {row.pendingNotices > 0 ? (
                      <strong>{row.pendingNotices}</strong>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={styles.numeric}>
                    {row.preorderDemand > 0 ? (
                      <strong data-testid={`preorder-demand-${row.productSlug}`}>
                        {row.preorderDemand} {row.preorderDemand === 1 ? "pezzo" : "pezzi"}
                      </strong>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {row.isPurchasable && row.pendingNotices > 0 ? (
                      <NotifyForm slug={row.productSlug} name={row.productName} />
                    ) : row.pendingNotices > 0 ? (
                      <span className={styles.notifyDisabled}>
                        Disponibile prima di avvisare
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

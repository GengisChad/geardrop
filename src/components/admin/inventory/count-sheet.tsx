"use client";

import { useActionState, useMemo, useState } from "react";
import { applyStockCountAction, type StockCountState } from "@/app/admin/actions/stock-count";
import { stockCountPlan, type StockCountRow } from "@/lib/admin/stock-count";
import styles from "./inventory.module.css";

const initial: StockCountState = { ok: false, message: "", applied: [], problems: [] };

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/**
 * The count sheet: type what is on the shelf (blank = not counted), see the new stock and the
 * difference before applying, change the minimum stock in the same pass.
 */
export function CountSheet({ rows }: { readonly rows: readonly StockCountRow[] }) {
  const [counts, setCounts] = useState<ReadonlyMap<number, string>>(new Map());
  const [state, action, pending] = useActionState(applyStockCountAction, initial);
  const plan = useMemo(() => stockCountPlan(rows, counts), [rows, counts]);
  const changes = new Map(plan.changes.map((change) => [change.productId, change]));
  const problems = new Map([...plan.problems, ...state.problems].map((problem) => [problem.productId, problem.message]));
  const typed = [...counts.values()].filter((value) => value.trim() !== "").length;

  return (
    <form action={action} className={styles.panel}>
      <div className={styles.filters}>
        <span>
          {typed} contati · {plan.changes.length} da correggere · {plan.matching} già giusti
        </span>
        <button className={styles.notifyButton} disabled={pending || (plan.changes.length === 0 && typed === 0)} type="submit">
          {pending ? "Applico…" : plan.changes.length > 0 ? `Applica ${plan.changes.length} correzioni` : "Salva scorte minime"}
        </button>
      </div>
      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role="status">
          {state.message}
        </p>
      ) : null}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Prodotto</th>
              <th className={styles.numeric}>In vendita</th>
              <th className={styles.numeric}>In ordini da spedire</th>
              <th className={styles.numeric}>Sullo scaffale atteso</th>
              <th>Contati</th>
              <th className={styles.numeric}>Nuova giacenza</th>
              <th>Scorta minima</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const change = changes.get(row.productId);
              const problem = problems.get(row.productId);
              return (
                <tr data-testid="count-row" key={row.productId}>
                  <td>
                    {row.name}
                    <small className={styles.mono}>
                      {row.sku}
                      {row.active ? "" : " · non pubblicato"}
                      {row.manageStock ? "" : " · senza gestione stock"}
                    </small>
                  </td>
                  <td className={styles.numeric}>{row.stock}</td>
                  <td className={styles.numeric}>{row.onOrders || "—"}</td>
                  <td className={styles.numeric}>{row.stock + row.onOrders}</td>
                  <td>
                    <input
                      aria-label={`Contati ${row.name}`}
                      disabled={!row.manageStock}
                      inputMode="numeric"
                      min={0}
                      name={`count-${row.productId}`}
                      onChange={(event) => {
                        const next = new Map(counts);
                        next.set(row.productId, event.target.value);
                        setCounts(next);
                      }}
                      style={{ width: "6em" }}
                      type="number"
                      value={counts.get(row.productId) ?? ""}
                    />
                    {problem ? <small className={styles.error}>{problem}</small> : null}
                  </td>
                  <td className={styles.numeric}>
                    {change ? (
                      <strong>
                        {change.newStock} <small>({signed(change.delta)})</small>
                      </strong>
                    ) : (counts.get(row.productId) ?? "").trim() !== "" && !problem ? (
                      <small>giusto</small>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <input
                      aria-label={`Scorta minima ${row.name}`}
                      defaultValue={row.lowStockThreshold}
                      inputMode="numeric"
                      min={0}
                      name={`min-${row.productId}`}
                      style={{ width: "5em" }}
                      type="number"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}

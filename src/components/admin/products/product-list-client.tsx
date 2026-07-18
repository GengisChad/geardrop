"use client";

import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import { bulkProductAction } from "@/app/admin/actions/products";
import type { AdminCategory, AdminProductListItem } from "@/lib/admin/product-repository";
import styles from "./products.module.css";

const initialState = { ok: false, message: "" };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });

export function ProductListClient({ items, categories }: {
  readonly items: readonly AdminProductListItem[];
  readonly categories: readonly AdminCategory[];
}) {
  const [state, action, pending] = useActionState(bulkProductAction, initialState);
  return (
    <form action={action} className={styles.bulkForm}>
      <div className={styles.bulkBar}>
        <strong>Azioni selezione</strong>
        <select name="operation" aria-label="Azione multipla" defaultValue="publish">
          <option value="publish">Pubblica</option>
          <option value="draft">Sposta in bozza</option>
          <option value="archive">Archivia</option>
          <option value="category">Cambia categoria</option>
          <option value="tag">Aggiungi tag</option>
        </select>
        <select name="categoryId" aria-label="Categoria per azione multipla" defaultValue="">
          <option value="">Categoria…</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select name="tag" aria-label="Tag per azione multipla" defaultValue="novita">
          <option value="novita">Novità</option><option value="offerta">Offerta</option>
          <option value="limited">Limited</option><option value="esclusiva">Esclusiva</option>
        </select>
        <button disabled={pending} type="submit">{pending ? "Aggiorno…" : "Applica"}</button>
        <Link className={styles.secondaryButton} href="/admin/prodotti/export">Esporta CSV</Link>
      </div>
      {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.productTable}>
          <thead><tr>
            <th><span className="sr-only">Seleziona</span></th><th>Prodotto</th><th>SKU</th><th>Categoria</th>
            <th>Pubblicazione</th><th>Override</th><th>Stato effettivo</th><th>Stock reale</th><th>Acquistabile</th><th>Prezzo</th><th>Aggiornato</th><th>Azioni</th>
          </tr></thead>
          <tbody>
            {items.map((product) => (
              <tr key={product.id}>
                <td><input aria-label={`Seleziona ${product.name}`} name="productIds" type="checkbox" value={product.id} /></td>
                <td><div className={styles.productIdentity}>
                  <div className={styles.thumb}>{product.primaryImage ? <Image alt="" height={42} src={product.primaryImage} unoptimized width={42} /> : <span aria-hidden="true">{"//"}</span>}</div>
                  <div><strong>{product.name}</strong><span>/{product.slug}</span></div>
                </div></td>
                <td className={styles.mono}>{product.sku}</td><td>{product.categoryName}</td>
                <td><span className={styles.status} data-status={product.publication_status}>{product.publication_status}</span></td>
                <td>{product.availability_override ?? "Nessuno"}</td>
                <td><span className={styles.availability} data-status={product.stock_status}>{product.stock_status}</span></td>
                <td className={styles.numeric}>{product.stock_quantity}{product.is_low_stock ? <small>stock basso</small> : null}</td>
                <td><span className={styles.purchasable} data-enabled={String(product.is_purchasable)}>{product.is_purchasable ? "Sì" : "No"}</span></td>
                <td className={styles.numeric}>{money.format(product.price_cents / 100)}</td>
                <td><time dateTime={product.updated_at}>{date.format(new Date(product.updated_at))}</time></td>
                <td><Link className={styles.rowAction} href={`/admin/prodotti/${product.id}`}>Modifica</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <div className={styles.empty}><p>Nessun prodotto corrisponde ai filtri.</p><Link className={styles.primaryButton} href="/admin/prodotti/nuovo">Nuovo prodotto</Link></div> : null}
      </div>
    </form>
  );
}

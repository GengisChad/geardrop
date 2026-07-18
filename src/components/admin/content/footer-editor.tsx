"use client";

import { useActionState, useState } from "react";
import { saveFooterConfigurationAction } from "@/app/admin/actions/content";
import type { Footer } from "@/lib/content/types";
import styles from "./content.module.css";

const initialState = { ok: false, message: "" };
type Status = "draft" | "published" | "archived";
type Item = { key: string; id?: number; label: string; href: string; active: boolean };
type Column = { key: string; id?: number; columnKey: string; title: string; publicationStatus: Status; active: boolean; items: Item[] };
type Social = { key: string; id?: number; platformKey: string; label: string; href: string; publicationStatus: Status; active: boolean };
const newKey = () => crypto.randomUUID();
const move = <T,>(items: T[], index: number, delta: -1 | 1): T[] => { const target = index + delta; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target] as T, next[index] as T]; return next; };

export function FooterEditor({ footer }: { readonly footer: Footer }) {
  const [columns, setColumns] = useState<Column[]>(() => footer.columns.map((column) => ({
    key: `column-${column.id}`, id: column.id, columnKey: column.column_key, title: column.title,
    publicationStatus: column.publication_status, active: column.active,
    items: column.items.map((item) => ({ key: `item-${item.id}`, id: item.id, label: item.label, href: item.href, active: item.active })),
  })));
  const [socialLinks, setSocialLinks] = useState<Social[]>(() => footer.socialLinks.map((link) => ({
    key: `social-${link.id}`, id: link.id, platformKey: link.platform_key, label: link.label, href: link.href,
    publicationStatus: link.publication_status, active: link.active,
  })));
  const [state, action, pending] = useActionState(saveFooterConfigurationAction, initialState);
  const configuration = JSON.stringify({
    columns: columns.map(({ id, columnKey, title, publicationStatus, active, items }) => ({ id, key: columnKey, title, publicationStatus, active, items: items.map(({ id: itemId, label, href, active: itemActive }) => ({ id: itemId, label, href, active: itemActive })) })),
    socialLinks: socialLinks.map(({ id, platformKey, label, href, publicationStatus, active }) => ({ id, platformKey, label, href, publicationStatus, active })),
  });
  const updateColumn = (index: number, value: Column) => setColumns((current) => current.map((column, at) => at === index ? value : column));
  return <form action={action} className={styles.stack}>
    <input name="configuration" type="hidden" value={configuration} />
    <section className={styles.panel}>
      <header><div><p>FOOTER / STRUCTURE</p><h2>Colonne</h2></div><button onClick={() => setColumns([...columns, { key: newKey(), columnKey: `colonna-${columns.length + 1}`, title: "Nuova colonna", publicationStatus: "draft", active: false, items: [] }])} type="button">+ Colonna</button></header>
      {columns.length ? <div className={styles.itemList}>{columns.map((column, index) => <article className={styles.itemCard} key={column.key}>
        <div className={styles.itemFields}><label>Titolo<input onChange={(event) => updateColumn(index, { ...column, title: event.target.value })} value={column.title} /></label><label>Chiave<input onChange={(event) => updateColumn(index, { ...column, columnKey: event.target.value })} value={column.columnKey} /></label><label>Stato<select onChange={(event) => updateColumn(index, { ...column, publicationStatus: event.target.value as Status })} value={column.publicationStatus}><option value="draft">Bozza</option><option value="published">Pubblicata</option><option value="archived">Archiviata</option></select></label><label className={styles.check}><input checked={column.active} onChange={(event) => updateColumn(index, { ...column, active: event.target.checked })} type="checkbox" />Visibile</label></div>
        <div className={styles.rowActions}><button aria-label={`Sposta ${column.title} su`} disabled={index === 0} onClick={() => setColumns(move(columns, index, -1))} type="button">↑</button><button aria-label={`Sposta ${column.title} giù`} disabled={index === columns.length - 1} onClick={() => setColumns(move(columns, index, 1))} type="button">↓</button><button onClick={() => updateColumn(index, { ...column, items: [...column.items, { key: newKey(), label: "Nuovo link", href: "/", active: false }] })} type="button">+ Link</button><button className={styles.danger} onClick={() => setColumns(columns.filter((_, at) => at !== index))} type="button">Rimuovi</button></div>
        {column.items.length ? <div className={styles.nested}>{column.items.map((item, itemIndex) => <div className={styles.itemFields} key={item.key}><label>Etichetta<input onChange={(event) => updateColumn(index, { ...column, items: column.items.map((current, at) => at === itemIndex ? { ...item, label: event.target.value } : current) })} value={item.label} /></label><label>Link<input onChange={(event) => updateColumn(index, { ...column, items: column.items.map((current, at) => at === itemIndex ? { ...item, href: event.target.value } : current) })} value={item.href} /></label><label className={styles.check}><input checked={item.active} onChange={(event) => updateColumn(index, { ...column, items: column.items.map((current, at) => at === itemIndex ? { ...item, active: event.target.checked } : current) })} type="checkbox" />Visibile</label><div className={styles.rowActions}><button aria-label={`Sposta ${item.label} su`} disabled={itemIndex === 0} onClick={() => updateColumn(index, { ...column, items: move(column.items, itemIndex, -1) })} type="button">↑</button><button aria-label={`Sposta ${item.label} giù`} disabled={itemIndex === column.items.length - 1} onClick={() => updateColumn(index, { ...column, items: move(column.items, itemIndex, 1) })} type="button">↓</button><button className={styles.danger} onClick={() => updateColumn(index, { ...column, items: column.items.filter((_, at) => at !== itemIndex) })} type="button">Rimuovi</button></div></div>)}</div> : <p className={styles.empty}>Nessun link in questa colonna.</p>}
      </article>)}</div> : <p className={styles.empty}>Nessuna colonna nel database.</p>}
    </section>
    <section className={styles.panel}>
      <header><div><p>FOOTER / COMMUNITY</p><h2>Link social</h2></div><button onClick={() => setSocialLinks([...socialLinks, { key: newKey(), platformKey: `social-${socialLinks.length + 1}`, label: "Nuovo social", href: "https://", publicationStatus: "draft", active: false }])} type="button">+ Social</button></header>
      {socialLinks.length ? <div className={styles.itemList}>{socialLinks.map((link, index) => <div className={styles.itemCard} key={link.key}><div className={styles.itemFields}><label>Piattaforma<input onChange={(event) => setSocialLinks(socialLinks.map((current, at) => at === index ? { ...link, platformKey: event.target.value } : current))} value={link.platformKey} /></label><label>Etichetta<input onChange={(event) => setSocialLinks(socialLinks.map((current, at) => at === index ? { ...link, label: event.target.value } : current))} value={link.label} /></label><label>URL<input onChange={(event) => setSocialLinks(socialLinks.map((current, at) => at === index ? { ...link, href: event.target.value } : current))} value={link.href} /></label><label>Stato<select onChange={(event) => setSocialLinks(socialLinks.map((current, at) => at === index ? { ...link, publicationStatus: event.target.value as Status } : current))} value={link.publicationStatus}><option value="draft">Bozza</option><option value="published">Pubblicato</option><option value="archived">Archiviato</option></select></label><label className={styles.check}><input checked={link.active} onChange={(event) => setSocialLinks(socialLinks.map((current, at) => at === index ? { ...link, active: event.target.checked } : current))} type="checkbox" />Visibile</label></div><div className={styles.rowActions}><button aria-label={`Sposta ${link.label} su`} disabled={index === 0} onClick={() => setSocialLinks(move(socialLinks, index, -1))} type="button">↑</button><button aria-label={`Sposta ${link.label} giù`} disabled={index === socialLinks.length - 1} onClick={() => setSocialLinks(move(socialLinks, index, 1))} type="button">↓</button><button className={styles.danger} onClick={() => setSocialLinks(socialLinks.filter((_, at) => at !== index))} type="button">Rimuovi</button></div></div>)}</div> : <p className={styles.empty}>Nessun link social nel database.</p>}
    </section>
    {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
    <div className={styles.actions}><button disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva footer"}</button></div>
  </form>;
}

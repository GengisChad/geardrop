"use client";

import { useActionState, useState } from "react";
import { saveNavigationTreeAction } from "@/app/admin/actions/content";
import type { Navigation, NavigationItem } from "@/lib/content/types";
import styles from "./content.module.css";

const initialState = { ok: false, message: "" };
type EditableItem = { key: string; label: string; href: string; active: boolean; children: EditableItem[] };
type EditableMenu = { key: string; label: string; publicationStatus: "draft" | "published" | "archived"; active: boolean; items: EditableItem[] };
const key = () => crypto.randomUUID();
const itemFromRow = (item: NavigationItem): EditableItem => ({ key: `db-${item.id}`, label: item.label, href: item.href, active: item.active, children: item.children.map(itemFromRow) });
const fromMenu = (menu: Navigation | null, menuKey: "desktop" | "mobile"): EditableMenu => ({
  key: menuKey, label: menu?.label ?? (menuKey === "desktop" ? "Menu desktop" : "Menu mobile"),
  publicationStatus: menu?.publication_status ?? "draft", active: menu?.active ?? false,
  items: menu?.items.map(itemFromRow) ?? [],
});
const payloadItems = (items: EditableItem[]): unknown[] => items.map(({ label, href, active, children }) => ({ label, href, active, children: payloadItems(children) }));
const move = <T,>(items: T[], index: number, delta: -1 | 1): T[] => { const target = index + delta; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target] as T, next[index] as T]; return next; };

export function NavigationEditor({ desktop, mobile }: { readonly desktop: Navigation | null; readonly mobile: Navigation | null }) {
  return <div className={styles.stack}><MenuEditor initial={fromMenu(desktop, "desktop")} /><MenuEditor initial={fromMenu(mobile, "mobile")} /></div>;
}

function MenuEditor({ initial }: { readonly initial: EditableMenu }) {
  const [menu, setMenu] = useState(initial);
  const [state, action, pending] = useActionState(saveNavigationTreeAction, initialState);
  const updateItems = (items: EditableItem[]) => setMenu((current) => ({ ...current, items }));
  const tree = JSON.stringify({ menu: { key: menu.key, label: menu.label, publicationStatus: menu.publicationStatus, active: menu.active }, items: payloadItems(menu.items) });
  return <form action={action} className={styles.panel}>
    <input name="tree" type="hidden" value={tree} />
    <header><div><p>NAV / {menu.key}</p><h2>{menu.label}</h2></div><button onClick={() => updateItems([...menu.items, { key: key(), label: "Nuova voce", href: "/", active: false, children: [] }])} type="button">+ Voce</button></header>
    <div className={styles.grid}><label>Nome menu<input onChange={(event) => setMenu({ ...menu, label: event.target.value })} value={menu.label} /></label><label>Stato<select onChange={(event) => setMenu({ ...menu, publicationStatus: event.target.value as EditableMenu["publicationStatus"] })} value={menu.publicationStatus}><option value="draft">Bozza</option><option value="published">Pubblicato</option><option value="archived">Archiviato</option></select></label><label className={styles.check}><input checked={menu.active} onChange={(event) => setMenu({ ...menu, active: event.target.checked })} type="checkbox" />Visibile</label></div>
    {menu.items.length ? <ItemList items={menu.items} onChange={updateItems} /> : <p className={styles.empty}>Nessuna voce reale. Aggiungi la prima voce.</p>}
    {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
    <div className={styles.actions}><button disabled={pending} type="submit">{pending ? "Salvataggio…" : `Salva ${menu.key}`}</button></div>
  </form>;
}

function ItemList({ items, onChange, depth = 0 }: { readonly items: EditableItem[]; readonly onChange: (items: EditableItem[]) => void; readonly depth?: number }) {
  const update = (index: number, item: EditableItem) => onChange(items.map((current, at) => at === index ? item : current));
  return <div className={styles.itemList} data-depth={depth}>{items.map((item, index) => <div className={styles.itemCard} key={item.key}>
    <div className={styles.itemFields}><label>Etichetta<input onChange={(event) => update(index, { ...item, label: event.target.value })} value={item.label} /></label><label>Link<input onChange={(event) => update(index, { ...item, href: event.target.value })} value={item.href} /></label><label className={styles.check}><input checked={item.active} onChange={(event) => update(index, { ...item, active: event.target.checked })} type="checkbox" />Visibile</label></div>
    <div className={styles.rowActions}><button aria-label={`Sposta ${item.label} su`} disabled={index === 0} onClick={() => onChange(move(items, index, -1))} type="button">↑</button><button aria-label={`Sposta ${item.label} giù`} disabled={index === items.length - 1} onClick={() => onChange(move(items, index, 1))} type="button">↓</button>{depth < 2 ? <button onClick={() => update(index, { ...item, children: [...item.children, { key: key(), label: "Sottovoce", href: "/", active: false, children: [] }] })} type="button">+ Sottovoce</button> : null}<button className={styles.danger} onClick={() => onChange(items.filter((_, at) => at !== index))} type="button">Rimuovi</button></div>
    {item.children.length ? <ItemList depth={depth + 1} items={item.children} onChange={(children) => update(index, { ...item, children })} /> : null}
  </div>)}</div>;
}

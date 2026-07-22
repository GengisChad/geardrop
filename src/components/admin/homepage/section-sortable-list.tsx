"use client";

import { useActionState, useState } from "react";
import { reorderHomepageSectionsAction } from "@/app/admin/actions/content";
import type { HomepageSection } from "@/lib/content/types";
import styles from "./homepage.module.css";

const initialState = { ok: false, message: "" };

export function SectionSortableList({ sections, selectedId, onSelect }: {
  readonly sections: readonly HomepageSection[];
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
}) {
  const [state, action, pending] = useActionState(reorderHomepageSectionsAction, initialState);
  const [order, setOrder] = useState(() => sections.map((section) => section.id));
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const ordered = order.map((id) => sections.find((section) => section.id === id)).filter((section): section is HomepageSection => Boolean(section));
  const move = (id: number, delta: -1 | 1) => setOrder((current) => {
    const index = current.indexOf(id);
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target] as number, next[index] as number];
    return next;
  });
  const drop = (targetId: number) => {
    if (draggedId === null || draggedId === targetId) return;
    setOrder((current) => {
      const next = current.filter((id) => id !== draggedId);
      next.splice(next.indexOf(targetId), 0, draggedId);
      return next;
    });
    setDraggedId(null);
  };
  return <form action={action} className={styles.sortForm}>
    <div className={styles.sectionRail}>{ordered.map((section, index) => <article
      className={styles.sectionRow}
      data-selected={selectedId === section.id || undefined}
      draggable
      key={section.id}
      onDragEnd={() => setDraggedId(null)}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={() => setDraggedId(section.id)}
      onDrop={() => drop(section.id)}
    >
      <input name="sectionIds" type="hidden" value={section.id} />
      <span className={styles.position}>{String(index + 1).padStart(2, "0")}</span>
      <button className={styles.sectionIdentity} onClick={() => onSelect(section.id)} type="button"><strong>{section.title || section.section_key}</strong><small>{section.section_type} · {section.publication_status}</small></button>
      <div className={styles.reorderButtons}><button aria-label={`Sposta ${section.section_key} su`} disabled={index === 0} onClick={() => move(section.id, -1)} type="button">↑</button><button aria-label={`Sposta ${section.section_key} giù`} disabled={index === ordered.length - 1} onClick={() => move(section.id, 1)} type="button">↓</button></div>
    </article>)}</div>
    {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
    {sections.length > 0 ? <button className={styles.orderSave} disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva ordine homepage"}</button> : null}
  </form>;
}

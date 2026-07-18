"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { reorderCategoriesAction } from "@/app/admin/actions/categories";
import type { AdminCategoryListItem } from "@/lib/admin/category-repository";
import styles from "./catalog.module.css";

const initialState = { ok: false, message: "" };

export function CategoryOrderList({ items }: { readonly items: readonly AdminCategoryListItem[] }) {
  const [state, action, pending] = useActionState(reorderCategoriesAction, initialState);
  const [order, setOrder] = useState(() => items.map((item) => item.id));
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const ordered = order.map((id) => items.find((item) => item.id === id)).filter((item): item is AdminCategoryListItem => Boolean(item));

  const move = (id: number, delta: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(id);
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target] as number, next[index] as number];
      return next;
    });
  };
  const dropBefore = (targetId: number) => {
    if (draggedId === null || draggedId === targetId) return;
    setOrder((current) => {
      const next = current.filter((id) => id !== draggedId);
      next.splice(next.indexOf(targetId), 0, draggedId);
      return next;
    });
    setDraggedId(null);
  };

  if (items.length === 0) {
    return <section className={styles.empty}><strong>Nessuna categoria</strong><p>Database vuoto. Crea prima categoria catalogo.</p><Link href="/admin/categorie/nuova">Crea categoria</Link></section>;
  }

  return <form action={action} className={styles.orderForm}>
    <div className={styles.orderRail}>
      {ordered.map((category, index) => <article
        className={styles.orderCard}
        draggable
        key={category.id}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={() => setDraggedId(category.id)}
        onDrop={() => dropBefore(category.id)}
      >
        <input name="categoryIds" type="hidden" value={category.id} />
        <span className={styles.orderNumber}>{String(index + 1).padStart(2, "0")}</span>
        <div className={styles.mediaThumb}>{category.previewUrl ? <Image alt="" fill sizes="64px" src={category.previewUrl} unoptimized /> : <span>NO IMG</span>}</div>
        <div className={styles.cardIdentity}><strong>{category.name}</strong><span>/{category.slug}</span><small>{category.productCount} prodotti</small></div>
        <span className={styles.status} data-status={category.publication_status}>{category.publication_status}</span>
        <div className={styles.orderControls}>
          <button aria-label={`Sposta ${category.name} su`} disabled={index === 0} onClick={() => move(category.id, -1)} type="button">↑</button>
          <button aria-label={`Sposta ${category.name} giù`} disabled={index === ordered.length - 1} onClick={() => move(category.id, 1)} type="button">↓</button>
        </div>
        <Link href={`/admin/categorie/${category.id}`}>Modifica</Link>
      </article>)}
    </div>
    {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
    <div className={styles.saveRail}><span>Trascina righe o usa frecce. Ordine salvato solo su conferma.</span><button disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva ordine"}</button></div>
  </form>;
}


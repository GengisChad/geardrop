"use client";

import Link from "next/link";
import { useState } from "react";
import type { HomepageEditorResources, HomepageSection } from "@/lib/content/types";
import { SectionEditor } from "./section-editor";
import { SectionSortableList } from "./section-sortable-list";
import styles from "./homepage.module.css";

export function HomepageEditor({ sections, resources }: {
  readonly sections: readonly HomepageSection[];
  readonly resources: HomepageEditorResources;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(sections[0]?.id ?? null);
  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const nextOrder = sections.length ? Math.max(...sections.map((section) => section.sort_order)) + 1 : 0;
  return <div className={styles.workspace}>
    <aside className={styles.leftPanel}>
      <header><div><p>STRUCTURE / {sections.length}</p><h2>Rail homepage</h2></div><button onClick={() => setSelectedId(null)} type="button">+ Nuova</button></header>
      {sections.length ? <SectionSortableList onSelect={setSelectedId} sections={sections} selectedId={selectedId} /> : <div className={styles.emptyState}><strong>Homepage vuota</strong><p>Nessuna sezione nel database. Crea prima sezione; preview resterà vuota.</p></div>}
      <Link className={styles.previewLink} href="/admin/homepage/anteprima" target="_blank">Apri preview protetta</Link>
    </aside>
    <main className={styles.rightPanel}><SectionEditor key={selected?.id ?? "new"} nextOrder={nextOrder} resources={resources} section={selected} /></main>
  </div>;
}

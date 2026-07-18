"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveContentPageAction } from "@/app/admin/actions/content";
import type { ContentPage } from "@/lib/content/types";
import { SafeMarkdown } from "@/components/content/safe-markdown";
import styles from "./content.module.css";

const initialState = { ok: false, message: "" };
const approvedSlugs = ["chi-siamo", "assistenza", "faq", "spedizioni", "resi", "contatti", "privacy", "cookie", "termini"];
const localDate = (value: string | null | undefined) => value?.slice(0, 16) ?? "";

export function PageEditor({ page, slug }: { readonly page: ContentPage | null; readonly slug: string }) {
  const [state, action, pending] = useActionState(saveContentPageAction, initialState);
  const [dirty, setDirty] = useState(false);
  const [markdown, setMarkdown] = useState(page?.markdown_source ?? "");
  const router = useRouter();
  useEffect(() => {
    if (!state.ok) return;
    queueMicrotask(() => setDirty(false));
    router.refresh();
  }, [router, state.ok]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);

  return <form action={action} className={styles.editor} onChange={() => setDirty(true)}>
    {page ? <input name="id" type="hidden" value={page.id} /> : null}
    <header><div><p>CONTENT / {page?.id ?? "NEW"}</p><h2>{page?.title ?? `Nuova pagina: ${slug}`}</h2></div>{dirty ? <span>Modifiche non salvate</span> : <small>{page?.publication_status ?? "draft"}</small>}</header>
    <input name="slug" type="hidden" value={slug} />
    <p className={styles.hint}>Slug consentito: {approvedSlugs.includes(slug) ? slug : "non riconosciuto"}. Il contenuto supporta Markdown sanitizzato, mai HTML libero.</p>
    <div className={styles.grid}>
      <label>Titolo<input defaultValue={page?.title ?? ""} maxLength={160} name="title" required /></label>
      <label>Ordine<input defaultValue={page?.sort_order ?? 0} name="sortOrder" type="number" /></label>
      <label className={styles.wide}>Introduzione<input defaultValue={page?.excerpt ?? ""} maxLength={500} name="excerpt" /></label>
      <label className={styles.wide}>Contenuto Markdown<textarea name="markdownSource" onChange={(event) => setMarkdown(event.target.value)} required rows={18} value={markdown} /><small>Titoli con #, elenchi con -, link con [testo](https://…). HTML e script vengono rifiutati.</small></label>
      <label>SEO title<input defaultValue={page?.seo_title ?? ""} maxLength={70} name="seoTitle" /></label>
      <label>SEO description<input defaultValue={page?.seo_description ?? ""} maxLength={180} name="seoDescription" /></label>
      <label>Stato<select defaultValue={page?.publication_status ?? "draft"} name="publicationStatus"><option value="draft">Bozza</option><option value="published">Pubblicata</option><option value="archived">Archiviata</option></select></label>
      <label className={styles.check}><input defaultChecked={page?.active ?? false} name="active" type="checkbox" />Visibile nella finestra pubblica</label>
      <label>Inizio<input defaultValue={localDate(page?.starts_at)} name="startsAt" type="datetime-local" /></label>
      <label>Fine<input defaultValue={localDate(page?.ends_at)} name="endsAt" type="datetime-local" /></label>
    </div>
    <details className={styles.preview}><summary>Anteprima sanitizzata</summary><SafeMarkdown source={markdown} /></details>
    {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
    <div className={styles.actions}><button disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva pagina"}</button></div>
  </form>;
}

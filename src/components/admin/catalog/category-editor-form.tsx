"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { saveCategoryAction } from "@/app/admin/actions/categories";
import type { AdminCategoryEditorData, AdminReadyCatalogMedia } from "@/lib/admin/category-repository";
import styles from "./catalog.module.css";

const initialState = { ok: false, message: "" };

export function CategoryEditorForm({ data, readyMedia }: {
  readonly data: AdminCategoryEditorData | null;
  readonly readyMedia: readonly AdminReadyCatalogMedia[];
}) {
  const [state, action, pending] = useActionState(saveCategoryAction, initialState);
  const category = data?.category;
  const selectedMedia = readyMedia.find((media) => media.id === category?.media_asset_id);
  return <div className={styles.editorGrid}>
    <form action={action} className={styles.editorForm}>
      {category ? <input name="id" type="hidden" value={category.id} /> : null}
      <section className={styles.editorSection}><header><p>01 / Identità</p><h2>Contenuto categoria</h2></header><div className={styles.fieldGrid}>
        <Field label="Nome"><input defaultValue={category?.name ?? ""} maxLength={120} name="name" required /></Field>
        <Field label="Slug"><input defaultValue={category?.slug ?? ""} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field>
        <Field wide label="Tagline"><input defaultValue={category?.tagline ?? ""} maxLength={240} name="tagline" required /></Field>
        <Field wide label="Descrizione"><textarea defaultValue={category?.description ?? ""} name="description" required rows={7} /></Field>
      </div></section>
      <section className={styles.editorSection}><header><p>02 / Media</p><h2>Immagine ready</h2></header>
        <label className={styles.mediaPicker}>Asset<select defaultValue={category?.media_asset_id ?? ""} name="mediaAssetId"><option value="">Nessuna immagine</option>{readyMedia.map((media) => <option key={media.id} value={media.id}>{media.originalFilename} · {media.altText}</option>)}</select></label>
        {selectedMedia ? <Image alt={selectedMedia.altText} className={styles.editorPreviewImage} height={300} src={selectedMedia.previewUrl} unoptimized width={600} /> : <p className={styles.inlineNote}>Solo asset con stato ready. Nessun asset selezionato.</p>}
      </section>
      <section className={styles.editorSection}><header><p>03 / Pubblicazione</p><h2>SEO e ordine</h2></header><div className={styles.fieldGrid}>
        <Field wide label="Titolo SEO"><input defaultValue={category?.seo_title ?? ""} maxLength={70} name="seoTitle" /></Field>
        <Field wide label="Descrizione SEO"><textarea defaultValue={category?.seo_description ?? ""} maxLength={180} name="seoDescription" rows={3} /></Field>
        <Field label="Ordine"><input defaultValue={category?.sort_order ?? 0} name="sortOrder" type="number" /></Field>
        <label className={styles.checkField}><input defaultChecked={category?.active ?? false} name="active" type="checkbox" />Attiva nella finestra pubblica</label>
      </div></section>
      {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      <div className={styles.stickyActions}><button disabled={pending} name="intent" value="draft">Salva bozza</button><button className={styles.primaryButton} disabled={pending} name="intent" value="publish">Pubblica</button>{category ? <button disabled={pending} name="intent" value="archive">Archivia</button> : null}</div>
    </form>
    <aside className={styles.inspector}><p>LIVE / READ MODEL</p><h2>{category?.name || "Nuova categoria"}</h2><span>/{category?.slug || "slug"}</span><dl><div><dt>Stato</dt><dd>{category?.publication_status ?? "draft"}</dd></div><div><dt>Prodotti</dt><dd>{data?.products.length ?? 0}</dd></div><div><dt>Media</dt><dd>{category?.media_asset_id ? "ready" : "—"}</dd></div></dl>{category?.publication_status === "published" ? <Link href={`/negozio/${category.slug}`} target="_blank">Apri anteprima pubblica</Link> : <small>Anteprima pubblica disponibile dopo pubblicazione.</small>}</aside>
    {data ? <section className={styles.associations}><header><p>ASSOCIATIONS</p><h2>Prodotti collegati</h2></header>{data.products.length ? <ul>{data.products.map((product) => <li key={product.id}><span>{product.sku}</span><Link href={`/admin/prodotti/${product.id}`}>{product.name}</Link><small>{product.publication_status}</small></li>)}</ul> : <p>Nessun prodotto collegato.</p>}</section> : null}
  </div>;
}

function Field({ label, wide, children }: { readonly label: string; readonly wide?: boolean; readonly children: React.ReactNode }) {
  return <label className={wide ? styles.wide : undefined}><span>{label}</span>{children}</label>;
}


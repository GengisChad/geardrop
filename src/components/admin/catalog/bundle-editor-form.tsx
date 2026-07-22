"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { saveBundleAction } from "@/app/admin/actions/bundles";
import type { AdminBundleEditorData } from "@/lib/admin/bundle-repository";
import type { AdminReadyCatalogMedia } from "@/lib/admin/category-repository";
import type { StaffRole } from "@/lib/auth/roles";
import styles from "./catalog.module.css";

const initialState = { ok: false, message: "" };
type ItemDraft = { readonly key: number; readonly productId: number; readonly quantity: number };

function localDateTime(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : "";
}

export function BundleEditorForm({ data, products, readyMedia, role }: {
  readonly data: AdminBundleEditorData | null;
  readonly products: AdminBundleEditorData["products"];
  readonly readyMedia: readonly AdminReadyCatalogMedia[];
  readonly role: StaffRole;
}) {
  const [state, action, pending] = useActionState(saveBundleAction, initialState);
  const bundle = data?.bundle;
  const nextKey = useRef((data?.items.length ?? 0) + 1);
  const [items, setItems] = useState<readonly ItemDraft[]>(() => data?.items.map((item, index) => ({ key: index + 1, productId: item.product_id, quantity: item.quantity })) ?? (products[0] ? [{ key: 1, productId: products[0].id, quantity: 1 }] : []));
  const [titleOne, setTitleOne] = useState(bundle?.title_line_one ?? "");
  const [titleTwo, setTitleTwo] = useState(bundle?.title_line_two ?? "");
  const [eyebrow, setEyebrow] = useState(bundle?.eyebrow ?? "BUNDLE");
  const canEditCommerce = role === "owner" || role === "admin";
  const selectedMedia = readyMedia.find((media) => media.id === bundle?.media_asset_id);
  const addItem = () => {
    const firstUnused = products.find((product) => !items.some((item) => item.productId === product.id));
    if (!firstUnused) return;
    nextKey.current += 1;
    setItems((current) => [...current, { key: nextKey.current, productId: firstUnused.id, quantity: 1 }]);
  };
  const updateItem = (key: number, update: Partial<ItemDraft>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...update } : item));

  if (products.length === 0) return <section className={styles.empty}><strong>Nessun prodotto reale disponibile</strong><p>Crea prodotto prima bundle. Nessun placeholder inserito.</p></section>;

  return <div className={styles.bundleLayout}>
    <form action={action} className={styles.editorForm}>
      {bundle ? <input name="id" type="hidden" value={bundle.id} /> : null}
      <section className={styles.editorSection}><header><p>01 / Story</p><h2>Identità bundle</h2></header><div className={styles.fieldGrid}>
        <Field label="Eyebrow"><input defaultValue={bundle?.eyebrow ?? ""} maxLength={120} name="eyebrow" onChange={(event) => setEyebrow(event.target.value)} required /></Field>
        <Field label="Slug"><input defaultValue={bundle?.slug ?? ""} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field>
        <Field label="Titolo riga 1"><input defaultValue={bundle?.title_line_one ?? ""} maxLength={160} name="titleLineOne" onChange={(event) => setTitleOne(event.target.value)} required /></Field>
        <Field label="Titolo riga 2"><input defaultValue={bundle?.title_line_two ?? ""} maxLength={160} name="titleLineTwo" onChange={(event) => setTitleTwo(event.target.value)} required /></Field>
        <Field wide label="Descrizione"><textarea defaultValue={bundle?.description ?? ""} name="description" required rows={6} /></Field>
      </div></section>
      <section className={styles.editorSection}><header><p>02 / Composition</p><h2>Prodotti e quantità</h2></header><div className={styles.bundleItems}>
        {items.map((item, index) => <div className={styles.bundleItem} key={item.key}><span>{String(index + 1).padStart(2, "0")}</span><select aria-label={`Prodotto ${index + 1}`} name="productIds" onChange={(event) => updateItem(item.key, { productId: Number(event.target.value) })} value={item.productId}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select><input aria-label={`Quantità ${index + 1}`} min={1} name="quantities" onChange={(event) => updateItem(item.key, { quantity: Number(event.target.value) })} type="number" value={item.quantity} /><button disabled={items.length === 1} onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))} type="button">Rimuovi</button></div>)}
        <button className={styles.addButton} disabled={items.length >= products.length} onClick={addItem} type="button">+ Aggiungi prodotto</button>
      </div><label className={styles.mediaPicker}>Prodotto hero<select defaultValue={bundle?.hero_product_id ?? items[0]?.productId} name="heroProductId" required>{items.map((item) => { const product = products.find((candidate) => candidate.id === item.productId); return product ? <option key={item.key} value={product.id}>{product.name}</option> : null; })}</select></label></section>
      <section className={styles.editorSection}><header><p>03 / Commerce</p><h2>Prezzi e disponibilità</h2></header><div className={styles.fieldGrid}>
        <Field label="Prezzo (centesimi)"><input defaultValue={bundle?.price_cents ?? 0} disabled={!canEditCommerce} min={0} name="priceCents" required type="number" />{!canEditCommerce ? <input name="priceCents" type="hidden" value={bundle?.price_cents ?? 0} /> : null}</Field>
        <Field label="Prezzo barrato"><input defaultValue={bundle?.compare_at_price_cents ?? 1} disabled={!canEditCommerce} min={1} name="compareAtPriceCents" required type="number" />{!canEditCommerce ? <input name="compareAtPriceCents" type="hidden" value={bundle?.compare_at_price_cents ?? 1} /> : null}</Field>
        <Field label="Override"><select defaultValue={bundle?.availability_override ?? ""} disabled={!canEditCommerce} name="availabilityOverride"><option value="">Nessuno</option><option value="preorder">Pre-ordine</option><option value="incoming">In arrivo</option></select>{!canEditCommerce ? <input name="availabilityOverride" type="hidden" value={bundle?.availability_override ?? ""} /> : null}</Field>
        <Field label="Ordine"><input defaultValue={bundle?.sort_order ?? 0} name="sortOrder" type="number" /></Field>
        <Field label="Inizio"><input defaultValue={localDateTime(bundle?.starts_at)} name="startsAt" type="datetime-local" /></Field>
        <Field label="Fine"><input defaultValue={localDateTime(bundle?.ends_at)} name="endsAt" type="datetime-local" /></Field>
        <label className={styles.checkField}><input defaultChecked={bundle?.active ?? false} name="active" type="checkbox" />Pubblicato nella finestra attiva</label>
        {!canEditCommerce ? <p className={styles.capabilityNote}>Prezzi e override richiedono owner o admin. Server ignora valori client per ruolo editor.</p> : null}
      </div></section>
      <section className={styles.editorSection}><header><p>04 / Visual</p><h2>Media ready</h2></header><label className={styles.mediaPicker}>Asset<select defaultValue={bundle?.media_asset_id ?? ""} name="mediaAssetId"><option value="">Nessuna immagine</option>{readyMedia.map((media) => <option key={media.id} value={media.id}>{media.originalFilename} · {media.altText}</option>)}</select></label>{selectedMedia ? <Image alt={selectedMedia.altText} className={styles.editorPreviewImage} height={300} src={selectedMedia.previewUrl} unoptimized width={600} /> : <p className={styles.inlineNote}>Solo asset ready. Nessun asset selezionato.</p>}</section>
      {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      <div className={styles.stickyActions}><button className={styles.primaryButton} disabled={pending || items.length === 0} type="submit">{pending ? "Salvataggio…" : "Salva bundle"}</button></div>
    </form>
    <aside className={styles.bundlePreview}><p>{eyebrow || "BUNDLE"}</p><h2><span>{titleOne || "Titolo"}</span><strong>{titleTwo || "bundle"}</strong></h2><small>Preview contenuto · dati non pubblicati finché non salvi</small></aside>
  </div>;
}

function Field({ label, wide, children }: { readonly label: string; readonly wide?: boolean; readonly children: React.ReactNode }) {
  return <label className={wide ? styles.wide : undefined}><span>{label}</span>{children}</label>;
}

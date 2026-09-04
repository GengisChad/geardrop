"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  addProductDetailAction,
  associateProductMediaAction,
  addProductRelationAction,
  addProductTagAction,
  deleteProductAction,
  duplicateProductAction,
  removeProductDetailAction,
  removeProductImageLinkAction,
  removeProductRelationAction,
  removeProductTagAction,
  reorderProductImagesAction,
  saveProductAction,
  updateProductImageAction,
} from "@/app/admin/actions/products";
import type { AdminCategory, AdminProductEditorData, ProductDeletionImpact } from "@/lib/admin/product-repository";
import type { StaffRole } from "@/lib/auth/roles";
import styles from "./products.module.css";

const initialState = { ok: false, message: "" };
const tabs = [
  ["informazioni", "Informazioni"], ["prezzi", "Prezzi"], ["inventario", "Inventario"],
  ["immagini", "Immagini"], ["dettagli", "Dettagli"], ["merchandising", "Merchandising"],
  ["correlati", "Correlati"], ["seo", "SEO"],
] as const;

type Props = {
  readonly data: AdminProductEditorData | null;
  readonly categories: readonly AdminCategory[];
  readonly deletionImpact: ProductDeletionImpact | null;
  readonly role: StaffRole;
};

export function ProductEditorForm({ data, categories, deletionImpact, role }: Props) {
  const [state, action, pending] = useActionState(saveProductAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const product = data?.product;
  const canEditCommerce = role === "owner" || role === "admin";
  const deletionBlocked = deletionImpact !== null
    && (deletionImpact.orders > 0 || deletionImpact.bundles > 0 || deletionImpact.inventoryMovements > 0);
  const [imageOrder, setImageOrder] = useState<readonly number[]>(() => data?.images.map((image) => image.id) ?? []);
  const orderedImages = imageOrder
    .map((id) => data?.images.find((image) => image.id === id))
    .filter((image): image is NonNullable<typeof image> => image !== undefined);
  const moveImage = (id: number, delta: -1 | 1) => {
    setImageOrder((current) => {
      const index = current.indexOf(id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target] as number, next[index] as number];
      return next;
    });
  };

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let dirty = false;
    const markDirty = () => { dirty = true; };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    form.addEventListener("input", markDirty);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { form.removeEventListener("input", markDirty); window.removeEventListener("beforeunload", beforeUnload); };
  }, []);

  return <div className={styles.editorLayout}>
    <nav className={styles.editorTabs} aria-label="Sezioni prodotto">{tabs.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}</nav>
    <form action={action} className={styles.editorForm} ref={formRef}>
      {product ? <input name="id" type="hidden" value={product.id} /> : null}
      <input name="publicationStatus" type="hidden" value={product?.publication_status ?? "draft"} />
      <input name="active" type="hidden" value={String(product?.active ?? false)} />

      <EditorSection id="informazioni" title="Informazioni" subtitle="Identità pubblica e classificazione.">
        <Field label="Nome"><input defaultValue={product?.name ?? ""} maxLength={160} name="name" required /></Field>
        <Field label="Nome breve"><input defaultValue={product?.short_name ?? ""} maxLength={80} name="shortName" /></Field>
        <Field label="Slug"><input defaultValue={product?.slug ?? ""} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field>
        <Field label="SKU"><input className={styles.mono} defaultValue={product?.sku ?? ""} name="sku" pattern="[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*" required /></Field>
        <Field label="Categoria"><select defaultValue={product?.category_id ?? ""} name="categoryId" required><option disabled value="">Seleziona categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " · inattiva"}</option>)}</select></Field>
        <Field label="Tipo blade"><select defaultValue={product?.blade_type ?? ""} name="bladeType"><option value="">Non definito</option><option value="attacco">Attacco</option><option value="difesa">Difesa</option><option value="stamina">Stamina</option><option value="bilanciato">Bilanciato</option></select></Field>
        <Field wide label="Tagline"><input defaultValue={product?.tagline ?? ""} maxLength={240} name="tagline" required /></Field>
        <Field wide label="Descrizione"><textarea defaultValue={product?.description ?? ""} name="description" required rows={8} /></Field>
      </EditorSection>

      <EditorSection id="prezzi" title="Prezzi" subtitle={canEditCommerce ? "Valori in centesimi, validati sul server." : "Sola lettura per il ruolo editor."}>
        <Field label="Prezzo (centesimi)"><input defaultValue={product?.price_cents ?? 0} disabled={!canEditCommerce} min={0} name="priceCents" required type="number" />{!canEditCommerce ? <input name="priceCents" type="hidden" value={product?.price_cents ?? 0} /> : null}</Field>
        <Field label="Prezzo barrato"><input defaultValue={product?.compare_at_price_cents ?? ""} disabled={!canEditCommerce} min={1} name="compareAtPriceCents" type="number" />{!canEditCommerce ? <input name="compareAtPriceCents" type="hidden" value={product?.compare_at_price_cents ?? ""} /> : null}</Field>
        <Field label="Valuta"><input disabled value={product?.currency ?? "EUR"} /></Field>
        <Field label="Rating / recensioni"><input disabled value={`${product?.rating ?? 0} / 5 · ${product?.review_count ?? 0}`} /></Field>
      </EditorSection>

      <EditorSection id="inventario" title="Inventario" subtitle="Lo stock reale è immutabile qui: ogni variazione passa dalla funzione transazionale.">
        <Field label="Stock reale"><input disabled value={product?.stock_quantity ?? 0} /></Field>
        <Field label="Stato effettivo"><input disabled value={product?.stock_status ?? "esaurito"} /></Field>
        <Field label="Acquistabile"><input disabled value={product?.is_purchasable ? "Sì" : "No"} /></Field>
        <CheckField disabled={!canEditCommerce} label="Gestisci stock" name="manageStock" checked={product?.manage_stock ?? true} />
        <Field label="Soglia stock basso"><input defaultValue={product?.low_stock_threshold ?? 5} disabled={!canEditCommerce} min={0} name="lowStockThreshold" type="number" />{!canEditCommerce ? <input name="lowStockThreshold" type="hidden" value={product?.low_stock_threshold ?? 5} /> : null}</Field>
        <CheckField disabled={!canEditCommerce} label="Consenti backorder" name="allowBackorder" checked={product?.allow_backorder ?? false} />
        <Field label="Override disponibilità"><select defaultValue={product?.availability_override ?? ""} disabled={!canEditCommerce} name="availabilityOverride"><option value="">Nessuno</option><option value="preorder">Pre-ordine</option><option value="incoming">In arrivo</option></select>{!canEditCommerce ? <input name="availabilityOverride" type="hidden" value={product?.availability_override ?? ""} /> : null}</Field>
        <Field label="Allocazione preordine"><input defaultValue={product?.preorder_allocation ?? 0} disabled={!canEditCommerce} min={0} name="preorderAllocation" type="number" />{!canEditCommerce ? <input name="preorderAllocation" type="hidden" value={product?.preorder_allocation ?? 0} /> : null}</Field>
        <Field label="Data rilascio"><input defaultValue={product?.preorder_release_date ?? ""} disabled={!canEditCommerce} name="preorderReleaseDate" type="date" />{!canEditCommerce ? <input name="preorderReleaseDate" type="hidden" value={product?.preorder_release_date ?? ""} /> : null}</Field>
        <CheckField disabled={!canEditCommerce} label="Confermo preordine senza data" name="preorderWarningConfirmed" checked={false} />
        {!canEditCommerce ? <p className={styles.capabilityNote}>Prezzi, override e regole inventario richiedono ruolo owner o admin. Le modifiche ai campi nascosti sono respinte anche dal database.</p> : null}
        {product ? <p className={styles.inlineNote}>Movimenti disponibili nella sezione <Link href={{ pathname: "/admin/inventario", query: { product: product.id } }}>Inventario</Link>.</p> : null}
      </EditorSection>

      <EditorSection id="seo" title="SEO" subtitle="Titolo e descrizione per motori di ricerca.">
        <Field wide label="Titolo SEO"><input defaultValue={product?.seo_title ?? ""} maxLength={70} name="seoTitle" /></Field>
        <Field wide label="Descrizione SEO"><textarea defaultValue={product?.seo_description ?? ""} maxLength={180} name="seoDescription" rows={3} /></Field>
        <Field label="Ordinamento catalogo"><input defaultValue={product?.sort_order ?? 0} name="sortOrder" type="number" /></Field>
        <Field label="Creato / aggiornato"><input disabled value={product ? `${product.created_at} · ${product.updated_at}` : "Nuovo prodotto"} /></Field>
      </EditorSection>

      {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      <div className={styles.stickyActions}>
        <button disabled={pending} name="intent" type="submit" value="draft">Salva bozza</button>
        <button className={styles.primaryButton} disabled={pending} name="intent" type="submit" value="publish">Pubblica</button>
        {product ? <button disabled={pending} name="intent" type="submit" value="archive">Archivia</button> : null}
        {product?.publication_status === "published" ? <Link href={`/prodotto/${product.slug}`} target="_blank">Anteprima pubblica</Link> : null}
      </div>
    </form>

    {product && data ? <>
      <ResourceSection id="immagini" title="Immagini" note="Upload e sostituzione file sono gestiti dalla media library (Task 4). Qui modifichi associazione e pubblicazione.">
        {orderedImages.map((image, index) => <form action={updateProductImageAction} className={styles.resourceRow} key={image.id}>
          <input name="productId" type="hidden" value={product.id} /><input name="imageId" type="hidden" value={image.id} />
          <Image alt="" height={image.height} src={image.src} unoptimized width={image.width} /><input aria-label="Alt text" defaultValue={image.alt} name="alt" required />
          <span className={styles.orderControls}><button aria-label={`Sposta ${image.alt} su`} disabled={index === 0} onClick={() => moveImage(image.id, -1)} type="button">↑</button><button aria-label={`Sposta ${image.alt} giù`} disabled={index === orderedImages.length - 1} onClick={() => moveImage(image.id, 1)} type="button">↓</button></span>
          <label><input defaultChecked={image.published} name="published" type="checkbox" />Pubblica</label>
          <label><input defaultChecked={image.is_primary} name="isPrimary" type="checkbox" />Cover</label>
          <button type="submit">Aggiorna</button><button formAction={removeProductImageLinkAction} type="submit">Scollega</button>
        </form>)}
        {orderedImages.length > 1 ? <form action={reorderProductImagesAction} className={styles.orderSave}><input name="productId" type="hidden" value={product.id} />{imageOrder.map((id) => <input key={id} name="imageIds" type="hidden" value={id} />)}<button type="submit">Salva ordine immagini</button></form> : null}
        {data.readyMedia.length > 0 ? <form action={associateProductMediaAction} className={styles.resourceCreate}><input name="productId" type="hidden" value={product.id} /><select aria-label="Media pronto da associare" name="mediaAssetId" required><option value="">Seleziona media ready…</option>{data.readyMedia.map((media) => <option key={media.id} value={media.id}>{media.originalFilename} · {media.altText}</option>)}</select><button type="submit">Associa media</button></form> : <p className={styles.emptyResource}>Nessun asset ready disponibile nella media library.</p>}
        {data.images.length === 0 ? <p className={styles.emptyResource}>Nessuna immagine associata. Apri la media library per caricare gli asset.</p> : null}
      </ResourceSection>

      <ResourceSection id="dettagli" title="Dettagli strutturati" note="Specifiche, feature e contenuto confezione rimangono tabelle normalizzate.">
        <ResourceList rows={data.specs.map((item) => ({ id: item.id, label: `${item.label}: ${item.value}`, kind: "spec" as const }))} productId={product.id} />
        <ResourceList rows={data.features.map((item) => ({ id: item.id, label: `${item.title} — ${item.description}`, kind: "feature" as const }))} productId={product.id} />
        <ResourceList rows={data.boxContents.map((item) => ({ id: item.id, label: item.content, kind: "box" as const }))} productId={product.id} />
        <form action={addProductDetailAction} className={styles.resourceCreate}><input name="productId" type="hidden" value={product.id} /><select name="kind"><option value="spec">Specifica</option><option value="feature">Feature</option><option value="box">Contenuto box</option></select><input name="label" placeholder="Etichetta spec" /><input name="value" placeholder="Valore spec" /><input name="title" placeholder="Titolo feature" /><input name="detailDescription" placeholder="Descrizione feature" /><input name="content" placeholder="Contenuto box" /><input name="sortOrder" min={0} type="number" value={0} readOnly /><button type="submit">Aggiungi</button></form>
      </ResourceSection>

      <ResourceSection id="merchandising" title="Merchandising" note="I tag sono disponibili ora. Il posizionamento homepage avanzato resta in Fase 3.">
        <div className={styles.chips}>{data.tags.map(({ tag }) => <form action={removeProductTagAction} key={tag}><input name="productId" type="hidden" value={product.id} /><input name="tag" type="hidden" value={tag} /><button type="submit">{tag} ×</button></form>)}</div>
        <form action={addProductTagAction} className={styles.resourceCreate}><input name="productId" type="hidden" value={product.id} /><select name="tag"><option value="novita">Novità</option><option value="offerta">Offerta</option><option value="limited">Limited</option><option value="esclusiva">Esclusiva</option></select><button type="submit">Aggiungi tag</button></form>
      </ResourceSection>

      <ResourceSection id="correlati" title="Correlati" note="Relazioni ordinate: related, upsell, cross-sell e compatible.">
        <div className={styles.resourceList}>{data.relations.map((relation) => <form action={removeProductRelationAction} className={styles.resourceLine} key={`${relation.related_product_id}-${relation.relation_type}`}><input name="productId" type="hidden" value={product.id} /><input name="relatedProductId" type="hidden" value={relation.related_product_id} /><input name="relationType" type="hidden" value={relation.relation_type} /><span>#{relation.related_product_id} · {relation.relation_type} · ordine {relation.sort_order}</span><button type="submit">Rimuovi</button></form>)}</div>
        <form action={addProductRelationAction} className={styles.resourceCreate}><input name="productId" type="hidden" value={product.id} /><select name="relatedProductId" required><option value="">Prodotto…</option>{data.relationCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</option>)}</select><select name="relationType"><option value="related">Related</option><option value="upsell">Upsell</option><option value="cross_sell">Cross-sell</option><option value="compatible">Compatible</option></select><input name="sortOrder" min={0} type="number" value={0} readOnly /><button type="submit">Aggiungi relazione</button></form>
      </ResourceSection>

      <section className={styles.dangerZone}>
        <h2>Azioni prodotto</h2>
        <div><form action={duplicateProductAction}><input name="id" type="hidden" value={product.id} /><button type="submit">Duplica come bozza</button></form></div>
        {canEditCommerce && deletionImpact ? <details>
          <summary>Eliminazione permanente</summary>
          <p>Archivia è l’azione consigliata. La cancellazione rimuove anche i contenuti collegati non bloccanti.</p>
          <dl className={styles.impactGrid}>
            <div><dt>Ordini</dt><dd>{deletionImpact.orders}</dd></div>
            <div><dt>Bundle</dt><dd>{deletionImpact.bundles}</dd></div>
            <div><dt>Relazioni</dt><dd>{deletionImpact.relations}</dd></div>
            <div><dt>Media</dt><dd>{deletionImpact.images}</dd></div>
            <div><dt>Inventario</dt><dd>{deletionImpact.inventoryMovements}</dd></div>
          </dl>
          {deletionBlocked ? <p className={styles.blockedDelete}>Rimuovi prima ordini, bundle o movimenti inventario bloccanti.</p> : null}
          <form action={deleteProductAction}>
            <input name="id" type="hidden" value={product.id} />
            <label>Digita “{product.name}”<input autoComplete="off" name="confirmation" required /></label>
            <label className={styles.confirmDelete}><input name="confirmPermanent" required type="checkbox" />Confermo eliminazione permanente</label>
            <button className={styles.dangerButton} disabled={deletionBlocked} type="submit">Elimina definitivamente</button>
          </form>
        </details> : null}
      </section>
    </> : null}
  </div>;
}

function EditorSection({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className={styles.editorSection} id={id}><header><h2>{title}</h2><p>{subtitle}</p></header><div className={styles.fieldGrid}>{children}</div></section>;
}
function ResourceSection({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return <section className={styles.editorSection} id={id}><header><h2>{title}</h2><p>{note}</p></header>{children}</section>;
}
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? styles.wideField : undefined}><span>{label}</span>{children}</label>; }
function CheckField({ label, name, checked, disabled }: { label: string; name: string; checked: boolean; disabled: boolean }) { return <label className={styles.checkField}><input defaultChecked={checked} disabled={disabled} name={name} type="checkbox" />{disabled ? <input name={name} type="hidden" value={String(checked)} /> : null}<span>{label}</span></label>; }
function ResourceList({ rows, productId }: { rows: readonly { id: number; label: string; kind: "spec" | "feature" | "box" }[]; productId: number }) { return <div className={styles.resourceList}>{rows.map((row) => <form action={removeProductDetailAction} className={styles.resourceLine} key={`${row.kind}-${row.id}`}><input name="productId" type="hidden" value={productId} /><input name="detailId" type="hidden" value={row.id} /><input name="kind" type="hidden" value={row.kind} /><span>{row.label}</span><button type="submit">Rimuovi</button></form>)}</div>; }

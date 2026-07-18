"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { publishHomepageSectionAction, saveHomepageSectionAction } from "@/app/admin/actions/content";
import type { HomepageEditorOption, HomepageEditorResources, HomepageSection } from "@/lib/content/types";
import styles from "./homepage.module.css";

const initialState = { ok: false, message: "" };
const productTypes = new Set(["featured_products", "latest_drops", "competitive_products", "bestsellers", "new_arrivals", "offers"]);

function datetimeLocal(value: string | null | undefined): string { return value ? value.slice(0, 16) : ""; }

export function SectionEditor({ section, resources, nextOrder }: {
  readonly section: HomepageSection | null;
  readonly resources: HomepageEditorResources;
  readonly nextOrder: number;
}) {
  const [state, action, pending] = useActionState(saveHomepageSectionAction, initialState);
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [sectionType, setSectionType] = useState(section?.section_type ?? "hero");
  const [desktopMediaId, setDesktopMediaId] = useState(section?.desktop_media_asset_id ?? 0);
  const [mobileMediaId, setMobileMediaId] = useState(section?.mobile_media_asset_id ?? 0);
  const targetOptions: readonly HomepageEditorOption[] = productTypes.has(sectionType)
    ? resources.products
    : sectionType === "categories"
      ? resources.categories
      : sectionType === "bundle" ? resources.bundles : [];
  const selectedTargets = sectionType === "categories" ? section?.categoryIds
    : sectionType === "bundle" ? section?.bundleIds : productTypes.has(sectionType) ? section?.productIds : [];
  const desktopMedia = resources.media.find((item) => item.id === desktopMediaId);
  const mobileMedia = resources.media.find((item) => item.id === mobileMediaId);

  useEffect(() => {
    if (!state.ok) return;
    queueMicrotask(() => setDirty(false));
    router.refresh();
  }, [router, state.ok]);
  useEffect(() => {
    const beforeunload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeunload);
    return () => window.removeEventListener("beforeunload", beforeunload);
  }, [dirty]);

  return <div className={styles.editorWrap}>
    <header className={styles.editorHeading}><div><p>SECTION / {section?.id ?? "NEW"}</p><h2>{section?.title || "Nuova sezione"}</h2></div>{dirty ? <span>Modifiche non salvate</span> : <small>{section?.publication_status ?? "draft"}</small>}</header>
    <form action={action} className={styles.sectionEditor} onChange={() => setDirty(true)}>
      {section ? <input name="id" type="hidden" value={section.id} /> : null}
      <section><h3>Tipo e identità</h3><div className={styles.fieldGrid}>
        <Field label="Tipo sezione"><select name="sectionType" onChange={(event) => setSectionType(event.target.value as HomepageSection["section_type"])} value={sectionType}>
          <option value="hero">Hero</option><option value="announcement">Annuncio</option><option value="featured_products">Prodotti in evidenza</option><option value="latest_drops">Ultimi drop</option><option value="categories">Categorie</option><option value="competitive_products">Competitivo</option><option value="bestsellers">Più venduti</option><option value="new_arrivals">Nuovi arrivi</option><option value="offers">Offerte</option><option value="bundle">Bundle</option><option value="club">Club</option><option value="status_legend">Legenda stati</option><option value="trust">Trust</option><option value="newsletter">Newsletter</option><option value="promo_banner">Banner promo</option><option value="rich_text">Testo</option><option value="cta">CTA</option>
        </select></Field>
        <Field label="Chiave"><input defaultValue={section?.section_key ?? ""} name="sectionKey" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field>
        <Field label="Eyebrow"><input defaultValue={section?.eyebrow ?? ""} maxLength={120} name="eyebrow" /></Field>
        <Field label="Titolo"><input defaultValue={section?.title ?? ""} maxLength={200} name="title" /></Field>
        <Field wide label="Sottotitolo"><input defaultValue={section?.subtitle ?? ""} maxLength={300} name="subtitle" /></Field>
        <Field wide label="Descrizione"><textarea defaultValue={section?.description ?? ""} maxLength={12000} name="description" rows={6} /></Field>
      </div></section>
      <section><h3>Media ready</h3><div className={styles.mediaGrid}>
        <label>Desktop<select name="desktopMediaAssetId" onChange={(event) => setDesktopMediaId(Number(event.target.value))} value={desktopMediaId || ""}><option value="">Nessun asset</option>{resources.media.map((media) => <option key={media.id} value={media.id}>{media.label} · {media.altText}</option>)}</select>{desktopMedia ? <Image alt={desktopMedia.altText} height={180} src={desktopMedia.previewUrl} unoptimized width={320} /> : <span>Nessuna immagine desktop</span>}</label>
        <label>Mobile<select name="mobileMediaAssetId" onChange={(event) => setMobileMediaId(Number(event.target.value))} value={mobileMediaId || ""}><option value="">Nessun asset</option>{resources.media.map((media) => <option key={media.id} value={media.id}>{media.label} · {media.altText}</option>)}</select>{mobileMedia ? <Image alt={mobileMedia.altText} height={180} src={mobileMedia.previewUrl} unoptimized width={320} /> : <span>Nessuna immagine mobile</span>}</label>
      </div></section>
      <section><h3>Target relazionali</h3>{targetOptions.length ? <label className={styles.targetPicker}>Risorse<select defaultValue={(selectedTargets ?? []).map(String)} key={sectionType} multiple name="targetIds" required={sectionType !== "hero"} size={Math.min(8, Math.max(3, targetOptions.length))}>{targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.meta}</option>)}</select><small>{sectionType === "bundle" ? "Seleziona un bundle." : "Ctrl/Cmd per selezione multipla."}</small></label> : <p className={styles.emptyInline}>Questo tipo non usa target relazionali.</p>}</section>
      <section><h3>CTA e pubblicazione</h3><div className={styles.fieldGrid}>
        <Field label="Etichetta CTA"><input defaultValue={section?.cta_label ?? ""} maxLength={120} name="ctaLabel" /></Field>
        <Field label="Link CTA"><input defaultValue={section?.cta_href ?? ""} name="ctaHref" placeholder="/negozio o https://…" /></Field>
        <Field label="Stato"><select defaultValue={section?.publication_status ?? "draft"} name="publicationStatus"><option value="draft">Bozza</option><option value="published">Pubblicata</option><option value="archived">Archiviata</option></select></Field>
        <Field label="Ordine"><input defaultValue={section?.sort_order ?? nextOrder} name="sortOrder" type="number" /></Field>
        <Field label="Inizio"><input defaultValue={datetimeLocal(section?.starts_at)} name="startsAt" type="datetime-local" /></Field>
        <Field label="Fine"><input defaultValue={datetimeLocal(section?.ends_at)} name="endsAt" type="datetime-local" /></Field>
        <label className={styles.checkField}><input defaultChecked={section?.active ?? false} name="active" type="checkbox" />Attiva nella finestra pubblica</label>
      </div></section>
      {state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null}
      <div className={styles.stickyActions}><button className={styles.primaryButton} disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva sezione"}</button></div>
    </form>
    {section ? <form action={publishHomepageSectionAction} className={styles.publishBar}><input name="id" type="hidden" value={section.id} /><span>Pubblicazione esplicita: imposta stato, timestamp e attivazione nel database.</span><button type="submit">Pubblica</button></form> : null}
  </div>;
}

function Field({ label, wide, children }: { readonly label: string; readonly wide?: boolean; readonly children: React.ReactNode }) {
  return <label className={wide ? styles.wide : undefined}><span>{label}</span>{children}</label>;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManagedContentPage } from "@/components/layout/content-page";
import { LEGAL_PAGES, type LegalSlug } from "@/data/pages";
import { storefrontContent } from "@/lib/content/provider";

type Params = { slug: string };

const isLegalSlug = (slug: string): slug is LegalSlug => slug in LEGAL_PAGES;

export function generateStaticParams(): Params[] {
  return Object.keys(LEGAL_PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return { title: "Pagina non trovata" };
  const page = await storefrontContent.getPage(slug);
  if (!page) return { title: "Pagina non trovata" };
  // Placeholder legal copy must not be indexed. (see src/data/pages.ts)
  return { title: page.title, description: page.lead, robots: { index: false, follow: true } };
}

export default async function LegalePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const page = await storefrontContent.getPage(slug);
  if (!page) notFound();

  return (
    <ManagedContentPage page={page} crumbs={[{ label: "Home", href: "/" }, { label: "Legale" }, { label: page.title }]} />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManagedContentPage } from "@/components/layout/content-page";
import { SUPPORT_PAGES, type SupportSlug } from "@/data/pages";
import { storefrontContent } from "@/lib/content/provider";

type Params = { slug: string };

const isSupportSlug = (slug: string): slug is SupportSlug => slug in SUPPORT_PAGES;

export function generateStaticParams(): Params[] {
  return Object.keys(SUPPORT_PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isSupportSlug(slug)) return { title: "Pagina non trovata" };
  const page = await storefrontContent.getPage(slug);
  return page ? { title: page.seoTitle ?? page.title, description: page.seoDescription ?? page.lead } : { title: "Pagina non trovata" };
}

export default async function AssistenzaPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!isSupportSlug(slug)) notFound();
  const page = await storefrontContent.getPage(slug);
  if (!page) notFound();

  return (
    <ManagedContentPage
      page={page}
      crumbs={[{ label: "Home", href: "/" }, { label: "Assistenza" }, { label: page.title }]}
    />
  );
}

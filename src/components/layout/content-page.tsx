import { AlertTriangle } from "lucide-react";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { SlashMark } from "@/components/ui/section-heading";
import type { ContentPage as ContentPageData } from "@/data/pages";
import type { StorefrontManagedPage } from "@/lib/content/types";
import { SafeMarkdown } from "@/components/content/safe-markdown";

export function ContentPage({ page, crumbs }: { page: ContentPageData; crumbs: readonly Crumb[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Breadcrumbs items={crumbs} className="mb-6" />

      <article data-testid="content-page" className="gd-glass-panel rounded-[--radius-glass] px-5 py-7 sm:px-8 sm:py-9">
        <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">{page.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <SlashMark />
          <p className="text-body text-grey-600">{page.lead}</p>
        </div>

        {page.notice ? (
          <p className="gd-glass-compact mt-6 flex items-start gap-3 rounded-xl border-incoming-solid/50 p-4 text-small text-graphite">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {page.notice}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-7">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-h3 font-bold text-graphite">{section.heading}</h2>
            <div className="mt-2 flex flex-col gap-2">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-small leading-relaxed text-grey-600">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
        </div>
      </article>
    </div>
  );
}

export function ManagedContentPage({ page, crumbs }: { page: StorefrontManagedPage; crumbs: readonly Crumb[] }) {
  if (page.legacy) return <ContentPage crumbs={crumbs} page={page.legacy} />;
  return <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
    <Breadcrumbs items={crumbs} className="mb-6" />
    <article className="gd-glass-panel rounded-[--radius-glass] px-5 py-7 sm:px-8 sm:py-9" data-testid="content-page">
      <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">{page.title}</h1>
      {page.lead ? <div className="mt-3 flex items-center gap-3"><SlashMark /><p className="text-body text-grey-600">{page.lead}</p></div> : null}
      <SafeMarkdown className="prose prose-neutral mt-8 max-w-none text-grey-600" source={page.markdownSource ?? ""} />
    </article>
  </div>;
}

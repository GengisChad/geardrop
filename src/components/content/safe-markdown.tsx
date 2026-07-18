import { renderSafeMarkdown } from "@/lib/content/markdown";

export function SafeMarkdown({ source, className }: { readonly source: string; readonly className?: string }) {
  const html = renderSafeMarkdown(source);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

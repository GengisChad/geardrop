import { describe, expect, it } from "vitest";
import { renderSafeMarkdown } from "@/lib/content/markdown";

describe("safe Markdown rendering", () => {
  it("renders the allowlisted editorial syntax", () => {
    const html = renderSafeMarkdown("# Titolo\n\nTesto **forte**.\n\n- Uno\n- Due\n\n[Negozio](/negozio)");
    expect(html).toContain("<h1>Titolo</h1>");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain('href="/negozio"');
  });

  it.each([
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "<iframe src=https://evil.example></iframe>",
    "<style>body{display:none}</style>",
    "[Attacco](javascript:alert(1))",
    "<a href=/ onmouseover=alert(1)>link</a>",
  ])("removes executable input: %s", (source) => {
    const html = renderSafeMarkdown(source).toLowerCase();
    expect(html).not.toMatch(/<script|<iframe|<style|<img|onerror|onmouseover|javascript:/);
  });

  it("hardens external links without changing safe internal links", () => {
    const html = renderSafeMarkdown("[Interno](/assistenza) [Esterno](https://example.com)");
    expect(html).toContain('href="/assistenza"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});


import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSafeMarkdown } from "@/lib/content/markdown";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("registered storefront content renderers", () => {
  it("sanitizes stored Markdown and exposes it only through the safe component", () => {
    const html = renderSafeMarkdown("# Titolo\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(2))");
    expect(html).toContain("<h1>Titolo</h1>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    const component = read("src/components/content/safe-markdown.tsx");
    expect(component).toContain("renderSafeMarkdown");
    expect(component).toContain("dangerouslySetInnerHTML");
  });

  it("uses a closed homepage registry and returns null for unknown runtime types", () => {
    const renderer = read("src/components/content/managed-homepage.tsx");
    expect(renderer).toContain("switch (section.section_type)");
    expect(renderer).toMatch(/default:\s*return null/);
    expect(renderer).not.toContain("eval(");

    // The managed renderer drives the real storefront components, never the retired
    // graphite scaffold or its placeholder copy.
    expect(renderer).toContain("ProductCarousel");
    expect(renderer).toContain("Hero");
    expect(renderer).not.toContain("target relazionali");
    expect(renderer).not.toContain("bg-graphite");
  });

  it("selects public content through a provider whose default remains mock", () => {
    const provider = read("src/lib/content/provider.ts");
    expect(provider).toContain('?? "mock"');
    expect(provider).toContain('case "mock"');
    expect(provider).toContain('case "supabase"');
    const layout = read("src/app/(storefront)/layout.tsx");
    expect(layout).toContain("storefrontContent");
    expect(layout).toContain("<Header navigation=");
    expect(layout).toContain("<Footer content=");
  });

  it("preserves mock storefront navigation and pages as the default source", () => {
    const mock = read("src/lib/content/mock-provider.ts");
    expect(mock).toContain("MAIN_NAV");
    expect(mock).toContain("FOOTER_NAV");
    expect(mock).toContain("SUPPORT_PAGES");
    expect(mock).toContain("LEGAL_PAGES");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";
import { copilotSystemPrompt } from "@/lib/ai/copilot";
import { parseBlocks, parseInline } from "@/lib/ai/markdown-lite";

describe("parseInline", () => {
  it("reads bold, italic and code, and leaves the rest as text", () => {
    expect(parseInline("Stock **a 0**: riordina *subito* `GD-SOAR`.")).toEqual([
      { kind: "text", text: "Stock " },
      { kind: "strong", text: "a 0" },
      { kind: "text", text: ": riordina " },
      { kind: "em", text: "subito" },
      { kind: "text", text: " " },
      { kind: "code", text: "GD-SOAR" },
      { kind: "text", text: "." },
    ]);
  });

  it("keeps lone asterisks, snake_case and multiplications as text", () => {
    expect(parseInline("3 * 4 = 12, low_stock_threshold")).toEqual([{ kind: "text", text: "3 * 4 = 12, low_stock_threshold" }]);
  });
});

describe("parseBlocks", () => {
  it("turns the answer of 18/11 into a heading, a paragraph and a list", () => {
    const blocks = parseBlocks("Ecco i prodotti con **meno di 5 pezzi**:\n\n**Stock a 0:**\n- Impact Drake 9-60LR — riordinare 8\n- Wand Wizard 1-60R — riordinare 4\n\n## Nota\nRiga uno\nriga due");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "paragraph", "list", "heading", "paragraph"]);
    expect(blocks[2]).toEqual({
      kind: "list",
      ordered: false,
      items: [[{ kind: "text", text: "Impact Drake 9-60LR — riordinare 8" }], [{ kind: "text", text: "Wand Wizard 1-60R — riordinare 4" }]],
    });
    expect(blocks[4]).toMatchObject({ kind: "paragraph", lines: [[{ text: "Riga uno" }], [{ text: "riga due" }]] });
  });

  it("reads numbered lists, drops rules, and splits a list from the text after it", () => {
    const blocks = parseBlocks("1. Primo\n2) Secondo\n---\n- uno\nTesto dopo");
    expect(blocks).toEqual([
      { kind: "list", ordered: true, items: [[{ kind: "text", text: "Primo" }], [{ kind: "text", text: "Secondo" }]] },
      { kind: "list", ordered: false, items: [[{ kind: "text", text: "uno" }]] },
      { kind: "paragraph", lines: [[{ kind: "text", text: "Testo dopo" }]] },
    ]);
  });
});

describe("copilotSystemPrompt", () => {
  const prompt = copilotSystemPrompt("Gear Drop");

  it("lists every page of the admin menu by its real name", () => {
    for (const item of ADMIN_NAV_ITEMS.filter((candidate) => !candidate.disabled)) expect(prompt).toContain(item.label);
  });

  it("only points to pages that exist", () => {
    const labels = new Set(ADMIN_NAV_ITEMS.map((item) => item.label));
    for (const page of ["Previsioni", "Carichi merce", "Da spedire", "Conteggio inventario", "Inventario", "Prodotti", "Prezzi IA"]) {
      expect(labels.has(page)).toBe(true);
    }
    expect(prompt).not.toContain("Riordini");
  });

  it("knows today's date in Italian time, and tells a card from a product sheet", () => {
    const tuesday = copilotSystemPrompt("Gear Drop", new Date("2026-11-24T23:30:00Z"));
    expect(tuesday).toContain("Oggi è mercoledì 25 novembre 2026, ora italiana.");
    expect(tuesday).toContain("scheda di conferma");
    expect(tuesday).toContain("elenco_prodotti");
  });
});

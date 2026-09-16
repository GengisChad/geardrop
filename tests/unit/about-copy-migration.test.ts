import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_PAGE_SEEDS } from "@/data/content-seed";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260916140000_align_about_copy_with_live_checkout.sql"),
  "utf8",
).replaceAll("\r\n", "\n");

const about = CONTENT_PAGE_SEEDS.find((page) => page.slug === "chi-siamo");

describe("about page copy alignment", () => {
  it("writes exactly the pillars the content seed now carries", () => {
    expect(about).toBeDefined();
    for (const sentence of [
      "Ogni scheda indica la disponibilità e i pezzi rimasti, senza promesse che non possiamo mantenere.",
      "Hai un dubbio su un pezzo prima di ordinare? Scrivici e ti rispondiamo noi. Il pagamento avviene in sicurezza su Stripe.",
    ]) {
      expect(about?.markdownSource).toContain(sentence);
      expect(migration).toContain(`'${sentence.replaceAll("'", "''")}'`);
    }
  });

  it("drops the pre-order and offline-payment wording from the seed", () => {
    expect(about?.markdownSource).not.toMatch(/pre-ordine|senza addebito online/);
  });

  it("only rewrites the about page inside one transaction", () => {
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("where slug = 'chi-siamo'");
    expect(migration).not.toMatch(/\b(delete|insert|truncate)\b/i);
  });
});

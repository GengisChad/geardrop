import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260915200000_rename_glory_valkyrie.sql"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("Glory Valkyrie rename", () => {
  it("renamed the published product row in place (reverted by 20260916120000)", () => {
    expect(migration).toContain("where slug = 'glory-valkerion-lf'");
    expect(migration).toContain("set slug = 'glory-valkyrie-lf'");
    expect(migration).toContain("name = 'Glory Valkyrie LF'");
    expect(migration).toContain("'/products/glory-valkyrie-lf.webp'");
  });

  it("only updates existing rows inside one transaction", () => {
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\b(delete|insert|truncate)\b/i);
  });
});

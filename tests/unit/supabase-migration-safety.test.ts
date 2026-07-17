import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

const destructivePatterns = [
  /\bdrop\s+schema\b/i,
  /\bdrop\s+table\b/i,
  /\bdrop\s+database\b/i,
  /\bdrop\s+owned\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\s+(?:auth|storage)\./i,
];

describe("Supabase migration safety", () => {
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql"))) {
    it(`${filename} contains no destructive reset operation`, () => {
      const sql = readFileSync(join(migrationsDirectory, filename), "utf8");

      for (const pattern of destructivePatterns) {
        expect(sql, `${filename} matches forbidden pattern ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});

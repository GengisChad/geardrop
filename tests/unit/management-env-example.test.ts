/**
 * Verifica la coerenza di apps/management/.env.example con le variabili
 * effettivamente lette dal codice della seconda app Next.
 *
 * Fonti: apps/management/src/lib/supabase/env.ts, apps/management/next.config.ts,
 * apps/management/src/proxy.ts, packages/runtime-contract/src/index.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const EXAMPLE_PATH = resolve("apps/management/.env.example");

/** Variabili obbligatorie: il build o l'avvio di apps/management fallisce senza di esse. */
const REQUIRED_KEYS = [
  "NEXT_PUBLIC_APP_SURFACE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF",
  "MANAGEMENT_ORIGIN",
] as const;

/** Variabili opzionali documentate (hanno default nel codice). */
const OPTIONAL_KEYS = [
  "MANAGEMENT_MODE",
  "STOREFRONT_ORIGIN",
  "LEGACY_ADMIN_MODE",
] as const;

/**
 * Chiavi server-only dello storefront che NON devono mai comparire
 * nel template della management app (rispetta §5 sicurezza del README).
 */
const FORBIDDEN_KEYS = [
  "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "COMMERCE_PROVIDER",
  "CONTENT_PROVIDER",
  "PAYMENTS_PROVIDER",
  "GEARDROP_OWNER_EMAILS",
] as const;

function parseExampleKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) keys.add(trimmed.slice(0, eq).trim());
  }
  return keys;
}

describe("apps/management/.env.example — coerenza con il codice", () => {
  it("il file esiste", () => {
    expect(
      existsSync(EXAMPLE_PATH),
      `apps/management/.env.example non trovato (percorso: ${EXAMPLE_PATH})`,
    ).toBe(true);
  });

  it("contiene tutte le variabili obbligatorie", () => {
    const content = readFileSync(EXAMPLE_PATH, "utf8");
    const keys = parseExampleKeys(content);
    for (const key of REQUIRED_KEYS) {
      expect(keys.has(key), `chiave obbligatoria mancante: ${key}`).toBe(true);
    }
  });

  it("contiene tutte le variabili opzionali documentate", () => {
    const content = readFileSync(EXAMPLE_PATH, "utf8");
    const keys = parseExampleKeys(content);
    for (const key of OPTIONAL_KEYS) {
      expect(keys.has(key), `chiave opzionale non documentata: ${key}`).toBe(true);
    }
  });

  it("non contiene chiavi server-only dello storefront", () => {
    const content = readFileSync(EXAMPLE_PATH, "utf8");
    const keys = parseExampleKeys(content);
    for (const key of FORBIDDEN_KEYS) {
      expect(keys.has(key), `chiave storefront/server-only non ammessa trovata: ${key}`).toBe(false);
    }
  });

  it("NEXT_PUBLIC_APP_SURFACE è fissato al valore management", () => {
    const content = readFileSync(EXAMPLE_PATH, "utf8");
    expect(content).toMatch(/^\s*NEXT_PUBLIC_APP_SURFACE=management\s*$/m);
  });

  it("la publishable key usa un segnaposto (nessun valore reale)", () => {
    const content = readFileSync(EXAMPLE_PATH, "utf8");
    const line = content
      .split("\n")
      .find((l) => l.trim().startsWith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="));
    expect(line, "riga NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY non trovata").toBeDefined();
    const value = line!.split("=").slice(1).join("=").trim();
    const isPlaceholder =
      value.includes("<") ||
      value === "sb_publishable_xxx" ||
      value === "ci-publishable-key" ||
      value === "";
    expect(
      isPlaceholder,
      `valore non-segnaposto in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "${value}"`,
    ).toBe(true);
  });
});

/**
 * Task 5 – Step 1 (RED): URL di redirect sicuro per lo staff gestionale.
 * Questi test falliscono finché apps/management/src/lib/management/auth-redirect.ts non esiste.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importiamo dal modulo management: se il file non esiste, tutto il test file fallisce.
import { managementStaffRedirectUrl } from "../../apps/management/src/lib/management/auth-redirect";

const BASE_ENV = {
  MANAGEMENT_ORIGIN: "https://management-ci.invalid",
  NODE_ENV: "test",
};

beforeEach(() => {
  vi.resetAllMocks();
  for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
});
afterEach(() => vi.unstubAllEnvs());

describe("managementStaffRedirectUrl – URL assoluti e sicuri", () => {
  // ---------------------------------------------------------------------------
  // Con MANAGEMENT_ORIGIN remoto HTTPS
  // ---------------------------------------------------------------------------
  it("prefissa MANAGEMENT_ORIGIN HTTPS al path assoluto", () => {
    expect(managementStaffRedirectUrl("/login")).toBe(
      "https://management-ci.invalid/login",
    );
  });

  it("preserva query string e hash nel path", () => {
    expect(managementStaffRedirectUrl("/mfa/enroll?next=/account")).toBe(
      "https://management-ci.invalid/mfa/enroll?next=/account",
    );
  });

  it("funziona con path annidati", () => {
    expect(managementStaffRedirectUrl("/settings/security")).toBe(
      "https://management-ci.invalid/settings/security",
    );
  });

  // ---------------------------------------------------------------------------
  // Path non assoluto → errore
  // ---------------------------------------------------------------------------
  it("lancia errore se il path non inizia con /", () => {
    expect(() => managementStaffRedirectUrl("login")).toThrow();
  });

  it("lancia errore per stringa vuota", () => {
    expect(() => managementStaffRedirectUrl("")).toThrow();
  });

  // ---------------------------------------------------------------------------
  // MANAGEMENT_ORIGIN non HTTPS su origine non-loopback → errore
  // ---------------------------------------------------------------------------
  it("lancia errore se MANAGEMENT_ORIGIN è HTTP su origine non-loopback", () => {
    vi.stubEnv("MANAGEMENT_ORIGIN", "http://management-remote.invalid");
    expect(() => managementStaffRedirectUrl("/login")).toThrow();
  });

  // ---------------------------------------------------------------------------
  // Loopback accettato solo in locale/test
  // ---------------------------------------------------------------------------
  it("accetta MANAGEMENT_ORIGIN localhost in ambiente test", () => {
    vi.stubEnv("MANAGEMENT_ORIGIN", "http://localhost:3001");
    expect(managementStaffRedirectUrl("/login")).toBe("http://localhost:3001/login");
  });

  it("accetta MANAGEMENT_ORIGIN 127.0.0.1 in ambiente test", () => {
    vi.stubEnv("MANAGEMENT_ORIGIN", "http://127.0.0.1:3001");
    expect(managementStaffRedirectUrl("/login")).toBe("http://127.0.0.1:3001/login");
  });

  // ---------------------------------------------------------------------------
  // Production senza MANAGEMENT_ORIGIN → fallisce in chiusura
  // ---------------------------------------------------------------------------
  it("lancia errore in produzione senza MANAGEMENT_ORIGIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MANAGEMENT_ORIGIN", "");
    expect(() => managementStaffRedirectUrl("/login")).toThrow();
  });

  it("lancia errore in produzione anche se MANAGEMENT_ORIGIN è solo whitespace", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MANAGEMENT_ORIGIN", "   ");
    expect(() => managementStaffRedirectUrl("/login")).toThrow();
  });

  // ---------------------------------------------------------------------------
  // In test/development senza MANAGEMENT_ORIGIN usa fallback loopback
  // ---------------------------------------------------------------------------
  it("in test senza MANAGEMENT_ORIGIN usa un fallback loopback", () => {
    vi.stubEnv("MANAGEMENT_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "test");
    const result = managementStaffRedirectUrl("/login");
    // Deve essere un URL loopback valido, non lanciare
    expect(result).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/);
    expect(result).toMatch(/\/login$/);
  });

  // ---------------------------------------------------------------------------
  // Loopback NON accettato in produzione
  // ---------------------------------------------------------------------------
  it("lancia errore in produzione anche con MANAGEMENT_ORIGIN loopback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MANAGEMENT_ORIGIN", "http://localhost:3001");
    expect(() => managementStaffRedirectUrl("/login")).toThrow();
  });
});

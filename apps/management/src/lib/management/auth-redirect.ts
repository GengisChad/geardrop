/**
 * Costruisce URL di redirect sicuri per lo staff del gestionale.
 * - Usa MANAGEMENT_ORIGIN HTTPS quando l'origine è remota (non-loopback).
 * - Accetta origine loopback solo in ambienti locali/test (NODE_ENV !== "production").
 * - Richiede path assoluti (iniziano con /).
 * - In produzione senza MANAGEMENT_ORIGIN valido fallisce in chiusura.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/**
 * Costruisce l'URL assoluto di redirect per un path della stessa app gestionale.
 * Non permette mai redirect verso origini esterne.
 *
 * @param path Path assoluto della stessa app (es. "/login", "/mfa/enroll")
 * @returns URL completo come stringa
 */
export function managementStaffRedirectUrl(path: string): string {
  // Legge env a runtime (non module-scope) per permettere vi.stubEnv nei test.
  const rawOrigin = process.env["MANAGEMENT_ORIGIN"] ?? "";
  const nodeEnv = process.env["NODE_ENV"] ?? "development";
  const origin = rawOrigin.trim();
  const isProduction = nodeEnv === "production";

  // Il path deve essere assoluto.
  if (!path || !path.startsWith("/")) {
    throw new Error("GD_INVALID_REDIRECT_PATH: il path deve iniziare con /");
  }

  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("GD_MANAGEMENT_ORIGIN_INVALID: origine non è un URL valido");
    }

    const loopback = isLoopback(parsed.hostname);

    // In produzione il loopback non è un'origine valida.
    if (isProduction && loopback) {
      throw new Error(
        "GD_MANAGEMENT_REMOTE_REQUIRED: origine loopback non ammessa in produzione",
      );
    }

    // Origine remota non-loopback deve usare HTTPS.
    if (!loopback && parsed.protocol !== "https:") {
      throw new Error(
        "GD_MANAGEMENT_ORIGIN_NOT_HTTPS: origine remota richiede HTTPS",
      );
    }

    return `${origin}${path}`;
  }

  // Nessuna MANAGEMENT_ORIGIN configurata.
  if (isProduction) {
    throw new Error(
      "GD_MANAGEMENT_ORIGIN_REQUIRED: MANAGEMENT_ORIGIN obbligatorio in produzione",
    );
  }

  // In locale/test: fallback loopback.
  return `http://localhost:3001${path}`;
}

/**
 * Confine UI della seconda app gestionale.
 *
 * Prova quattro proprietà del Task 6 Step 4:
 *  1. apps/management non importa la root applicativa (src/).
 *  2. Nessun metodo Supabase mutante di business (.insert, .update, .delete, .upsert).
 *  3. L'unica RPC di scrittura esposta è set_management_read_access.
 *  4. Le pagine dati in (protected)/ hanno i due export di no-cache obbligatori.
 *
 * Assunzioni di confine scritte per resistere alle aggiunte parallele dell'agente shell:
 * – Quando (protected)/page.tsx (panoramica) arriva senza dynamic / fetchCache → RED.
 * – Quando (protected)/settings/security/page.tsx non esiste ancora → RED.
 * – account/ è esclusa: è una pagina di identità/MFA, non di dati aziendali.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(".");
const MANAGEMENT_SRC = resolve("apps/management/src");

// ---------------------------------------------------------------------------
// Helper: raccolta ricorsiva di file TypeScript/TSX
// ---------------------------------------------------------------------------

function collectTsFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      result.push(full);
    }
  }
  return result;
}

/** Legge il contenuto senza le righe di commento (//, * …) per ridurre falsi positivi. */
function stripLineComments(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^\s*\/\/|^\s*\*/.test(line))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Helper: "pagine dati" in (protected)/
//
// Una pagina dati è un page.tsx in (protected)/ (o sue sottodirectory) che
// espone dati di business. Escluso:
//   – la directory account/  (identità/MFA, non dati aziendali)
//   – i layout
// ---------------------------------------------------------------------------

function collectDataPages(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Salta account/: è una pagina identità, non di business
      if (entry.name === "account") continue;
      results.push(...collectDataPages(full));
    } else if (entry.isFile() && entry.name === "page.tsx") {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Confine degli import: apps/management non importa da src/ root
//
// Il controllo completo via TypeScript compiler API è in workspace-import-boundary.test.ts.
// Qui facciamo una verifica testuale mirata: nessun file management deve contenere
// import che puntino alla directory src/ root (storefront) tramite percorsi relativi
// tipo "../../src/..." o traversal che escono dall'app verso src/.
// I CSS module @/app/... interni all'app sono esclusi: usano il prefisso @/ che
// la tsconfig management risolve dentro apps/management/src.
// ---------------------------------------------------------------------------

describe("management UI boundary — import fence", () => {
  it("management app non importa dalla root applicativa (src/)", () => {
    const files = collectTsFiles(MANAGEMENT_SRC);
    // Pattern che indicano import dalla root:
    //   – ..+/src/ con due o più risalite → fuori dall'app
    //   – from "src/  (percorso diretto)
    // NON segnalato: @/... che rimane dentro apps/management/src
    const ROOT_IMPORT = /(?:from|import)\s+["'`](?:\.\.\/)+src\/|["'`]\.\.\/.*\/src\//g;
    const violations: string[] = [];
    for (const file of files) {
      const content = stripLineComments(readFileSync(file, "utf8"));
      ROOT_IMPORT.lastIndex = 0;
      const matches = content.match(ROOT_IMPORT);
      if (matches) {
        violations.push(
          `${relative(ROOT, file)}: import dalla root (${matches.join(", ")})`,
        );
      }
    }
    expect(violations, `Import root trovati:\n${violations.join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Nessun metodo Supabase mutante di business
// ---------------------------------------------------------------------------

describe("management UI boundary — no business mutations", () => {
  /**
   * Cerca i quattro metodi Supabase di scrittura nel sorgente dell'app.
   * Escluse:
   *   – caches.delete(  browser Cache API nel logout (non business)
   *   – righe di commento
   */
  it("nessuna chiamata .insert / .update / .delete / .upsert su client Supabase", () => {
    const files = collectTsFiles(MANAGEMENT_SRC);
    const SUPABASE_MUTATION = /\.(insert|update|delete|upsert)\s*\(/g;
    // Pattern che non devono essere segnalati (falsi positivi noti)
    const ALLOWED_PATTERNS = [
      /caches\.delete\s*\(/,
    ];

    const violations: string[] = [];
    for (const file of files) {
      const rawContent = readFileSync(file, "utf8");
      const content = stripLineComments(rawContent);
      let match: RegExpExecArray | null;
      SUPABASE_MUTATION.lastIndex = 0;
      while ((match = SUPABASE_MUTATION.exec(content)) !== null) {
        // Estrai la riga contestuale
        const start = content.lastIndexOf("\n", match.index) + 1;
        const end = content.indexOf("\n", match.index);
        const line = content.slice(start, end === -1 ? undefined : end).trim();
        // Salta i falsi positivi noti
        if (ALLOWED_PATTERNS.some((p) => p.test(line))) continue;
        violations.push(`${relative(ROOT, file)}: ${line}`);
      }
    }
    expect(violations, `Metodi mutanti trovati:\n${violations.join("\n")}`).toEqual([]);
  });

  /**
   * L'unica RPC di scrittura esposta nella surface management è
   * set_management_read_access.  Qualsiasi altra chiamata .rpc("…") che non
   * sia di sola lettura deve risultare in una violazione.
   */
  it("l'unica RPC di scrittura è set_management_read_access", () => {
    // Il file dell'azione control-plane deve esistere (RED se non ancora creato).
    const featuresActionPath = resolve(
      "apps/management/src/app/actions/features.ts",
    );
    expect(
      existsSync(featuresActionPath),
      "apps/management/src/app/actions/features.ts deve esistere",
    ).toBe(true);

    const READ_ONLY_RPCS = new Set([
      "list_management_features",
      "get_admin_dashboard_metrics",
    ]);
    const ALLOWED_WRITE_RPCS = new Set(["set_management_read_access"]);

    const files = collectTsFiles(MANAGEMENT_SRC);
    const RPC_CALL = /\.rpc\s*\(\s*["'`]([^"'`]+)["'`]/g;
    const violations: string[] = [];

    for (const file of files) {
      const rawContent = readFileSync(file, "utf8");
      const content = stripLineComments(rawContent);
      let match: RegExpExecArray | null;
      RPC_CALL.lastIndex = 0;
      while ((match = RPC_CALL.exec(content)) !== null) {
        const rpcName = match[1]!;
        if (!READ_ONLY_RPCS.has(rpcName) && !ALLOWED_WRITE_RPCS.has(rpcName)) {
          violations.push(
            `${relative(ROOT, file)}: rpc("${rpcName}") non autorizzato`,
          );
        }
      }
    }
    expect(
      violations,
      `RPC non autorizzate:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Pagine dati: dynamic + fetchCache obbligatori
// ---------------------------------------------------------------------------

describe("management UI boundary — data pages cache opt-out", () => {
  /**
   * Ogni page.tsx in (protected)/ (esclusa account/) deve esportare:
   *   export const dynamic = "force-dynamic"
   *   export const fetchCache = "force-no-store"
   *
   * Questo test è scritto in modo da restare valido quando l'agente shell
   * aggiunge (protected)/page.tsx (panoramica): se quella pagina non ha i due
   * export, il test segnala correttamente il problema.
   */
  it("(protected)/settings/security/page.tsx esiste", () => {
    const securityPage = resolve(
      "apps/management/src/app/(protected)/settings/security/page.tsx",
    );
    expect(
      existsSync(securityPage),
      "(protected)/settings/security/page.tsx deve essere creata",
    ).toBe(true);
  });

  it("tutte le pagine dati in (protected)/ hanno force-dynamic e force-no-store", () => {
    const protectedDir = resolve("apps/management/src/app/(protected)");
    const dataPages = collectDataPages(protectedDir);

    // La pagina sicurezza deve già essere tra quelle trovate.
    // Se non esiste ancora, il test precedente ha già fallito.
    const missing: string[] = [];
    for (const pagePath of dataPages) {
      const rel = relative(ROOT, pagePath);
      const content = readFileSync(pagePath, "utf8");
      if (!/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(content)) {
        missing.push(`${rel}: manca dynamic = "force-dynamic"`);
      }
      if (!/export\s+const\s+fetchCache\s*=\s*["']force-no-store["']/.test(content)) {
        missing.push(`${rel}: manca fetchCache = "force-no-store"`);
      }
    }
    expect(
      missing,
      `Pagine dati prive di export no-cache:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});

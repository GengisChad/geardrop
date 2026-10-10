import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Prova generale dell'aggiornamento su una COPIA del database del negozio.
 *
 * Sul database di produzione fa solo letture: un dump completo (che è anche il backup da tenere)
 * e la lista delle migration già applicate. Tutto il resto avviene sulla copia — per impostazione
 * predefinita lo stack Supabase locale in Docker — dove ripristina il dump, applica le migration
 * mancanti e confronta i conteggi riga per riga prima e dopo.
 *
 * Il database di produzione non viene mai scritto da questo script, nemmeno con --apply: per
 * aggiornarlo davvero si usa `supabase db push` dopo l'approvazione dei soci.
 *
 *   $env:PROD_DB_URL = "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
 *   pnpm tsx scripts/rehearse-production-upgrade.ts
 *
 * Opzioni: --copy-url <url> (default: stack locale) · --skip-dump (riusa il dump già scaricato)
 */

// The local copy is the local stack's database; its port is the [db] port in config.toml.
function localCopyUrl(): string {
  const config = readFileSync(join("supabase", "config.toml"), "utf8");
  const db = /^\[db\]\s*$([\s\S]*?)(?=^\[)/m.exec(config)?.[1] ?? "";
  const port = /^port\s*=\s*(\d+)/m.exec(db)?.[1];
  if (!port) throw new Error("supabase/config.toml senza porta [db]");
  return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
}
const BACKUP_DIR = "backup";

const require = createRequire(import.meta.url);

export type Counts = Readonly<Record<string, number>>;

/** Tabelle il cui numero di righe non deve cambiare con l'aggiornamento. */
export const COUNTED_TABLES = [
  "categories", "products", "product_images", "bundles", "bundle_items", "coupons", "promotions",
  "orders", "order_items", "order_notes", "order_status_events", "inventory_movements",
  "customer_profiles", "customer_addresses", "staff_profiles", "media_assets", "content_pages",
  "homepage_sections", "navigation_menus", "footer_columns", "social_links", "audit_events",
] as const;

/** Righe perse o comparse durante l'aggiornamento: deve restare vuoto. */
export function countDifferences(before: Counts, after: Counts): readonly string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((table) => (before[table] ?? 0) !== (after[table] ?? 0))
    .map((table) => `${table}: ${before[table] ?? 0} → ${after[table] ?? 0}`);
}

/** Il nome host di una stringa di connessione, senza password: l'unica parte che si può stampare. */
export function safeHost(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "indirizzo non leggibile";
  }
}

/** Migration presenti nel repo e non ancora applicate al database indicato. */
export function pendingMigrations(applied: readonly string[], local: readonly string[]): readonly string[] {
  const done = new Set(applied);
  return local.filter((version) => !done.has(version));
}

/** Le versioni nei nomi dei file in supabase/migrations. */
export function localMigrationVersions(files: readonly string[]): readonly string[] {
  return files.flatMap((name) => /^(\d{14})_.*\.sql$/.exec(name)?.[1] ?? []).sort();
}

/**
 * Toglie la password da qualunque testo: i comandi falliti stampano la riga che hanno eseguito,
 * connessione compresa, e quel testo finisce nei log.
 */
export function redact(text: string): string {
  // Greedy fino all'ultima @ del pezzo senza spazi: regge anche una password che contiene @.
  return text.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^\s]*@/gi, "$1***@");
}

function run<T>(label: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ${redact(detail)}`);
  }
}

/**
 * Dati che la copia deve ricevere: tutto il negozio (public e private) e gli utenti a cui gli
 * ordini sono legati. Il resto di auth e tutto storage appartengono alla piattaforma, che in
 * produzione gira una versione più recente di quella locale: le loro tabelle non coincidono e
 * non servono alla prova (le immagini restano sul sito, il gestionale legge public.media_assets).
 */
export function isRestorableTable(schema: string, table: string): boolean {
  if (schema === "public" || schema === "private") return true;
  return schema === "auth" && (table === "users" || table === "identities");
}

/**
 * Le policy sullo schema storage non entrano nel dump di Supabase: sono della piattaforma. In
 * produzione ci sono, sulla copia no, e una migration che le sostituisce le cerca. Si ricreano
 * come segnaposto (nessun permesso) e la migration le rimpiazza con quelle vere.
 */
export function storagePoliciesToRecreate(migrations: readonly string[]): readonly string[] {
  const names = migrations.flatMap((sql) => [
    ...sql.matchAll(/drop policy\s+(?:if exists\s+)?"([a-z0-9_]+)"\s+on\s+storage\.objects/gi),
  ].map((match) => match[1]!));
  return [...new Set(names)];
}

/** Tiene solo i blocchi COPY delle tabelle ripristinabili; il resto del file passa invariato. */
export function filterDataDump(dump: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of dump.split("\n")) {
    if (skipping) {
      if (line.trimEnd() === "\\.") skipping = false;
      continue;
    }
    const copy = /^COPY "?([a-z_]+)"?\."?([a-z_]+)"?/i.exec(line);
    if (copy && !isRestorableTable(copy[1]!.toLowerCase(), copy[2]!.toLowerCase())) {
      skipping = true;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

function supabase(args: readonly string[], options: { readonly quiet?: boolean } = {}): string {
  const cli = require.resolve("supabase/dist/supabase.js");
  return run(`supabase ${args[0]} ${args[1] ?? ""}`.trim(), () =>
    execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

/** psql dentro il container del database locale: non serve un client Postgres sul PC. */
function psql(connectionString: string, args: readonly string[], input?: string): string {
  const container = (() => {
    const config = readFileSync(join("supabase", "config.toml"), "utf8");
    const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
    if (!projectId) throw new Error("supabase/config.toml senza project_id");
    return process.env["SUPABASE_DB_CONTAINER"]?.trim() || `supabase_db_${projectId}`;
  })();
  // Dentro il container lo stack locale risponde su 5432, non sulla porta esposta al PC.
  const url = connectionString === localCopyUrl() ? "postgresql://postgres:postgres@127.0.0.1:5432/postgres" : connectionString;
  return run("psql", () =>
    execFileSync("docker", ["exec", "-i", container, "psql", url, "--set", "ON_ERROR_STOP=1", ...args], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

function countRows(connectionString: string): Counts {
  const query = COUNTED_TABLES
    .map((table) => `select '${table}' as tabella, count(*)::bigint as righe from public.${table}`)
    .join(" union all ");
  const output = psql(connectionString, ["--tuples-only", "--no-align", "--field-separator", "|", "--command", query]);
  return Object.fromEntries(
    output.split("\n").flatMap((line) => {
      const [table, rows] = line.trim().split("|");
      return table && rows ? [[table, Number(rows)] as const] : [];
    }),
  );
}

function appliedVersions(connectionString: string): readonly string[] {
  const output = psql(connectionString, [
    "--tuples-only", "--no-align", "--command",
    "select version from supabase_migrations.schema_migrations order by version",
  ]);
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function argument(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main(argv: readonly string[]): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Nessun file: la connessione può arrivare dall'ambiente della shell.
  }
  const production = process.env["PROD_DB_URL"]?.trim();
  if (!production) {
    console.error([
      "Manca PROD_DB_URL: la stringa di connessione al database del negozio (sola lettura).",
      "Supabase → Project Settings → Database → Connection string → URI, con la password del database.",
      'PowerShell:  $env:PROD_DB_URL = "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"',
    ].join("\n"));
    process.exitCode = 1;
    return;
  }
  const copy = argument(argv, "--copy-url") ?? localCopyUrl();
  if (safeHost(copy) === safeHost(production)) {
    console.error("La copia e la produzione sono lo stesso database: la prova generale si fa altrove.");
    process.exitCode = 1;
    return;
  }

  console.log(`Produzione (sola lettura): ${safeHost(production)}`);
  console.log(`Copia su cui si prova:     ${safeHost(copy)}\n`);

  const schemaFile = join(BACKUP_DIR, "produzione-schema.sql");
  const dataFile = join(BACKUP_DIR, "produzione-dati.sql");
  if (!argv.includes("--skip-dump")) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    console.log("1/6 Backup della produzione (schema e dati)…");
    supabase(["db", "dump", "--db-url", production, "--file", schemaFile], { quiet: true });
    supabase(["db", "dump", "--db-url", production, "--data-only", "--use-copy", "--file", dataFile], { quiet: true });
    console.log(`     salvati in ${BACKUP_DIR}/ — conservali fino a rilascio riuscito.`);
  }

  console.log("2/6 Migration già applicate in produzione…");
  const applied = appliedVersions(production);
  const files = require("node:fs").readdirSync(join("supabase", "migrations")) as string[];
  const migrationFile = (version: string) => files.find((name) => name.startsWith(`${version}_`))?.slice(version.length + 1) ?? "";
  const local = localMigrationVersions(files);
  const pending = pendingMigrations(applied, local);
  console.log(`     applicate ${applied.length} · da applicare ${pending.length}`);
  for (const version of pending) console.log(`     · ${version}`);
  if (pending.length === 0) {
    console.log("\nNiente da provare: la produzione ha già tutte le migration.");
    return;
  }

  console.log("3/6 Ripristino del backup sulla copia…");
  // Si svuotano gli schemi che il dump ricrea (public e private) e quelli che creano le migration
  // da provare (management_api): una copia usata per prove precedenti li ha già, e la migration
  // che li crea fallirebbe sulla copia senza fallire in produzione. Il resto — auth, storage,
  // realtime — è gestito dalla piattaforma e resta com'è.
  psql(copy, ["--quiet", "--command", [
    "drop schema if exists public cascade;",
    "drop schema if exists private cascade;",
    "drop schema if exists management_api cascade;",
    "create schema public;",
    "grant usage on schema public to postgres, anon, authenticated, service_role;",
    "grant all on schema public to postgres, service_role;",
    "truncate supabase_migrations.schema_migrations;",
    // La copia può avere utenti e file di prove precedenti: si riparte da quelli della produzione.
    "truncate auth.users cascade;",
    "truncate storage.objects cascade;",
    "truncate storage.buckets cascade;",
  ].join(" ")]);
  psql(copy, ["--quiet", "--file", "-"], readFileSync(schemaFile, "utf8"));
  psql(copy, ["--quiet", "--file", "-"], filterDataDump(readFileSync(dataFile, "utf8")));
  // La storia delle migration non è nel dump: la si riallinea a quella della produzione.
  psql(copy, ["--quiet", "--command", `insert into supabase_migrations.schema_migrations (version) values ${applied.map((version) => `('${version}')`).join(",")} on conflict do nothing`]);

  const placeholders = storagePoliciesToRecreate(
    pending.map((version) => readFileSync(join("supabase", "migrations", `${version}_${migrationFile(version)}`), "utf8")),
  );
  for (const name of placeholders) {
    psql(copy, ["--quiet", "--command", `do $$ begin create policy "${name}" on storage.objects for select to authenticated using (false); exception when duplicate_object then null; end $$;`]);
  }

  const before = countRows(copy);
  console.log("4/6 Applico le migration mancanti sulla copia…");
  supabase(["migration", "up", "--db-url", copy, "--include-all"]);

  console.log("5/6 Conteggi prima e dopo…");
  const after = countRows(copy);
  const differences = countDifferences(before, after);
  for (const table of COUNTED_TABLES) console.log(`     ${table.padEnd(24)} ${String(before[table] ?? 0).padStart(6)} → ${String(after[table] ?? 0).padStart(6)}`);

  console.log("6/6 Controlli sulle aziende…");
  const checks = psql(copy, ["--tuples-only", "--no-align", "--command", `
    select 'aziende: ' || string_agg(slug, ', ' order by slug) from public.organizations
    union all
    select 'righe fuori da Gear Drop: ' || count(*)::text from public.products
      where organization_id is distinct from (select id from public.organizations where slug = 'geardrop')
    union all
    select 'ordini senza aliquota IVA: ' || count(*)::text from public.orders where vat_rate_bp is null
    union all
    select 'soci owner di Gear Drop: ' || count(*)::text from public.organization_members
      where organization_id = (select id from public.organizations where slug = 'geardrop') and role = 'owner' and active;
  `]);
  console.log(checks.split("\n").filter(Boolean).map((line) => `     ${line}`).join("\n"));

  if (differences.length > 0) {
    console.error(`\nFERMATI: cambia il numero di righe di ${differences.join(" · ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nProva riuscita: nessuna riga persa. Ora apri il gestionale sulla copia e provalo con i dati veri.");
  writeFileSync(join(BACKUP_DIR, "prova-generale.txt"), [
    `Prova generale del ${new Date().toISOString()}`,
    `Produzione: ${safeHost(production)} · copia: ${safeHost(copy)}`,
    `Migration applicate nella prova: ${pending.join(", ")}`,
    ...COUNTED_TABLES.map((table) => `${table}: ${before[table] ?? 0} → ${after[table] ?? 0}`),
  ].join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}

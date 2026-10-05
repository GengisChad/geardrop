import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Applies migrations to the GearDrop project through the Management API, the way `db push`
 * would — the Node twin of scripts/apply-migration.py, for machines without Python.
 *
 * The Supabase CLI cannot open a Postgres connection from here (the direct host is
 * IPv6-only and the pooler refuses), so the statements go through POST /database/query and
 * the version is recorded in supabase_migrations.schema_migrations afterwards, exactly as
 * the CLI does. A version already recorded is skipped rather than replayed.
 *
 *   node scripts/apply-migration.mjs --check              what is missing, writes nothing
 *   node scripts/apply-migration.mjs <file> [<file>…]     apply those, in the order given
 *   node scripts/apply-migration.mjs --all                apply every missing one, oldest first
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "cvwigsymjlpulwgjkzix";
const API = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

function token() {
  const line = readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("SUPABASE_ACCESS_TOKEN="));
  if (!line) throw new Error("SUPABASE_ACCESS_TOKEN non è in .env.local");
  return line.slice("SUPABASE_ACCESS_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
}

async function run(query) {
  const response = await fetch(API, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await response.text();
  // The error body can quote the failing statement, which is the only useful part of it.
  if (!response.ok) throw new Error(`${response.status}: ${body.slice(0, 600)}`);
  return body.trim() ? JSON.parse(body) : [];
}

const applied = new Set(
  (await run("select version from supabase_migrations.schema_migrations")).map((row) => row.version),
);

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const files = argv.includes("--all")
  ? (await import("node:fs")).readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()
  : argv.filter((arg) => !arg.startsWith("--"));

if (files.length === 0) {
  console.error("Nessuna migrazione indicata. Usa --all oppure elenca i file.");
  process.exit(1);
}

for (const file of files) {
  const full = path.isAbsolute(file) ? file : path.join(MIGRATIONS, path.basename(file));
  const base = path.basename(full);
  const separator = base.indexOf("_");
  const version = base.slice(0, separator);
  const name = base.slice(separator + 1).replace(/\.sql$/, "");

  if (applied.has(version)) {
    console.log(`già applicata   ${version}  ${name}`);
    continue;
  }
  if (check) {
    console.log(`DA APPLICARE    ${version}  ${name}`);
    continue;
  }

  await run(readFileSync(full, "utf8"));
  // Recorded only once the statements went through, so a failure leaves no false history.
  await run(
    `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name.replaceAll("'", "''")}') on conflict (version) do nothing`,
  );
  applied.add(version);
  console.log(`APPLICATA       ${version}  ${name}`);
}

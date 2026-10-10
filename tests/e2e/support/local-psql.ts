import { execFileSync, type ExecFileSyncOptionsWithStringEncoding, type ExecFileSyncOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The local Supabase stack's database, as the host sees it. The port comes from the [db] table of
 * supabase/config.toml, like the container name comes from its project id, so the helper follows
 * the stack wherever the config puts it.
 */
export function localDatabaseUrl(): string {
  const config = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8");
  const db = /^\[db\]\s*$([\s\S]*?)(?=^\[)/m.exec(config)?.[1] ?? "";
  const port = /^port\s*=\s*(\d+)/m.exec(db)?.[1];
  if (!port) throw new Error("supabase/config.toml has no [db] port");
  return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
}

/** The same database from inside its own container, where Postgres listens on 5432. */
const IN_CONTAINER_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

function databaseContainer(): string {
  const explicit = process.env["SUPABASE_DB_CONTAINER"]?.trim();
  if (explicit) return explicit;
  // `supabase start` names the database container after the project id in config.toml.
  const config = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error("supabase/config.toml has no project_id: set SUPABASE_DB_CONTAINER");
  return `supabase_db_${projectId}`;
}

function isMissingExecutable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/**
 * Runs psql against the local Supabase stack with the given arguments (everything after the
 * connection string). CI runners have a native psql on the PATH and use it unchanged. A
 * computer without a Postgres client — Windows, typically — runs the very same arguments
 * inside the stack's database container through `docker exec`.
 */
export function localPsql(args: readonly string[], options: ExecFileSyncOptionsWithStringEncoding): string;
export function localPsql(args: readonly string[], options?: ExecFileSyncOptions): string | Buffer;
export function localPsql(args: readonly string[], options: ExecFileSyncOptions = {}): string | Buffer {
  try {
    return execFileSync("psql", [localDatabaseUrl(), ...args], options);
  } catch (error) {
    if (!isMissingExecutable(error)) throw error;
    return execFileSync("docker", ["exec", "-i", databaseContainer(), "psql", IN_CONTAINER_DATABASE_URL, ...args], options);
  }
}

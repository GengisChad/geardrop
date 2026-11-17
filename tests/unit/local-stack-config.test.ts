import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every worktree of this repository shares one Docker host. While this branch and the shop
// branches diverge, they must not share one Supabase stack: on 6 October 2026 a reset from the
// Vinted branch replaced this branch's local schema, and a reset from here would have wiped theirs.
// The branches still on the old config use the name and ports below; this stack keeps clear of both.
const SHARED = { name: "GearDrop-admin-supabase", lowest: 54320, highest: 54329 };

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const config = read("supabase/config.toml");

function databasePort(text: string): string | undefined {
  const db = /^\[db\]\s*$([\s\S]*?)(?=^\[)/m.exec(text)?.[1] ?? "";
  return /^port\s*=\s*(\d+)/m.exec(db)?.[1];
}

function listeningPorts(text: string): number[] {
  return [...text.matchAll(/^\s*(?:port|shadow_port|inspector_port)\s*=\s*(\d+)/gm)].map((match) => Number(match[1]));
}

describe("this branch's local Supabase stack", () => {
  it("reads the port of the [db] table itself, not the shadow database's or the pooler's", () => {
    expect(databasePort("[db]\nshadow_port = 1\nport = 2\n[db.pooler]\nport = 3\n")).toBe("2");
  });

  it("does not take the name of the stack the other branches still use", () => {
    expect(/^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1]).not.toBe(SHARED.name);
  });

  it("listens on ports a stack on the old config never uses, so both can run at once", () => {
    expect(listeningPorts(config).filter((port) => port >= SHARED.lowest && port <= SHARED.highest)).toEqual([]);
  });

  it("points CI's direct psql at the config's database port", () => {
    expect(read(".github/workflows/supabase-database-ci.yml")).toContain(`127.0.0.1:${databasePort(config)}/postgres`);
  });
});

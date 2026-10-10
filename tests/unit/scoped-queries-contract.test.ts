import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every query on a company's rows names the company. Row level security already stops a
 * person from reading a company they do not work for; this contract stops the app from
 * mixing the companies someone does work for, and covers the secret-key paths (the Stripe
 * webhook) where row level security does not apply at all.
 *
 * A `.from("<table>")` chain on a tier A or B table must mention organization_id. Inserts and
 * upserts are checked by the compiler instead: the generated types make organization_id
 * required on those tables. An RPC whose organization parameter is optional in the database
 * (it defaults to the storefront's company) must still be passed one explicitly.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Reasoned exceptions, one per `file:table`. */
const ALLOWED_UNSCOPED: Readonly<Record<string, string>> = {
  "src/lib/auth/customer.ts:customer_profiles":
    "the signed-in customer's own profile, read by primary key: an account belongs to exactly one company",
};

function scopedTables(): ReadonlySet<string> {
  // The tier registry in the database tests is the single source of truth.
  const registry = read("supabase/tests/044_organization_tier_registry.test.sql");
  return new Set([...registry.matchAll(/\('([a-z_]+)', '([ABCG])'\)/g)].filter((match) => match[2] === "A" || match[2] === "B").map((match) => match[1]!));
}

function optionalOrganizationRpcsFrom(source: string): ReadonlySet<string> {
  const normalized = source.replace(/\r\n?/g, "\n");
  const functions = normalized.slice(normalized.indexOf("Functions: {"));
  return new Set(
    [...functions.matchAll(/\n {6}([a-z_]+): \{\n {8}Args:([\s\S]*?)\n {8}Returns/g)]
      .filter((match) => match[2]!.includes("p_organization_id?:"))
      .map((match) => match[1]!),
  );
}

function optionalOrganizationRpcs(): ReadonlySet<string> {
  return optionalOrganizationRpcsFrom(read("packages/data-contract/src/database.types.ts"));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && name !== "database.types.ts" ? [path] : [];
  });
}

/** The statement a call starts: up to its semicolon, or the next query in the same expression. */
function statementAfter(source: string, index: number): string {
  const rest = source.slice(index);
  const ends = [rest.indexOf(";"), rest.indexOf(".from(", 1)].filter((end) => end > 0);
  return rest.slice(0, ends.length ? Math.min(...ends) : 800);
}

type Finding = { readonly file: string; readonly line: number; readonly target: string };

function scan() {
  const tables = scopedTables();
  const rpcs = optionalOrganizationRpcs();
  const unscoped: Finding[] = [];
  const allowed = new Set<string>();
  let queries = 0;
  let rpcCalls = 0;

  for (const path of sourceFiles("src")) {
    const file = relative(root, join(root, path)).replaceAll("\\", "/");
    const source = read(path).replace(/\r\n?/g, "\n");
    const line = (index: number) => source.slice(0, index).split("\n").length;

    for (const match of source.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) {
      const table = match[1]!;
      if (!tables.has(table)) continue;
      queries += 1;
      const statement = statementAfter(source, match.index);
      if (statement.includes("organization_id") || /\.(insert|upsert)\(/.test(statement)) continue;
      if (ALLOWED_UNSCOPED[`${file}:${table}`]) {
        allowed.add(`${file}:${table}`);
        continue;
      }
      unscoped.push({ file, line: line(match.index), target: table });
    }

    for (const match of source.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)) {
      const fn = match[1]!;
      if (!rpcs.has(fn)) continue;
      rpcCalls += 1;
      if (!statementAfter(source, match.index).includes("p_organization_id")) {
        unscoped.push({ file, line: line(match.index), target: `rpc ${fn}` });
      }
    }
  }
  return { tables, rpcs, unscoped, allowed, queries, rpcCalls };
}

/**
 * RPCs that also keep their pre-organization signature during the rollout (migration
 * 20261009091016_keep_the_running_app_working_during_rollout.sql): in the generated types they
 * are a union where one variant takes p_organization_id and another does not.
 */
function legacyOverloadRpcsFrom(source: string): ReadonlySet<string> {
  const normalized = source.replace(/\r\n?/g, "\n");
  const functions = normalized.slice(normalized.indexOf("Functions: {"));
  const legacy = new Set<string>();
  for (const match of functions.matchAll(/\n {6}([a-z_]+):\n((?: {8}\|[\s\S]*?))(?=\n {6}[a-z_]+:|\n {4}\})/g)) {
    const variants = match[2]!.split(/\n {8}\| /);
    const scoped = variants.filter((variant) => variant.includes("p_organization_id"));
    if (scoped.length > 0 && scoped.length < variants.length) legacy.add(match[1]!);
  }
  return legacy;
}

/** Every call site of an overloaded RPC in the apps and the shared packages, without the company. */
function legacyCalls(rpcs: ReadonlySet<string>) {
  const unscoped: Finding[] = [];
  let calls = 0;
  const directories = ["src", "apps/management/src", "packages/data-contract/src", "packages/runtime-contract/src"];
  for (const path of directories.flatMap(sourceFiles)) {
    const file = path.replaceAll("\\", "/");
    const source = read(path).replace(/\r\n?/g, "\n");
    for (const match of source.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)) {
      if (!rpcs.has(match[1]!)) continue;
      calls += 1;
      if (!statementAfter(source, match.index).includes("p_organization_id")) {
        unscoped.push({ file, line: source.slice(0, match.index).split("\n").length, target: `rpc ${match[1]}` });
      }
    }
  }
  return { unscoped, calls };
}

/** The transitional site_settings.singleton column is for the old app only. */
function singletonReads(): readonly string[] {
  const directories = ["src", "apps/management/src", "packages/data-contract/src", "packages/runtime-contract/src"];
  return directories.flatMap(sourceFiles)
    .filter((path) => /\bsingleton\b/.test(read(path)))
    .map((path) => path.replaceAll("\\", "/"));
}

describe("the rollout's transitional database pieces stay unused by this app", () => {
  const types = read("packages/data-contract/src/database.types.ts");
  const legacy = legacyOverloadRpcsFrom(types);

  it("finds the overloaded RPCs in the generated types, in either layout", () => {
    expect([...legacyOverloadRpcsFrom(
      "Functions: {\n      a_rpc:\n        | { Args: never; Returns: Json }\n        | { Args: { p_organization_id: number }; Returns: Json }\n      b_rpc: {\n        Args: { p_x: number }\n        Returns: Json\n      }\n    }",
    )]).toEqual(["a_rpc"]);
    expect([...legacy].sort()).toEqual([
      "adjust_inventory", "change_staff_role", "get_admin_dashboard_metrics", "get_inventory_restock_demand",
      "read_funnel_stats", "record_staff_invite", "save_bundle_with_items", "save_coupon_with_targets",
      "save_footer_configuration", "save_homepage_section", "save_navigation_tree", "save_promotion_with_targets",
      "set_manual_order_enablement_check", "set_order_acceptance", "set_staff_active",
    ]);
  });

  it("always calls the scoped signature, never the old one the types now also allow", () => {
    const result = legacyCalls(legacy);
    // The scan must see the app's calls, or it proves nothing.
    expect(result.calls).toBeGreaterThan(10);
    expect(result.unscoped).toEqual([]);
  });

  it("never reads site_settings.singleton", () => {
    expect(singletonReads()).toEqual([]);
  });
});

describe("organization-scoped queries", () => {
  const result = scan();

  it("parses the optional-company RPC signature with either line ending", () => {
    const signature = "Functions: {\n      track_storefront_event: {\n        Args: { p_organization_id?: string }\n        Returns: undefined\n      }\n    }";
    expect([...optionalOrganizationRpcsFrom(signature)]).toEqual(["track_storefront_event"]);
    expect([...optionalOrganizationRpcsFrom(signature.replace(/\n/g, "\r\n"))]).toEqual(["track_storefront_event"]);
  });

  it("reads the tier registry and the optional-company RPCs", () => {
    expect(result.tables.has("products")).toBe(true);
    expect(result.tables.has("order_items")).toBe(true);
    expect(result.tables.has("product_specs")).toBe(false);
    expect([...result.rpcs].sort()).toEqual(["record_stripe_checkout_order", "request_restock_notice", "track_storefront_event"]);
    // The scan must actually see the app's queries, or it proves nothing.
    expect(result.queries).toBeGreaterThan(100);
    expect(result.rpcCalls).toBe(3);
  });

  it("names the company on every query of a company's rows", () => {
    expect(result.unscoped).toEqual([]);
  });

  it("keeps every allowlisted exception in use", () => {
    expect([...result.allowed].sort()).toEqual(Object.keys(ALLOWED_UNSCOPED).sort());
  });
});

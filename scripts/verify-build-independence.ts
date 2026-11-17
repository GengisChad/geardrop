import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Result = { code: number; output: string };
type Runner = (script: string, env: NodeJS.ProcessEnv) => Promise<Result>;
const probes = ["src/app/__build_isolation_probe__/page.tsx", "apps/management/src/app/__build_isolation_probe__/page.tsx", "packages/runtime-contract/src/__build_isolation_probe__.ts"] as const;
const probeContents = "const isolationProbe: string = 42;\nexport default function IsolationProbe() { return isolationProbe; }\n";

export function buildEnvironment(surface: "management" | "storefront"): NodeJS.ProcessEnv {
  // Preserve process/runtime plumbing, but never inherit deployment targets or secrets.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/SUPABASE|APP_SURFACE|MANAGEMENT|STOREFRONT|LEGACY_ADMIN|COMMERCE_PROVIDER|CONTENT_PROVIDER/i.test(name)));
  Object.assign(env, { NEXT_PUBLIC_APP_SURFACE: surface, COMMERCE_PROVIDER: "mock", CONTENT_PROVIDER: "mock", LEGACY_ADMIN_MODE: "enabled", NEXT_TELEMETRY_DISABLED: "1" });
  if (surface === "management") Object.assign(env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://ci-management.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ci-publishable-key",
    NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "ci-management",
    MANAGEMENT_ORIGIN: "https://management-ci.invalid",
    STOREFRONT_ORIGIN: "https://storefront-ci.invalid",
    MANAGEMENT_MODE: "read_only",
  });
  return env;
}

function commandRunner(root: string): Runner {
  return (script, env) => new Promise((resolveResult, reject) => {
    // npm_execpath is the exact pnpm JS entry point running this package script.
    const pnpm = process.env.npm_execpath;
    if (!pnpm || !/pnpm/i.test(pnpm)) { reject(new Error("GD_RUNNER_REQUIRES_PNPM_SCRIPT")); return; }
    const child = spawn(process.execPath, [pnpm, script], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => { output += String(data); });
    child.stderr.on("data", data => { output += String(data); });
    child.on("error", reject);
    child.on("close", code => resolveResult({ code: code ?? -1, output }));
  });
}

export async function verifyBuildIndependence(options: { root: string; run?: Runner; status?: () => string }) {
  const root = resolve(options.root);
  const status = options.status ?? (() => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8", windowsHide: true }));
  const run = options.run ?? commandRunner(root);
  const paths = probes.map(path => join(root, path));
  // Keep the lock outside either Next output, which next build is allowed to replace.
  const lock = join(root, "node_modules/.cache/build-independence.lock");
  const before = status();
  if (paths.some(path => existsSync(path))) throw new Error("GD_SENTINEL_EXISTS");
  mkdirSync(dirname(lock), { recursive: true });
  let descriptor: number;
  try { descriptor = openSync(lock, "wx"); } catch { throw new Error("GD_BUILD_INDEPENDENCE_LOCKED"); }
  const createdDirectories: string[] = [];
  const owned = new Map<string, string>();
  const results: { script: string; expected: "pass" | "fail"; code: number }[] = [];
  const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
  function removeProbe(path: string) {
    if (!owned.has(path)) return;
    if (!existsSync(path) || hash(readFileSync(path)) !== owned.get(path)) throw new Error("GD_SENTINEL_CHANGED_EXTERNALLY");
    unlinkSync(path); owned.delete(path);
  }
  function createProbe(path: string) {
    const missing: string[] = []; let directory = dirname(path);
    while (!existsSync(directory)) { missing.push(directory); directory = dirname(directory); }
    mkdirSync(dirname(path), { recursive: true }); createdDirectories.push(...missing.reverse());
    writeFileSync(path, probeContents, { flag: "wx" }); owned.set(path, hash(probeContents));
  }
  async function check(script: string, expected: "pass" | "fail") {
    const result = await run(script, buildEnvironment(script === "build:management" ? "management" : "storefront"));
    results.push({ script, expected, code: result.code });
    // Intentional compiler diagnostics are deliberately redacted, including environment data.
    console.log(`${script}: expected ${expected}, exit ${result.code}; diagnostics redacted`);
    if ((result.code === 0) !== (expected === "pass")) throw new Error(`GD_BUILD_EXPECTATION_FAILED: ${script} expected ${expected}, exit ${result.code}`);
    if (expected === "fail" && (!result.output.includes("__build_isolation_probe__") || !result.output.includes("not assignable to type"))) throw new Error(`GD_SENTINEL_DIAGNOSTIC_MISSING: ${script}`);
  }
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, paths: probes, before, initialHashes: paths.map(() => null) }));
    createProbe(paths[0]!);
    await check("build:management", "pass"); await check("build:storefront", "fail");
    removeProbe(paths[0]!); createProbe(paths[1]!);
    await check("build:storefront", "pass"); await check("build:management", "fail");
    removeProbe(paths[1]!); createProbe(paths[2]!);
    await check("build:storefront", "fail"); await check("build:management", "fail");
  } finally {
    try {
      for (const path of paths) removeProbe(path);
      for (const directory of createdDirectories.reverse()) rmdirSync(directory);
    } finally { closeSync(descriptor); unlinkSync(lock); }
    if (paths.some(path => existsSync(path))) throw new Error("GD_SENTINEL_RESIDUE");
    if (status() !== before) throw new Error("GD_BUILD_STATUS_CHANGED");
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyBuildIndependence({ root: process.cwd() }).then(() => console.log("Build independence: PASS (6 expectations)"), error => { console.error(error instanceof Error ? error.message : "GD_BUILD_INDEPENDENCE_FAILED"); process.exitCode = 1; });
}

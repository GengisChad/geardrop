import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

async function runner() {
  expect(existsSync(resolve("scripts/verify-build-independence.ts"))).toBe(true);
  return import("../../scripts/verify-build-independence");
}
const probes = ["src/app/__build_isolation_probe__/page.tsx", "apps/management/src/app/__build_isolation_probe__/page.tsx", "packages/runtime-contract/src/__build_isolation_probe__.ts"];
describe("serial build isolation sentinel runner", () => {
  it("proves both app directions and shared failures with a fixed fictitious environment", async () => {
    const { verifyBuildIndependence } = await runner();
    const root = mkdtempSync(join(tmpdir(), "gd-build-probe-"));
    const seen: string[] = []; const state: string[] = [];
    try {
      await verifyBuildIndependence({ root, status: () => "original-status", run: async (script, env) => {
        seen.push(script);
        const active = probes.filter(p => existsSync(join(root, p)));
        expect(active).toHaveLength(1); state.push(active[0]!);
        if (script === "build:management") {
          expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://ci-management.supabase.co");
          expect(env.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF).toBe("ci-management");
          expect(env.MANAGEMENT_ORIGIN).toBe("https://management-ci.invalid");
          expect(env.STOREFRONT_ORIGIN).toBe("https://storefront-ci.invalid");
          expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("ci-publishable-key");
          expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
        }
        const fails = active[0] === probes[2] || (script === "build:management" ? active[0] === probes[1] : active[0] === probes[0]);
        return { code: fails ? 1 : 0, output: fails ? "__build_isolation_probe__: Type 'number' is not assignable to type 'string'." : "ok" };
      } });
      expect(seen).toEqual(["build:management", "build:storefront", "build:storefront", "build:management", "build:storefront", "build:management"]);
      expect(state).toEqual([probes[0], probes[0], probes[1], probes[1], probes[2], probes[2]]);
      for (const p of probes) expect(existsSync(join(root, p))).toBe(false);
      expect(existsSync(join(root, "node_modules/.cache/build-independence.lock"))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("cleans up on an exception and refuses existing sentinels or a concurrent lock", async () => {
    const { verifyBuildIndependence } = await runner();
    const root = mkdtempSync(join(tmpdir(), "gd-build-probe-"));
    const options = { root, status: () => "original", run: async () => { throw new Error("simulated failure"); } };
    try {
      await expect(verifyBuildIndependence(options)).rejects.toThrow("simulated failure");
      for (const p of probes) expect(existsSync(join(root, p))).toBe(false);
      mkdirSync(join(root, "src/app/__build_isolation_probe__"), { recursive: true });
      const bytes = Buffer.from([0, 1, 2, 255]); writeFileSync(join(root, probes[0]!), bytes);
      await expect(verifyBuildIndependence(options)).rejects.toThrow("GD_SENTINEL_EXISTS");
      expect(readFileSync(join(root, probes[0]!))).toEqual(bytes);
      rmSync(join(root, probes[0]!));
      mkdirSync(join(root, "node_modules/.cache"), { recursive: true }); writeFileSync(join(root, "node_modules/.cache/build-independence.lock"), "other runner");
      await expect(verifyBuildIndependence(options)).rejects.toThrow("GD_BUILD_INDEPENDENCE_LOCKED");
      expect(readFileSync(join(root, "node_modules/.cache/build-independence.lock"), "utf8")).toBe("other runner");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("fails when an expected failing build succeeds or git state changes", async () => {
    const { verifyBuildIndependence } = await runner();
    const root = mkdtempSync(join(tmpdir(), "gd-build-probe-"));
    try {
      await expect(verifyBuildIndependence({ root, status: () => "same", run: async () => ({ code: 0, output: "" }) })).rejects.toThrow("GD_BUILD_EXPECTATION_FAILED");
      let calls = 0;
      await expect(verifyBuildIndependence({ root, status: () => String(calls++), run: async () => { throw new Error("failure"); } })).rejects.toThrow("GD_BUILD_STATUS_CHANGED");
      for (const p of probes) expect(existsSync(join(root, p))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("rejects an unrelated failing build instead of claiming sentinel proof", async () => {
    const { verifyBuildIndependence } = await runner();
    const root = mkdtempSync(join(tmpdir(), "gd-build-probe-"));
    try {
      let calls = 0;
      await expect(verifyBuildIndependence({ root, status: () => "same", run: async () => ({ code: calls++ === 0 ? 0 : 1, output: "network unavailable" }) })).rejects.toThrow("GD_SENTINEL_DIAGNOSTIC_MISSING");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

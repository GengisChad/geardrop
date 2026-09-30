import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

async function checker() {
  expect(existsSync(resolve("scripts/check-workspace-boundaries.ts"))).toBe(true);
  return import("../../scripts/check-workspace-boundaries");
}
describe("management compiler import boundary", () => {
  it("accepts package exports and rejects relative traversal and root aliases", async () => {
    const { checkSourceImports } = await checker();
    const sourceFile = resolve("apps/management/src/probe.ts");
    for (const [fixture, count] of [["allowed-package-import.ts", 0], ["forbidden-root-route-import.ts", 1], ["forbidden-root-config-import.ts", 1]] as const) {
      const source = readFileSync(resolve("tests/fixtures/workspace-boundary", fixture), "utf8");
      expect(checkSourceImports(source, sourceFile, process.cwd()), fixture).toHaveLength(count);
    }
  });
  it("checks import, export-from, import(), require(), deep imports and undeclared dependencies", async () => {
    const { checkSourceImports } = await checker();
    const sourceFile = resolve("apps/management/src/probe.ts");
    for (const source of [
      'export { default } from "../../../next.config";',
      'void import("../../../src/lib/supabase/env");',
      'type RootConfig = import("../../../next.config").default;',
      'require("../../../src/components/admin/admin-shell");',
      'import type { Database } from "@geardrop/data-contract/src/database.types";',
      'import "../../../packages/runtime-contract/src/index";',
      'import "zustand";',
      'import "@/../../src/app/admin/page";',
    ]) expect(checkSourceImports(source, sourceFile, process.cwd()), source).toHaveLength(1);
    expect(checkSourceImports('import type { Database } from "@geardrop/data-contract"; import "next/server";', sourceFile, process.cwd())).toEqual([]);
  });
  it("follows realpaths so local symlinks cannot import root files", async () => {
    const { checkSourceImports } = await checker();
    const root = mkdtempSync(join(tmpdir(), "gd-boundary-"));
    try {
      mkdirSync(join(root, "apps/management/src"), { recursive: true });
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "apps/management/package.json"), '{"dependencies":{}}');
      writeFileSync(join(root, "apps/management/tsconfig.json"), '{"compilerOptions":{"moduleResolution":"bundler","module":"esnext"}}');
      writeFileSync(join(root, "src/secret.ts"), "export const secret = 1;");
      symlinkSync(join(root, "src"), join(root, "apps/management/src/escape"), "junction");
      expect(checkSourceImports('import "./escape/secret";', join(root, "apps/management/src/probe.ts"), root)).toHaveLength(1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("validates every owned application source", async () => {
    const { checkWorkspaceBoundaries } = await checker();
    expect(checkWorkspaceBoundaries(process.cwd())).toEqual([]);
  });
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string) => JSON.parse(read(path));

describe("physical Next application ownership", () => {
  it("declares exactly the two workspace globs and pins the supported package manager", () => {
    expect(read("pnpm-workspace.yaml")).toMatch(/packages:\s*\n\s*- "apps\/\*"\s*\n\s*- "packages\/\*"/);
    expect(json("package.json").packageManager).toBe("pnpm@10.34.6");
  });
  it("gives management its own application entry points without moving storefront", () => {
    for (const path of ["package.json", "next.config.ts", "tsconfig.json", "next-env.d.ts", "src/proxy.ts", "src/app/layout.tsx", "src/app/(protected)/page.tsx", "src/app/robots.ts"]) {
      expect(existsSync(resolve("apps/management", path)), path).toBe(true);
    }
    expect(existsSync(resolve("src/app/(storefront)/page.tsx"))).toBe(true);
    expect(existsSync(resolve("apps/storefront"))).toBe(false);
  });
  it("keeps automatic TypeScript inputs local to each application", () => {
    expect(existsSync(resolve("apps/management/tsconfig.json"))).toBe(true);
    for (const path of ["tsconfig.json", "apps/management/tsconfig.json"]) {
      const config = ts.readConfigFile(resolve(path), ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(path, ".."));
      const forbidden = path === "tsconfig.json" ? /\/apps\/|\/packages\// : /gestionale-cloud\/src\//;
      expect(parsed.fileNames.filter((name) => forbidden.test(name.replaceAll("\\", "/")))).toEqual([]);
    }
    expect(json("apps/management/tsconfig.json").include).toEqual(["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"]);
  });
  it("exposes independent commands, direct dependencies and shared contract checking", () => {
    const root = json("package.json");
    expect(root.scripts.build).toBe("pnpm build:storefront");
    expect(root.scripts.typecheck).toBe("pnpm typecheck:storefront");
    expect(root.scripts.dev).toBe("pnpm dev:storefront");
    expect(root.scripts.lint).toBe("pnpm lint:storefront && pnpm lint:shared && pnpm lint:management");
    expect(root.scripts["build:management"]).toBe("pnpm --dir apps/management build");
    const management = json("apps/management/package.json");
    for (const pkg of ["@geardrop/runtime-contract", "@geardrop/data-contract"]) {
      expect(root.dependencies[pkg]).toBe("workspace:*");
      expect(management.dependencies[pkg]).toBe("workspace:*");
      for (const scripts of [root.scripts, management.scripts]) {
        for (const key of scripts === root.scripts ? ["build:storefront", "typecheck:storefront"] : ["build", "typecheck"]) {
          expect(scripts[key]).toContain(`--filter ${pkg}`);
          expect(scripts[key]).toMatch(/typecheck && next/);
        }
      }
    }
    for (const pkg of ["next", "react", "react-dom", "@supabase/ssr", "@supabase/supabase-js"]) expect(management.dependencies[pkg]).toBe(root.dependencies[pkg]);
    expect(root.scripts["db:types"]).toContain("--schema public,management_api > packages/data-contract/src/database.types.ts");
  });
  it("rejects a root management deployment before building root routes", async () => {
    const contract = await import("@/lib/app-mode");
    expect(contract).toHaveProperty("assertStorefrontApplicationSurface");
    expect(() => contract.assertStorefrontApplicationSurface({ NEXT_PUBLIC_APP_SURFACE: "management" })).toThrow("GD_ROOT_MANAGEMENT_BUILD_UNSUPPORTED");
  });
});

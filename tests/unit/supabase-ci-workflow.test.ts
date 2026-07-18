import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = join(process.cwd(), ".github", "workflows", "supabase-database-ci.yml");
const adminConfigPath = join(process.cwd(), "playwright.admin.config.ts");
const adminSetupPath = join(process.cwd(), "tests", "e2e", "admin", "global-setup.ts");

describe("Supabase database CI workflow", () => {
  const workflow = () => readFileSync(workflowPath, "utf8");

  it("runs on the approved branch, pull requests to main, and manual dispatch", () => {
    const yaml = workflow();

    expect(yaml).toMatch(/push:\s*\n\s*branches:\s*\[codex\/admin-supabase\]/);
    expect(yaml).toMatch(/pull_request:\s*\n\s*branches:\s*\[main\]/);
    expect(yaml).toContain("workflow_dispatch:");
    expect(yaml).toContain("runs-on: ubuntu-latest");
  });

  it("runs the complete local database and application gate", () => {
    const yaml = workflow();
    const requiredFragments = [
      "actions/checkout@v4",
      "pnpm/action-setup@v4",
      "actions/setup-node@v4",
      "supabase/setup-cli@v1",
      "pnpm install --frozen-lockfile",
      "supabase start",
      "supabase db reset --local",
      'psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
      "supabase test db --local supabase/tests",
      "supabase db lint --local --level error --fail-on error",
      "supabase gen types typescript --local --schema public",
      "diff --unified",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "supabase db reset --local --no-seed",
      "playwright install --with-deps chromium",
      "playwright test --config playwright.admin.config.ts",
      "supabase stop --no-backup",
      "if: always()",
    ];

    for (const fragment of requiredFragments) expect(yaml).toContain(fragment);
  });

  it("contains no remote Supabase credential or linked command", () => {
    const yaml = workflow();

    expect(yaml).not.toMatch(/SUPABASE_ACCESS_TOKEN/i);
    expect(yaml).not.toMatch(/project[_ -]?ref/i);
    expect(yaml).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(yaml).not.toMatch(/IBNApp/i);
    expect(yaml).not.toContain("--linked");
    expect(yaml).not.toMatch(/\bdb\s+push\b/i);
    expect(yaml).not.toMatch(/https:\/\/[^\s]+\.supabase\.co/i);
    expect(yaml).not.toMatch(/migration\s+repair/i);
  });

  it("exports only local CLI values and runs the serial admin browser gate", () => {
    const yaml = workflow();
    expect(yaml).toContain("supabase status -o json");
    expect(yaml).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(yaml).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(yaml).toContain("SUPABASE_SECRET_KEY");
    expect(yaml.indexOf("supabase db reset --local --no-seed")).toBeLessThan(
      yaml.indexOf("playwright test --config playwright.admin.config.ts"),
    );
  });
});

describe("admin browser configuration", () => {
  it("uses only the three exact serial viewport projects", () => {
    const source = readFileSync(adminConfigPath, "utf8");
    expect(source).toContain("fullyParallel: false");
    expect(source).toContain("workers: 1");
    expect(source).toContain('command: "pnpm exec next dev --hostname 127.0.0.1 --port 3100"');
    expect(source).toContain("NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(source).toContain("SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY");
    expect(source).toContain('name: "admin-390"');
    expect(source).toContain('viewport: { width: 390, height: 844 }');
    expect(source).toContain('name: "admin-768"');
    expect(source).toContain('viewport: { width: 768, height: 1024 }');
    expect(source).toContain('name: "admin-1440"');
    expect(source).toContain('viewport: { width: 1440, height: 900 }');
  });

  it("bootstraps identities only against a loopback Supabase URL", () => {
    const source = readFileSync(adminSetupPath, "utf8");
    expect(source).toContain("SUPABASE_SECRET_KEY");
    expect(source).toContain("127\\.0\\.0\\.1|localhost");
    expect(source).toContain("auth.admin.createUser");
    expect(source).toContain('execFileSync("psql"');
    expect(source).toContain("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    expect(source).toContain('stdio: "ignore"');
    expect(source).not.toContain("console.log");
    expect(source).not.toMatch(/\.supabase\.co/i);
  });
});

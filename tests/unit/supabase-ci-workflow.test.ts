import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = join(process.cwd(), ".github", "workflows", "supabase-database-ci.yml");

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
      "supabase stop --no-backup",
      "if: always()",
    ];

    for (const fragment of requiredFragments) expect(yaml).toContain(fragment);
  });

  it("contains no remote Supabase credential or linked command", () => {
    const yaml = workflow();

    expect(yaml).not.toMatch(/SUPABASE_ACCESS_TOKEN/i);
    expect(yaml).not.toMatch(/project[_ -]?ref/i);
    expect(yaml).not.toMatch(/service[_ -]?role/i);
    expect(yaml).not.toMatch(/IBNApp/i);
    expect(yaml).not.toContain("--linked");
    expect(yaml).not.toMatch(/migration\s+repair/i);
  });
});

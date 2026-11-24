import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { briefLines, codeActionTools, codeWorkTool, executeCodeAction, migrationHeader, privateDataIn } = await import("@/lib/ai/code-work");
const { githubConfig } = await import("@/lib/ai/github");
type GitHub = Parameters<typeof codeWorkTool>[0] extends (() => infer G) | undefined ? G : never;
type CopilotAction = Parameters<typeof executeCodeAction>[0];

const REPO = "GengisChad/geardrop";
const SHA = "a".repeat(40);

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };
let calls: Call[];
let routes: Record<string, unknown>;
let files: Record<string, string>;

/** A GitHub stand-in: GETs answer from `routes` by path, every call is recorded. */
function fakeGitHub(): GitHub {
  return {
    repo: REPO,
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      calls.push({ method, path, ...(body === undefined ? {} : { body }) });
      if (method !== "GET") return null as T;
      const key = Object.keys(routes).find((route) => path === route || path.startsWith(`${route}?`));
      if (!key) throw new Error(`GitHub non trova ${path}`);
      return structuredClone(routes[key]) as T;
    },
    async file(path: string) {
      return files[path] ?? "";
    },
  };
}

const writes = () => calls.filter((call) => call.method !== "GET");

function pull(overrides: Record<string, unknown> = {}) {
  return {
    number: 128,
    title: "Foto nuove del BX-11",
    state: "open",
    draft: false,
    merged_at: null,
    html_url: `https://github.com/${REPO}/pull/128`,
    body: "Ho cambiato le foto.\n\n---\n\n**Incarico dal gestionale**",
    mergeable: true,
    additions: 12,
    deletions: 3,
    changed_files: 4,
    updated_at: "2026-11-24T15:00:00Z",
    head: { ref: "assistente/991", sha: SHA, repo: { full_name: REPO } },
    base: { ref: "main" },
    labels: [{ name: "assistente" }],
    ...overrides,
  };
}

function greenChecks(overrides: Record<string, unknown> = {}) {
  routes[`/commits/${SHA}/status`] = { statuses: [{ context: "assistente/verifica", state: "success" }, { context: "Vercel", state: "success" }] };
  routes["/actions/workflows/supabase-database-ci.yml/runs"] = { workflow_runs: [{ id: 5, display_title: "CI", status: "completed", conclusion: "success", html_url: "https://github.com/x/actions/runs/5", created_at: "2026-11-24T15:10:00Z" }] };
  routes["/deployments"] = [{ id: 77, environment: "Preview", production_environment: false }];
  routes["/deployments/77/statuses"] = [{ state: "success", environment_url: "https://geardrop-git-assistente-991-gengischad.vercel.app" }];
  routes["/pulls/128/files"] = [{ filename: "src/data/catalog.ts", status: "modified" }];
  Object.assign(routes, overrides);
}

function prepare(name: string, input: Record<string, unknown>) {
  const cards: CopilotAction[] = [];
  const tool = codeActionTools((card) => cards.push(card), fakeGitHub).find((candidate) => candidate.name === name)!;
  return tool.run(input).then((reply) => ({ reply: String(reply), card: cards[0]! }));
}

beforeEach(() => {
  calls = [];
  files = {};
  routes = { "/pulls/128": pull() };
});

describe("the assistant's work on the code (owner, 2026-11-24)", () => {
  it("is off without a token, and reads only a repository name it can trust", () => {
    expect(githubConfig({})).toBeNull();
    expect(githubConfig({ GITHUB_ASSISTANT_TOKEN: "t" })).toEqual({ token: "t", repo: REPO });
    expect(githubConfig({ GITHUB_ASSISTANT_TOKEN: "t", GITHUB_ASSISTANT_REPO: "../evil" })).toBeNull();
  });

  it("prepares a job as a card that warns the repository is public, and starts nothing until confirmed", async () => {
    const task = "Sulla pagina /prodotto/custom-grip-takara-tomy metti le tre foto ufficiali Takara Tomy del BX-11 nero.";
    const { reply, card } = await prepare("lavoro_codice", { titolo: "Foto nuove del BX-11", incarico: task });
    expect(card).toMatchObject({ kind: "lavoro_codice", status: "pending", title: "Lavoro sul codice: Foto nuove del BX-11", input: { title: "Foto nuove del BX-11", task, pr: null } });
    expect(card.warning).toContain("pubblico");
    expect(reply).toContain("Non è ancora fatta");
    expect(writes()).toEqual([]);

    routes["/actions/workflows/assistant-code.yml/runs"] = { workflow_runs: [] };
    expect(await executeCodeAction(card, fakeGitHub)).toMatchObject({ ok: true });
    expect(writes()).toEqual([
      { method: "POST", path: "/actions/workflows/assistant-code.yml/dispatches", body: { ref: "main", inputs: { title: "Foto nuove del BX-11", task, pr: "" } } },
    ]);

    // Pressed twice: the job just started is found by its run name, and nothing is paid twice.
    calls = [];
    routes["/actions/workflows/assistant-code.yml/runs"] = {
      workflow_runs: [{ id: 993, display_title: "Assistente: Foto nuove del BX-11", status: "queued", conclusion: null, html_url: "https://github.com/r/993", created_at: new Date().toISOString() }],
    };
    expect(await executeCodeAction(card, fakeGitHub)).toMatchObject({ ok: false, message: expect.stringContaining("già partito") });
    expect(writes()).toEqual([]);
  });

  it("shows the whole brief on the card, and keeps emails, order numbers and phones out of the public repository", async () => {
    const long = Array.from({ length: 300 }, (_, index) => `parola${index}`).join(" ");
    const lines = briefLines(long);
    expect(lines.every((line) => line.length <= 500)).toBe(true);
    expect(lines.join(" ")).toBe(long);
    const { card } = await prepare("lavoro_codice", { titolo: "Testo lungo", incarico: long });
    expect(card.details.length).toBeLessThanOrEqual(12);
    expect(card.details.slice(0, -1).join(" ")).toBe(long);

    expect(privateDataIn("Scrivi a mario.rossi@example.com")).toBe("un indirizzo email");
    expect(privateDataIn("come nell'ordine GD-ESZGLRU5")).toBe("un numero d'ordine");
    expect(privateDataIn("chiamare il 333 123 4567")).toBe("un numero di telefono");
    expect(privateDataIn("JAN 4904810910787, Phoenix 9-60GF a 23,99, migrazione 20261124130000")).toBeNull();
    await expect(prepare("lavoro_codice", { titolo: "Email", incarico: "Metti nel footer l'email mario.rossi@example.com del cliente." })).rejects.toThrow("indirizzo email");
  });

  it("refuses a brief too short to work from, and a pull request that is not the assistant's", async () => {
    await expect(prepare("lavoro_codice", { titolo: "Foto", incarico: "cambia foto" })).rejects.toThrow("incarico completo");
    routes["/pulls/128"] = pull({ head: { ref: "assistente/991", sha: SHA, repo: { full_name: "someone/fork" } } });
    await expect(prepare("lavoro_codice", { titolo: "Correggi", incarico: "Sulla PR rendi il titolo della pagina più grande.", pr: 128 })).rejects.toThrow("non è un lavoro dell'assistente");
    routes["/pulls/128"] = pull({ labels: [] });
    await expect(prepare("pubblica_lavoro", { pr: 128 })).rejects.toThrow("non è un lavoro dell'assistente");
  });

  it("publishes only once the full checks are green, with the preview on the card", async () => {
    greenChecks({ "/actions/workflows/supabase-database-ci.yml/runs": { workflow_runs: [{ id: 5, display_title: "CI", status: "in_progress", conclusion: null, html_url: "u", created_at: "2026-11-24T15:10:00Z" }] } });
    await expect(prepare("pubblica_lavoro", { pr: 128 })).rejects.toThrow("ancora in corso");
    routes["/pulls/128"] = pull({ draft: true });
    await expect(prepare("pubblica_lavoro", { pr: 128 })).rejects.toThrow("in bozza");

    routes["/pulls/128"] = pull();
    greenChecks({ "/pulls/128/files": [{ filename: "supabase/migrations/20261125090000_bx11_photos.sql", status: "added" }] });
    const { card } = await prepare("pubblica_lavoro", { pr: 128 });
    expect(card).toMatchObject({ kind: "pubblica_lavoro", input: { pr: 128, headSha: SHA } });
    expect(card.details).toContain("Anteprima: https://geardrop-git-assistente-991-gengischad.vercel.app");
    expect(card.details).toContain("Migrazioni da applicare dopo: 20261125090000_bx11_photos.sql");
    expect(card.warning).toContain("Applica al database");
    expect(writes()).toEqual([]);
  });

  it("never publishes a head other than the one the card showed, nor a pull request that changes old migrations", async () => {
    greenChecks();
    const { card } = await prepare("pubblica_lavoro", { pr: 128 });
    routes["/pulls/128"] = pull({ head: { ref: "assistente/991", sha: "b".repeat(40), repo: { full_name: REPO } } });
    expect(await executeCodeAction(card, fakeGitHub)).toMatchObject({ ok: false, message: expect.stringContaining("è cambiata dopo la scheda") });
    expect(writes()).toEqual([]);

    routes["/pulls/128"] = pull();
    greenChecks({ "/pulls/128/files": [{ filename: "supabase/migrations/20260717185536_products.sql", status: "modified" }] });
    expect(await executeCodeAction(card, fakeGitHub)).toMatchObject({ ok: false, message: expect.stringContaining("migrazioni già esistenti") });
    expect(writes()).toEqual([]);
  });

  it("merges a confirmed card squashed at the shown head, then deletes the branch", async () => {
    greenChecks();
    const { card } = await prepare("pubblica_lavoro", { pr: 128 });
    expect(await executeCodeAction(card, fakeGitHub)).toMatchObject({ ok: true, message: expect.stringContaining("pubblicata") });
    expect(writes()).toEqual([
      { method: "PUT", path: "/pulls/128/merge", body: { merge_method: "squash", sha: SHA, commit_title: "Foto nuove del BX-11 (#128)" } },
      { method: "DELETE", path: "/git/refs/heads/assistente/991" },
    ]);
  });

  it("applies a published pull request's new migrations once, showing what each one says", async () => {
    await expect(prepare("applica_migrazioni", { pr: 128 })).rejects.toThrow("non è ancora pubblicata");

    routes["/pulls/128"] = pull({ state: "closed", merged_at: "2026-11-24T16:00:00Z" });
    routes["/pulls/128/files"] = [{ filename: "supabase/migrations/20261125090000_bx11_photos.sql", status: "added" }];
    routes["/actions/workflows/assistant-migrations.yml/runs"] = { workflow_runs: [] };
    files["supabase/migrations/20261125090000_bx11_photos.sql"] = "-- 2026-11-25: the BX-11 shows its\n-- three official photos.\n\nbegin;\nselect 1;\ncommit;\n";
    const { card } = await prepare("applica_migrazioni", { pr: 128 });
    expect(card).toMatchObject({ kind: "migrazioni_lavoro", input: { pr: 128, files: "supabase/migrations/20261125090000_bx11_photos.sql" } });
    expect(card.details).toEqual(["20261125090000_bx11_photos.sql: 2026-11-25: the BX-11 shows its three official photos."]);
    expect(card.warning).toContain("database di produzione");

    expect(await executeCodeAction(card, fakeGitHub)).toMatchObject({ ok: true });
    expect(writes()).toEqual([
      { method: "POST", path: "/actions/workflows/assistant-migrations.yml/dispatches", body: { ref: "main", inputs: { pr: "128", files: "supabase/migrations/20261125090000_bx11_photos.sql" } } },
    ]);

    routes["/actions/workflows/assistant-migrations.yml/runs"] = { workflow_runs: [{ id: 9, display_title: "Migrazioni PR #128", status: "completed", conclusion: "success", html_url: "u", created_at: "2026-11-24T16:05:00Z" }] };
    await expect(prepare("applica_migrazioni", { pr: 128 })).rejects.toThrow("già applicate");
    calls = [];
    expect(await executeCodeAction(card, fakeGitHub)).toMatchObject({ ok: false });
    expect(writes()).toEqual([]);
  });

  it("tells where each job stands: its pull request, checks, preview and summary", async () => {
    greenChecks();
    routes["/actions/workflows/assistant-code.yml/runs"] = {
      workflow_runs: [
        { id: 992, display_title: "Assistente: Correggi il titolo (PR #128)", status: "in_progress", conclusion: null, html_url: "https://github.com/r/992", created_at: "2026-11-24T15:30:00Z" },
        { id: 991, display_title: "Assistente: Foto nuove del BX-11", status: "completed", conclusion: "success", html_url: "https://github.com/r/991", created_at: "2026-11-24T14:00:00Z" },
      ],
    };
    routes["/pulls"] = [pull(), pull({ number: 7, head: { ref: "feature/x", sha: SHA, repo: { full_name: REPO } }, labels: [] })];
    routes["/actions/workflows/assistant-migrations.yml/runs"] = { workflow_runs: [] };
    const report = (await codeWorkTool(fakeGitHub).run({})) as { lavori: { pr: number | null; stato: string }[]; pr: Record<string, unknown>[] };
    expect(report.lavori.map((job) => [job.pr, job.stato])).toEqual([[128, "in corso"], [128, "finito"]]);
    expect(report.pr).toHaveLength(1);
    expect(report.pr[0]).toMatchObject({ numero: 128, stato: "aperta", verifica: "ok", controlli_completi: "ok", anteprima: "https://geardrop-git-assistente-991-gengischad.vercel.app", si_puo_pubblicare: "sì", riassunto: "Ho cambiato le foto." });
  });

  it("says why a job failed, in Claude Code's own words (24/11: a refused key read as «finito»)", async () => {
    routes["/actions/workflows/assistant-code.yml/runs"] = {
      workflow_runs: [{ id: 994, display_title: "Assistente: Prova lavoro sul codice", status: "completed", conclusion: "failure", html_url: "https://github.com/r/994", created_at: "2026-11-24T21:34:43Z" }],
    };
    routes["/pulls"] = [];
    routes["/actions/workflows/assistant-migrations.yml/runs"] = { workflow_runs: [] };
    routes["/actions/runs/994/jobs"] = { jobs: [{ conclusion: "success", check_run_url: "https://api.github.com/repos/x/check-runs/1" }, { conclusion: "failure", check_run_url: `https://api.github.com/repos/${REPO}/check-runs/55` }] };
    routes["/check-runs/55/annotations"] = [
      { annotation_level: "failure", message: "Process completed with exit code 1." },
      { annotation_level: "failure", message: "API Error: 400 This API key is not scoped to a workspace" },
    ];
    const report = (await codeWorkTool(fakeGitHub).run({})) as { lavori: Record<string, unknown>[] };
    expect(report.lavori[0]).toMatchObject({ stato: "finito con errore (failure)", motivo: "API Error: 400 This API key is not scoped to a workspace" });

    // No readable reason: the answer still comes, without one.
    delete routes["/check-runs/55/annotations"];
    const bare = (await codeWorkTool(fakeGitHub).run({})) as { lavori: Record<string, unknown>[] };
    expect(bare.lavori[0]).not.toHaveProperty("motivo");
  });

  it("reads a migration's opening comment as its description", () => {
    expect(migrationHeader("\n-- One\n--   two\nbegin;")).toBe("One two");
    expect(migrationHeader("alter table x add column y int;")).toBe("alter table x add column y int;");
  });
});

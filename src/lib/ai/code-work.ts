import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ClientTool } from "./agent-loop";
import type { CopilotAction } from "./copilot-actions";
import { createGitHub, githubConfig, type GitHub } from "./github";

/**
 * Work on the site's own code, handed by the assistant to Claude Code (owner, 2026-11-24: "voglio
 * che l'assistente IA dentro al sito sia praticamente come un agente qui, deve poter far tutto e
 * avere accesso al git, repo, ecc, per modificare effettivamente tutto").
 *
 * The assistant runs on Vercel, where there is no checkout and every call has a few minutes, so it
 * does not edit the repository itself: a confirmed "lavoro_codice" card starts the
 * assistant-code.yml workflow, where Claude Code works on an assistente/* branch, lint, typecheck
 * and tests run, and a pull request opens with Vercel's preview of the site. The owner's choices of
 * the same day: nothing reaches main until an owner or admin presses "Pubblica" (pubblica_lavoro),
 * and a pull request's migrations reach the production database only through a separate card
 * (applica_migrazioni) after it is published. Every card runs with the confirming person's
 * session, which must be owner or admin (app/admin/actions/pricing.ts).
 *
 * The repository is public: the brief, the pull request and its description are visible to anyone,
 * which the card says and the assistant's brief repeats.
 */

export const CODE_ACTION_KINDS = ["lavoro_codice", "pubblica_lavoro", "scarta_lavoro", "migrazioni_lavoro"] as const;
type CodeKind = (typeof CODE_ACTION_KINDS)[number];

export const CODE_WORKFLOW = "assistant-code.yml";
export const MIGRATIONS_WORKFLOW = "assistant-migrations.yml";
/** The full gate (database, RLS, browser tests, builds): the code workflow starts it on its branch. */
export const FULL_CI_WORKFLOW = "supabase-database-ci.yml";
export const ASSISTANT_LABEL = "assistente";
export const BRANCH_PREFIX = "assistente/";
export const VERIFY_CONTEXT = "assistente/verifica";
const MIGRATION_FILE = /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/;

type Pull = {
  readonly number: number;
  readonly title: string;
  readonly state: "open" | "closed";
  readonly draft?: boolean;
  readonly merged_at: string | null;
  readonly html_url: string;
  readonly body: string | null;
  readonly mergeable?: boolean | null;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changed_files?: number;
  readonly updated_at: string;
  readonly head: { readonly ref: string; readonly sha: string; readonly repo: { readonly full_name: string } | null };
  readonly base: { readonly ref: string };
  readonly labels: readonly { readonly name: string }[];
};
type PullFile = { readonly filename: string; readonly status: string };
type Run = { readonly id: number; readonly display_title: string; readonly status: string; readonly conclusion: string | null; readonly html_url: string; readonly created_at: string };
type Runs = { readonly workflow_runs: readonly Run[] };
type Job = { readonly conclusion: string | null; readonly check_run_url: string };
type Annotation = { readonly annotation_level: string; readonly message: string };
type CommitStatus = { readonly statuses: readonly { readonly context: string; readonly state: string }[] };
type Deployment = { readonly id: number; readonly environment: string; readonly production_environment?: boolean };
type DeploymentStatus = { readonly state: string; readonly environment_url?: string | null };

type Check = "ok" | "fallita" | "in corso" | "assente";

export type PullReport = {
  /** Lint, typecheck and unit tests, run by the code workflow on the pull request's head. */
  readonly verify: Check;
  /** The full gate on the same head. */
  readonly fullCi: Check;
  readonly fullCiUrl: string | null;
  readonly preview: string | null;
  readonly previewState: Check;
  /** New migration files, which applica_migrazioni may apply once the pull request is published. */
  readonly migrations: readonly string[];
  /** Existing migrations changed, or files there that are not migrations: never published from here. */
  readonly touchedMigrations: readonly string[];
};

const statusCheck = (state: string): Check => (state === "success" ? "ok" : state === "pending" ? "in corso" : "fallita");
const runCheck = (run: Run): Check => (run.status !== "completed" ? "in corso" : run.conclusion === "success" ? "ok" : "fallita");
const deploymentCheck = (state: string): Check =>
  state === "success" || state === "inactive" ? "ok" : state === "failure" || state === "error" ? "fallita" : "in corso";

const clip = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Only pull requests the code workflow opened: from this repository, on an assistente/ branch, with the label. */
export function isAssistantPull(pull: Pull, repo: string): boolean {
  return (
    pull.head.repo?.full_name === repo &&
    pull.head.ref.startsWith(BRANCH_PREFIX) &&
    /^assistente\/[\w-]+$/.test(pull.head.ref) &&
    pull.base.ref === "main" &&
    pull.labels.some((label) => label.name === ASSISTANT_LABEL)
  );
}

function defaultGitHub(): GitHub {
  const config = githubConfig();
  if (!config) throw new Error("I lavori sul codice non sono configurati: manca GITHUB_ASSISTANT_TOKEN sul server (docs/operations/assistant-code-agent.md).");
  return createGitHub(config);
}

function prNumber(value: unknown): number {
  const number = Number(String(value ?? "").replace(/^#/, "").trim());
  if (!Number.isInteger(number) || number <= 0 || number > 999_999) throw new Error("Indica il numero della PR, es. 128.");
  return number;
}

async function assistantPull(gh: GitHub, number: number): Promise<Pull> {
  const pull = await gh.request<Pull>("GET", `/pulls/${number}`);
  if (!isAssistantPull(pull, gh.repo)) throw new Error(`La PR #${number} non è un lavoro dell'assistente: da qui non si tocca.`);
  return pull;
}

async function openAssistantPull(gh: GitHub, number: number): Promise<Pull> {
  const pull = await assistantPull(gh, number);
  if (pull.state !== "open") throw new Error(`La PR #${number} è già ${pull.merged_at ? "pubblicata" : "chiusa"}.`);
  return pull;
}

/** Every file of a pull request: GitHub lists 100 per page and up to 3000 in all. */
async function pullFiles(gh: GitHub, number: number): Promise<readonly PullFile[]> {
  const files: PullFile[] = [];
  for (let page = 1; page <= 30; page += 1) {
    const batch = await gh.request<readonly PullFile[]>("GET", `/pulls/${number}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) return files;
  }
  throw new Error(`La PR #${number} cambia più di 3000 file: da qui non si controlla.`);
}

async function migrationsOf(gh: GitHub, number: number): Promise<{ readonly added: readonly string[]; readonly touched: readonly string[] }> {
  const files = await pullFiles(gh, number);
  const inFolder = files.filter((file) => file.filename.startsWith("supabase/migrations/"));
  return {
    added: inFolder.filter((file) => file.status === "added" && MIGRATION_FILE.test(file.filename)).map((file) => file.filename),
    touched: inFolder.filter((file) => file.status !== "added" || !MIGRATION_FILE.test(file.filename)).map((file) => file.filename),
  };
}

export async function pullReport(gh: GitHub, pull: Pull): Promise<PullReport> {
  const sha = pull.head.sha;
  const [status, runs, deployments, migrations] = await Promise.all([
    gh.request<CommitStatus>("GET", `/commits/${sha}/status`),
    gh.request<Runs>("GET", `/actions/workflows/${FULL_CI_WORKFLOW}/runs?head_sha=${sha}&per_page=5`),
    gh.request<readonly Deployment[]>("GET", `/deployments?sha=${sha}&per_page=10`),
    migrationsOf(gh, pull.number),
  ]);
  const verify = status.statuses.find((entry) => entry.context === VERIFY_CONTEXT);
  const ci = runs.workflow_runs[0];
  const deployment = deployments.find((entry) => !entry.production_environment && !/production/i.test(entry.environment));
  const latest = deployment ? (await gh.request<readonly DeploymentStatus[]>("GET", `/deployments/${deployment.id}/statuses?per_page=1`))[0] : undefined;
  return {
    verify: verify ? statusCheck(verify.state) : "assente",
    fullCi: ci ? runCheck(ci) : "assente",
    fullCiUrl: ci?.html_url ?? null,
    preview: latest?.environment_url || null,
    previewState: latest ? deploymentCheck(latest.state) : "assente",
    migrations: migrations.added,
    touchedMigrations: migrations.touched,
  };
}

/** Why the pull request cannot go to main yet, or null when it can. */
export function publishBlocker(pull: Pull, report: PullReport): string | null {
  const name = `La PR #${pull.number}`;
  if (pull.draft) return `${name} è in bozza: lint, typecheck o test non sono passati. Chiedimi di correggerla.`;
  if (report.verify === "in corso" || report.verify === "assente") return `${name}: Claude Code sta ancora verificando il suo lavoro. Riprova tra qualche minuto.`;
  if (report.verify === "fallita") return `${name}: lint, typecheck o test non sono passati. Chiedimi di correggerla.`;
  if (report.fullCi === "assente") return `${name}: i controlli completi (database, test nel browser, build) non sono partiti. Chiedimi di continuare la PR per farli ripartire.`;
  if (report.fullCi === "in corso") return `${name}: i controlli completi (database, test nel browser, build) sono ancora in corso, durano circa 20 minuti. Riprova dopo.`;
  if (report.fullCi === "fallita") return `${name}: i controlli completi sono falliti (${report.fullCiUrl ?? "vedi la PR"}). Chiedimi di correggerla.`;
  if (report.previewState === "fallita") return `${name}: l'anteprima Vercel non si è costruita. Chiedimi di correggerla.`;
  if (report.touchedMigrations.length) return `${name} cambia migrazioni già esistenti (${report.touchedMigrations.map(basename).join(", ")}): non si pubblica da qui.`;
  if (pull.mergeable === false) return `${name} è in conflitto con main: chiedimi di aggiornarla.`;
  return null;
}

/** The comment lines a migration opens with: what it does, in the author's words. */
export function migrationHeader(sql: string): string {
  const lines: string[] = [];
  for (const raw of sql.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("--")) {
      if (line || lines.length) break;
      continue;
    }
    const text = line.replace(/^--+\s?/, "").trim();
    if (text) lines.push(text);
  }
  return clip(lines.join(" ") || sql.trim().replace(/\s+/g, " "), 360);
}

const migrationTitle = (number: number) => `Migrazioni PR #${number}`;
/** The run name assistant-code.yml gives a job. */
const jobTitle = (title: string, pr: number | null) => `Assistente: ${title}${pr === null ? "" : ` (PR #${pr})`}`;

/**
 * What a public brief must never carry, checked before the card exists: an email address, an order
 * number, a phone number. Costs, margins and suppliers have no shape to check: the assistant's own
 * brief keeps them out, and the card warns.
 */
export function privateDataIn(task: string): string | null {
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(task)) return "un indirizzo email";
  if (/\bGD-[A-Z0-9]{4,16}\b/i.test(task)) return "un numero d'ordine";
  if (/(?:\+39[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/.test(task)) return "un numero di telefono";
  return null;
}

/** A long brief as card lines of 500 characters at most, cut between words. */
export function briefLines(task: string, width = 500): readonly string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of task.replace(/\s+/g, " ").trim().split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > width ? word.slice(0, width) : word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Why a job failed, in its own words: the error annotation the workflow writes when Claude Code
 * stops on an error (24/11: a refused API key read as "finito"), or another step's error. GitHub's
 * generic "Process completed with exit code" line says nothing and is skipped; with no readable
 * reason the answer is null and the job's link stays the way to find out.
 */
export async function failureReason(gh: GitHub, runId: number): Promise<string | null> {
  try {
    const { jobs } = await gh.request<{ readonly jobs: readonly Job[] }>("GET", `/actions/runs/${runId}/jobs`);
    for (const job of jobs.filter((candidate) => candidate.conclusion === "failure")) {
      const checkRun = /\/check-runs\/(\d+)$/.exec(job.check_run_url)?.[1];
      if (!checkRun) continue;
      const notes = await gh.request<readonly Annotation[]>("GET", `/check-runs/${checkRun}/annotations`);
      const note = notes.find((candidate) => candidate.annotation_level === "failure" && !/^Process completed with exit code/.test(candidate.message));
      if (note) return clip(note.message.trim(), 400);
    }
  } catch {
    // A reason is a help, never a reason for the status answer to fail.
  }
  return null;
}

async function migrationRuns(gh: GitHub): Promise<readonly Run[]> {
  // Before the workflow reaches main there is none: no run, not an error.
  return (await gh.request<Runs>("GET", `/actions/workflows/${MIGRATIONS_WORKFLOW}/runs?per_page=30`).catch(() => ({ workflow_runs: [] }))).workflow_runs;
}

export const CODE_INPUT_SCHEMAS = {
  lavoro_codice: z.object({ title: z.string().min(4).max(80), task: z.string().min(20).max(4000), pr: z.number().int().positive().nullable() }),
  pubblica_lavoro: z.object({ pr: z.number().int().positive(), headSha: z.string().regex(/^[0-9a-f]{40}$/), title: z.string().max(300) }),
  scarta_lavoro: z.object({ pr: z.number().int().positive(), title: z.string().max(300) }),
  migrazioni_lavoro: z.object({
    pr: z.number().int().positive(),
    files: z.string().max(4000).refine((value) => value.split(" ").every((file) => MIGRATION_FILE.test(file))),
  }),
} satisfies Record<CodeKind, z.ZodTypeAny>;

function card(kind: CodeKind, input: CopilotAction["input"], title: string, details: readonly string[], warning: string | null): CopilotAction {
  return { id: randomUUID(), kind, input, title, details: details.map((line) => clip(line, 500)), warning, status: "pending", result: null };
}

function cardTool(name: string, description: string, properties: Record<string, unknown>, required: readonly string[], run: (input: Record<string, unknown>) => Promise<CopilotAction>, collect: (action: CopilotAction) => void): ClientTool {
  return {
    name,
    description: `${description} Non esegue: prepara una scheda che l'utente conferma con un tasto.`,
    input_schema: { type: "object", properties, required },
    run: async (raw) => {
      const action = await run(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
      collect(action);
      return `Pronta per la conferma: ${action.title}. Non è ancora fatta: l'utente deve premere «Conferma» sotto la risposta.`;
    },
  };
}

/** The four code cards: start or continue a job, publish it, throw it away, apply its migrations. */
export function codeActionTools(collect: (action: CopilotAction) => void, github: () => GitHub = defaultGitHub): readonly ClientTool[] {
  return [
    cardTool(
      "lavoro_codice",
      "Affida un lavoro sul codice del sito a Claude Code, l'agente di sviluppo che lavora sul repository: tutto ciò che gli altri strumenti non fanno (un prodotto nuovo sul sito, foto nuove, testi e pagine fuori dalla scheda prodotto, grafica, un errore da correggere, una funzione nuova del sito o del gestionale). Lavora 5-20 minuti su un branch suo, verifica lint, typecheck e test e apre una PR con l'anteprima del sito: niente va online finché un socio non conferma pubblica_lavoro. L'incarico deve bastare da solo, perché Claude Code non vede questa conversazione. Per correggere o continuare una PR aperta dell'assistente passa il suo numero.",
      {
        titolo: { type: "string", description: "Titolo breve, max 80 caratteri, es. «Foto nuove del BX-11»" },
        incarico: { type: "string", description: "L'incarico completo: cosa cambiare, dove si vede, i dati esatti, cosa non toccare. Max 4000 caratteri. Pubblico: niente costi, margini, fornitori, clienti o ordini." },
        pr: { type: "integer", description: "Solo per continuare una PR aperta dell'assistente" },
      },
      ["titolo", "incarico"],
      async (input) => {
        const gh = github();
        const title = String(input.titolo ?? "").replace(/\s+/g, " ").trim();
        if (title.length < 4 || title.length > 80) throw new Error("Titolo: da 4 a 80 caratteri.");
        const task = String(input.incarico ?? "").trim();
        if (task.length < 20) throw new Error("Scrivi l'incarico completo: cosa cambiare, dove si vede, con quali dati.");
        if (task.length > 4000) throw new Error("Incarico troppo lungo: massimo 4000 caratteri.");
        const secret = privateDataIn(`${title} ${task}`);
        if (secret) throw new Error(`L'incarico contiene ${secret}: il repository è pubblico, riscrivilo senza.`);
        const pr = input.pr === undefined || input.pr === null || String(input.pr).trim() === "" ? null : prNumber(input.pr);
        if (pr !== null) await openAssistantPull(gh, pr);
        const lines = briefLines(task);
        return card(
          "lavoro_codice",
          { title, task, pr },
          pr === null ? `Lavoro sul codice: ${title}` : `Continua la PR #${pr}: ${title}`,
          // The whole brief, as it will run: a card holds twelve lines, a 4000-character brief ten at most.
          [...lines.slice(0, 11), "Claude Code ci lavora 5-20 minuti su un branch suo, poi trovi la PR con l'anteprima del sito. Niente va online senza «Pubblica»."],
          "Il repository è pubblico: il testo dell'incarico sarà visibile su GitHub.",
        );
      },
      collect,
    ),
    cardTool(
      "pubblica_lavoro",
      "Pubblica sul sito una PR dell'assistente: la unisce a main e Vercel la mette online in circa 3 minuti. Solo quando il socio chiede di pubblicare e la verifica, i controlli completi e l'anteprima sono a posto (leggili con lavori_codice).",
      { pr: { type: "integer", description: "Numero della PR" } },
      ["pr"],
      async (input) => {
        const gh = github();
        const pull = await openAssistantPull(gh, prNumber(input.pr));
        const report = await pullReport(gh, pull);
        const blocker = publishBlocker(pull, report);
        if (blocker) throw new Error(blocker);
        const migrations = report.migrations.map(basename);
        return card(
          "pubblica_lavoro",
          { pr: pull.number, headSha: pull.head.sha, title: pull.title },
          `Pubblica sul sito la PR #${pull.number}: ${pull.title}`,
          [
            `${pull.changed_files ?? "?"} file cambiati, +${pull.additions ?? 0} −${pull.deletions ?? 0}`,
            report.preview ? `Anteprima: ${report.preview}` : `Anteprima: ${report.previewState === "in corso" ? "ancora in costruzione" : "non trovata"}`,
            `PR: ${pull.html_url}`,
            ...(migrations.length ? [`Migrazioni da applicare dopo: ${migrations.join(", ")}`] : []),
          ],
          migrations.length
            ? "Va online sul sito appena confermi. Poi servono le migrazioni sul database: te le preparo con «Applica al database»."
            : "Va online sul sito appena confermi.",
        );
      },
      collect,
    ),
    cardTool(
      "scarta_lavoro",
      "Butta via una PR aperta dell'assistente: la chiude e cancella il suo branch. Quando il socio dice che il lavoro non va e non vuole correggerlo.",
      { pr: { type: "integer", description: "Numero della PR" } },
      ["pr"],
      async (input) => {
        const pull = await openAssistantPull(github(), prNumber(input.pr));
        return card("scarta_lavoro", { pr: pull.number, title: pull.title }, `Scarta la PR #${pull.number}: ${pull.title}`, [`PR: ${pull.html_url}`], "Chiude la PR e cancella il branch: il lavoro si perde.");
      },
      collect,
    ),
    cardTool(
      "applica_migrazioni",
      "Applica al database di produzione le migrazioni nuove di una PR dell'assistente già pubblicata. Preparala subito dopo la pubblicazione di una PR che ne ha.",
      { pr: { type: "integer", description: "Numero della PR pubblicata" } },
      ["pr"],
      async (input) => {
        const gh = github();
        const number = prNumber(input.pr);
        const pull = await assistantPull(gh, number);
        if (!pull.merged_at) throw new Error(`La PR #${number} non è ancora pubblicata: prima pubblica_lavoro.`);
        const [migrations, runs] = await Promise.all([migrationsOf(gh, number), migrationRuns(gh)]);
        if (migrations.touched.length) throw new Error(`La PR #${number} cambia migrazioni già esistenti (${migrations.touched.map(basename).join(", ")}): non si applicano da qui.`);
        if (migrations.added.length === 0) throw new Error(`La PR #${number} non ha migrazioni.`);
        const previous = runs.filter((run) => run.display_title === migrationTitle(number));
        if (previous.some((run) => run.status !== "completed")) throw new Error(`Le migrazioni della PR #${number} si stanno già applicando.`);
        const done = previous.find((run) => run.conclusion === "success");
        if (done) throw new Error(`Le migrazioni della PR #${number} sono già applicate (${when(done.created_at)}).`);
        const headers = await Promise.all(migrations.added.map(async (path) => migrationHeader(await gh.file(path, "main"))));
        return card(
          "migrazioni_lavoro",
          { pr: number, files: migrations.added.join(" ") },
          `Applica al database le migrazioni della PR #${number}`,
          // A card holds twelve lines at most (copilotActionSchema).
          migrations.added.length > 12
            ? [...migrations.added.slice(0, 11).map((path, index) => `${basename(path)}: ${headers[index]}`), `…e altre ${migrations.added.length - 11} migrazioni`]
            : migrations.added.map((path, index) => `${basename(path)}: ${headers[index]}`),
          "Cambia il database di produzione: non si annulla con un tasto.",
        );
      },
      collect,
    ),
  ];
}

/** What the code work is doing: recent jobs, the assistant's pull requests, their checks and preview. */
export function codeWorkTool(github: () => GitHub = defaultGitHub): ClientTool {
  return {
    name: "lavori_codice",
    description: "A che punto sono i lavori sul codice affidati a Claude Code: lavori in corso e finiti, le PR dell'assistente con verifica, controlli completi, link dell'anteprima, migrazioni e se sono applicate, e il riassunto di Claude Code. Leggilo prima di pubblica_lavoro o applica_migrazioni e quando il socio chiede a che punto è.",
    input_schema: { type: "object", properties: {}, required: [] },
    run: async () => {
      const gh = github();
      const [runs, pulls, migrationsRuns] = await Promise.all([
        gh.request<Runs>("GET", `/actions/workflows/${CODE_WORKFLOW}/runs?per_page=8`),
        gh.request<readonly Pull[]>("GET", "/pulls?state=all&sort=updated&direction=desc&per_page=30"),
        migrationRuns(gh),
      ]);
      const mine = pulls.filter((pull) => isAssistantPull(pull, gh.repo)).slice(0, 6);
      const pullOfRun = (run: Run) =>
        mine.find((pull) => pull.head.ref === `${BRANCH_PREFIX}${run.id}`)?.number ?? (Number(/\(PR #(\d+)\)$/.exec(run.display_title)?.[1]) || null);
      const failed = (run: Run) => run.status === "completed" && run.conclusion === "failure";
      // The reasons of the three latest failed jobs: enough to answer, without a call per old job.
      const explained = new Set(runs.workflow_runs.filter(failed).slice(0, 3).map((run) => run.id));
      const [reports, reasons] = await Promise.all([
        Promise.all(
          mine.map(async (pull) => {
            if (pull.state === "open") return pullReport(gh, pull);
            if (pull.merged_at) return { migrations: (await migrationsOf(gh, pull.number)).added };
            return null;
          }),
        ),
        Promise.all(runs.workflow_runs.map((run) => (explained.has(run.id) ? failureReason(gh, run.id) : Promise.resolve(null)))),
      ]);
      return {
        lavori: runs.workflow_runs.map((run, index) => ({
          titolo: run.display_title.replace(/^Assistente: /, ""),
          stato: run.status !== "completed" ? "in corso" : run.conclusion === "success" ? "finito" : `finito con errore (${run.conclusion ?? "sconosciuto"})`,
          avviato: when(run.created_at),
          pr: pullOfRun(run),
          ...(reasons[index] ? { motivo: reasons[index] } : {}),
          dettagli: run.html_url,
        })),
        pr: mine.map((pull, index) => {
          const report = reports[index];
          const applied = migrationsRuns.filter((run) => run.display_title === migrationTitle(pull.number));
          const full = report && "verify" in report ? report : null;
          return {
            numero: pull.number,
            titolo: pull.title,
            stato: pull.merged_at ? "pubblicata" : pull.state === "closed" ? "chiusa" : pull.draft ? "bozza (verifica non passata)" : "aperta",
            link: pull.html_url,
            aggiornata: when(pull.updated_at),
            ...(full
              ? {
                  verifica: full.verify,
                  controlli_completi: full.fullCi,
                  anteprima: full.preview ?? `assente (${full.previewState})`,
                  si_puo_pubblicare: publishBlocker(pull, full) ?? "sì",
                }
              : {}),
            migrazioni: report?.migrations.map(basename) ?? [],
            ...(pull.merged_at && report?.migrations.length
              ? { migrazioni_applicate: applied.some((run) => run.conclusion === "success") ? "sì" : applied.some((run) => run.status !== "completed") ? "in corso" : "no" }
              : {}),
            riassunto: clip((pull.body ?? "").split(/\n---\n/)[0]!.trim(), 1500),
          };
        }),
        nota: "Un lavoro finito con errore dice il perché in «motivo»: riportalo al socio con parole sue (es. chiave API non valida, test non passati). Un lavoro finito senza PR e senza errore non ha cambiato file: il motivo è nei dettagli del lavoro su GitHub.",
      };
    },
  };
}

/** Runs a confirmed code card. The card comes back from the browser, so everything is checked again. */
export async function executeCodeAction(action: CopilotAction, github: () => GitHub = defaultGitHub): Promise<{ readonly ok: boolean; readonly message: string }> {
  const gh = github();
  switch (action.kind) {
    case "lavoro_codice": {
      const input = CODE_INPUT_SCHEMAS.lavoro_codice.parse(action.input);
      const secret = privateDataIn(`${input.title} ${input.task}`);
      if (secret) return { ok: false, message: `L'incarico contiene ${secret}: il repository è pubblico.` };
      if (input.pr !== null) await openAssistantPull(gh, input.pr);
      // A second press of the same card (or a replayed one) must not pay for a second job.
      const recent = await gh.request<Runs>("GET", `/actions/workflows/${CODE_WORKFLOW}/runs?per_page=10`);
      const same = recent.workflow_runs.find((run) => run.display_title === jobTitle(input.title, input.pr) && Date.now() - Date.parse(run.created_at) < 15 * 60_000);
      if (same) return { ok: false, message: `Questo lavoro è già partito alle ${when(same.created_at)}: ${same.html_url}` };
      await gh.request("POST", `/actions/workflows/${CODE_WORKFLOW}/dispatches`, {
        ref: "main",
        inputs: { title: input.title, task: input.task, pr: input.pr === null ? "" : String(input.pr) },
      });
      return { ok: true, message: "Avviato: Claude Code ci lavora per 5-20 minuti. Chiedimi «a che punto è il lavoro sul codice?» per la PR e l'anteprima." };
    }
    case "pubblica_lavoro": {
      const input = CODE_INPUT_SCHEMAS.pubblica_lavoro.parse(action.input);
      const pull = await openAssistantPull(gh, input.pr);
      if (pull.head.sha !== input.headSha) return { ok: false, message: `La PR #${input.pr} è cambiata dopo la scheda: chiedimi di nuovo di pubblicarla.` };
      const report = await pullReport(gh, pull);
      const blocker = publishBlocker(pull, report);
      if (blocker) return { ok: false, message: blocker };
      // The sha pins the merge to the head the card showed: a push after it makes GitHub refuse.
      await gh.request("PUT", `/pulls/${input.pr}/merge`, { merge_method: "squash", sha: input.headSha, commit_title: `${pull.title} (#${input.pr})` });
      await gh.request("DELETE", `/git/refs/heads/${pull.head.ref}`).catch(() => null);
      return {
        ok: true,
        message: `PR #${input.pr} pubblicata: Vercel la mette online in circa 3 minuti.${report.migrations.length ? ` Ora servono le migrazioni: chiedimi «applica le migrazioni della PR #${input.pr}».` : ""}`,
      };
    }
    case "scarta_lavoro": {
      const input = CODE_INPUT_SCHEMAS.scarta_lavoro.parse(action.input);
      const pull = await openAssistantPull(gh, input.pr);
      await gh.request("PATCH", `/pulls/${input.pr}`, { state: "closed" });
      await gh.request("DELETE", `/git/refs/heads/${pull.head.ref}`).catch(() => null);
      return { ok: true, message: `PR #${input.pr} chiusa e branch cancellato.` };
    }
    case "migrazioni_lavoro": {
      const input = CODE_INPUT_SCHEMAS.migrazioni_lavoro.parse(action.input);
      const pull = await assistantPull(gh, input.pr);
      if (!pull.merged_at) return { ok: false, message: `La PR #${input.pr} non è pubblicata.` };
      const [migrations, runs] = await Promise.all([migrationsOf(gh, input.pr), migrationRuns(gh)]);
      const files = input.files.split(" ");
      if (migrations.touched.length || files.some((file) => !migrations.added.includes(file))) {
        return { ok: false, message: `Le migrazioni della scheda non sono quelle della PR #${input.pr}: chiedimi di nuovo.` };
      }
      const previous = runs.filter((run) => run.display_title === migrationTitle(input.pr));
      if (previous.some((run) => run.status !== "completed" || run.conclusion === "success")) {
        return { ok: false, message: `Le migrazioni della PR #${input.pr} sono già applicate o in corso.` };
      }
      await gh.request("POST", `/actions/workflows/${MIGRATIONS_WORKFLOW}/dispatches`, { ref: "main", inputs: { pr: String(input.pr), files: input.files } });
      return { ok: true, message: `Avviate: in 1-2 minuti le migrazioni della PR #${input.pr} sono sul database. Chiedimi lo stato dei lavori per la conferma.` };
    }
    default:
      return { ok: false, message: "Azione sul codice sconosciuta." };
  }
}

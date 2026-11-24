import "server-only";

/**
 * The few GitHub REST calls the assistant needs to hand work on the site's code to Claude Code in
 * GitHub Actions and to publish what it made (owner, 2026-11-24: "voglio che l'assistente IA
 * dentro al sito sia praticamente come un agente qui ... accesso al git, repo"). Dependency-free
 * like the Claude and Stripe clients. The token is a fine-grained one limited to this repository
 * (docs/operations/assistant-code-agent.md), so it only ever runs on the server.
 */

const API = "https://api.github.com";
const DEFAULT_REPO = "GengisChad/geardrop";

export type GitHubConfig = { readonly token: string; readonly repo: string };

/** The token and repository, or null when code work is not configured on this deployment. */
export function githubConfig(env: Readonly<Record<string, string | undefined>> = process.env): GitHubConfig | null {
  const token = env["GITHUB_ASSISTANT_TOKEN"]?.trim();
  const repo = env["GITHUB_ASSISTANT_REPO"]?.trim() || DEFAULT_REPO;
  // An owner has no dots; a repository name may, but is never "." or "..", which would climb the API path.
  if (!token || !/^[A-Za-z0-9-]+\/(?!\.\.?$)[A-Za-z0-9._-]+$/.test(repo)) return null;
  return { token, repo };
}

export class GitHubError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export type GitHubMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type GitHub = {
  readonly repo: string;
  /** A call under /repos/<repo>; `path` starts with "/". An empty answer (204) comes back as null. */
  request<T>(method: GitHubMethod, path: string, body?: unknown): Promise<T>;
  /** A file of the repository as text, at `ref`. */
  file(path: string, ref: string): Promise<string>;
};

const MESSAGE: Readonly<Record<number, string>> = {
  401: "Il token GitHub dell'assistente non è valido o è scaduto.",
  403: "Il token GitHub dell'assistente non ha il permesso per questa operazione.",
  404: "GitHub non trova quello che ho cercato (o il token non lo vede).",
};

export function createGitHub(config: GitHubConfig, fetchImpl: typeof fetch = fetch): GitHub {
  async function call(method: GitHubMethod, path: string, body: unknown, accept = "application/vnd.github+json"): Promise<Response> {
    const response = await fetchImpl(`${API}/repos/${config.repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        accept,
        "x-github-api-version": "2022-11-28",
        "user-agent": "geardrop-assistant",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { readonly message?: string } | null;
      // GitHub never echoes the token, so its message is safe to show.
      throw new GitHubError(response.status, MESSAGE[response.status] ?? `GitHub ${response.status}: ${payload?.message ?? "risposta non leggibile"}`);
    }
    return response;
  }

  return {
    repo: config.repo,
    async request<T>(method: GitHubMethod, path: string, body?: unknown): Promise<T> {
      const text = await (await call(method, path, body)).text();
      return (text ? JSON.parse(text) : null) as T;
    },
    async file(path: string, ref: string): Promise<string> {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      return (await call("GET", `/contents/${encoded}?ref=${encodeURIComponent(ref)}`, undefined, "application/vnd.github.raw+json")).text();
    },
  };
}

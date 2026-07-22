import { pathToFileURL } from "node:url";

/**
 * Preflight identity guard for GearDrop remote Supabase operations.
 *
 * This is the FIRST check before `supabase link`, `supabase db push`, or any other command that
 * targets a real remote project. It is deliberately offline-capable and allowlist-only: the
 * *declared* project ref (what the operator is about to type into the CLI) must equal the
 * *expected* ref exactly, or the operation refuses. There is no denylist of known-bad refs to
 * maintain and no project name comparison — the ref is the only authoritative Supabase project
 * identifier (globally unique, never renamed); a dashboard display name is a cosmetic label an
 * account owner may or may not have set, and was previously found to actively mislead this check
 * (a freshly created project reads "GengisChad's Project" — Supabase's own unrenamed default —
 * until someone changes it), so it plays no role in the security decision.
 *
 * This does NOT replace the database-level guard in
 * `supabase/migrations/20260717185534_assert_dedicated_project.sql`, which aborts with
 * `GD_DEDICATED_PROJECT_REQUIRED` if the target database already contains non-extension
 * application tables. That check needs a real connection and runs at `db push` time; this script
 * runs earlier, before any connection is attempted, to catch a wrong ref from a typo or a
 * copy-paste mistake before it ever reaches the network.
 *
 * See docs/operations/geardrop-staging-rollout.md §1 for how this fits into the rollout sequence.
 */

export type VerifyInput = {
  /** The project ref the operator is about to target — what they typed or configured. */
  readonly declaredRef: string;
  /** The one ref GearDrop's dedicated project is allowed to be — read from EXPECTED_SUPABASE_PROJECT_REF. */
  readonly expectedRef: string;
};

export type VerifyFailureCode = "GD_MISSING_DECLARED_REF" | "GD_MISSING_EXPECTED_REF" | "GD_PROJECT_REF_MISMATCH";

export class ProjectVerificationError extends Error {
  readonly code: VerifyFailureCode;

  constructor(code: VerifyFailureCode, message: string) {
    super(message);
    this.name = "ProjectVerificationError";
    this.code = code;
  }
}

function trimmed(value: string | undefined | null): string {
  return (value ?? "").trim();
}

/** Keeps the ref recognisable in logs without printing it whole. Refs are not secrets, but the
 *  brief requires masking anything printed for a remote target — this stays consistent with that. */
export function maskRef(ref: string): string {
  const value = trimmed(ref);
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.max(0, value.length - 6))}${value.slice(-2)}`;
}

/**
 * Throws unless the declared ref is exactly the expected ref. Allowlist-only: anything that is
 * not a byte-for-byte match is refused, with no separate denylist to keep in sync.
 */
export function verifyGeardropProject(input: VerifyInput): void {
  const declaredRef = trimmed(input.declaredRef);
  const expectedRef = trimmed(input.expectedRef);

  if (!declaredRef) {
    throw new ProjectVerificationError(
      "GD_MISSING_DECLARED_REF",
      "No project ref was declared for this operation. Pass --project-ref or set SUPABASE_PROJECT_REF.",
    );
  }
  if (!expectedRef) {
    throw new ProjectVerificationError(
      "GD_MISSING_EXPECTED_REF",
      "EXPECTED_SUPABASE_PROJECT_REF is not set. Refusing to verify against an undefined target.",
    );
  }
  if (declaredRef !== expectedRef) {
    throw new ProjectVerificationError(
      "GD_PROJECT_REF_MISMATCH",
      `Declared project ref ${maskRef(declaredRef)} does not match the expected ${maskRef(expectedRef)}. Refusing.`,
    );
  }
}

export type RemoteConfirmation = "confirmed" | "skipped";

/**
 * Confirms via the Supabase Management API that the ref exists, the token can access it, and the
 * API's own `id`/`ref` for the project matches what was declared. Unlike the previous revision,
 * this now genuinely fails when a token is present and the API says the project is not
 * found/accessible — that IS the thing being checked, not an ambient nice-to-have.
 *
 * Still skips (never fails) when there is no token at all, or when the check could not run for a
 * reason unrelated to project identity (DNS/offline/timeout, malformed response body) — a failed
 * *lookup* is not the same as a confirmed *wrong project*.
 */
export async function confirmProjectRemotely(
  ref: string,
  accessToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteConfirmation> {
  const token = trimmed(accessToken);
  if (!token) return "skipped";

  const declaredRef = trimmed(ref);
  let response: Response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${encodeURIComponent(declaredRef)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // DNS failure, offline, timeout — an unreachable API is not proof of anything either way.
    return "skipped";
  }

  if (response.status === 404) {
    throw new ProjectVerificationError(
      "GD_PROJECT_REF_MISMATCH",
      `Project ref ${maskRef(declaredRef)} was not found via the Supabase Management API for this token.`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProjectVerificationError(
      "GD_PROJECT_REF_MISMATCH",
      `The provided token does not have access to project ref ${maskRef(declaredRef)} (HTTP ${response.status}).`,
    );
  }
  if (!response.ok) {
    // Some other API-side failure (5xx, rate limit, etc.) — not proof of a wrong project.
    return "skipped";
  }

  let body: { id?: string; ref?: string };
  try {
    body = (await response.json()) as { id?: string; ref?: string };
  } catch {
    return "skipped";
  }

  const remoteRef = trimmed(body.ref || body.id);
  if (remoteRef && remoteRef !== declaredRef) {
    throw new ProjectVerificationError(
      "GD_PROJECT_REF_MISMATCH",
      `Management API returned ref ${maskRef(remoteRef)} for the request against ${maskRef(declaredRef)}. Refusing.`,
    );
  }

  return "confirmed";
}

function readArg(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function runCli(): Promise<void> {
  const argv = process.argv.slice(2);
  const declaredRef = readArg(argv, "--project-ref") ?? process.env["SUPABASE_PROJECT_REF"] ?? "";
  const expectedRef = process.env["EXPECTED_SUPABASE_PROJECT_REF"] ?? "";

  try {
    verifyGeardropProject({ declaredRef, expectedRef });

    const remoteCheck = await confirmProjectRemotely(declaredRef, process.env["SUPABASE_ACCESS_TOKEN"]);

    console.log(`GearDrop project ref verified: ${maskRef(declaredRef)}`);
    console.log(
      remoteCheck === "confirmed"
        ? "Remote Management API confirmed the project exists and the token can access it."
        : "Remote confirmation skipped (no SUPABASE_ACCESS_TOKEN or lookup unavailable) — offline ref check passed.",
    );
  } catch (error) {
    if (error instanceof ProjectVerificationError) {
      console.error(`[${error.code}] ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void runCli();
}

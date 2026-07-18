import { pathToFileURL } from "node:url";

/**
 * Preflight identity guard for GearDrop remote Supabase operations.
 *
 * This is the FIRST check before `supabase link`, `supabase db push`, or any other command that
 * targets a real remote project. It is deliberately offline-capable: it compares a *declared*
 * project ref/name (what the operator is about to type into the CLI) against an *expected*
 * ref/name (what GearDrop Development actually is), and refuses on any mismatch, missing value,
 * or explicitly forbidden ref.
 *
 * This does NOT replace the database-level guard in
 * `supabase/migrations/20260717185534_assert_dedicated_project.sql`, which aborts with
 * `GD_DEDICATED_PROJECT_REQUIRED` if the target database already contains non-extension
 * application tables. That check needs a real connection and runs at `db push` time; this script
 * runs earlier, before any connection is attempted, to catch a wrong ref/name from a typo or a
 * copy-paste mistake before it ever reaches the network.
 *
 * See docs/operations/geardrop-staging-rollout.md §1 for how this fits into the rollout sequence.
 */

export type ProjectIdentity = {
  readonly ref: string;
  readonly name: string;
};

export type VerifyInput = {
  /** The project the operator is about to target — what they typed or configured. */
  readonly declared: ProjectIdentity;
  /** What GearDrop Development actually is — read from EXPECTED_SUPABASE_PROJECT_REF/_NAME. */
  readonly expected: ProjectIdentity;
  /**
   * Refs that must never be targeted even if they happened to match `expected` by mistake (for
   * example, if IBNApp's ref were ever pasted into EXPECTED_SUPABASE_PROJECT_REF by accident).
   * Populate via FORBIDDEN_SUPABASE_PROJECT_REFS once the operator knows IBNApp's ref; this script
   * does not hardcode it and was never told it.
   */
  readonly forbiddenRefs?: readonly string[];
};

export type VerifyFailureCode =
  | "GD_MISSING_DECLARED_REF"
  | "GD_MISSING_DECLARED_NAME"
  | "GD_MISSING_EXPECTED_REF"
  | "GD_MISSING_EXPECTED_NAME"
  | "GD_FORBIDDEN_PROJECT_REF"
  | "GD_PROJECT_NAME_MISMATCH"
  | "GD_PROJECT_REF_MISMATCH";

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
 * Throws on any identity mismatch. Never returns a partial or "probably fine" result — a
 * verification step that can silently pass on bad input is not a guard.
 */
export function verifyGeardropProject(input: VerifyInput): void {
  const declaredRef = trimmed(input.declared.ref);
  const declaredName = trimmed(input.declared.name);
  const expectedRef = trimmed(input.expected.ref);
  const expectedName = trimmed(input.expected.name);
  const forbidden = (input.forbiddenRefs ?? []).map(trimmed).filter(Boolean);

  if (!declaredRef) {
    throw new ProjectVerificationError(
      "GD_MISSING_DECLARED_REF",
      "No project ref was declared for this operation. Pass --project-ref or set SUPABASE_PROJECT_REF.",
    );
  }
  if (!declaredName) {
    throw new ProjectVerificationError(
      "GD_MISSING_DECLARED_NAME",
      "No project name was declared for this operation. Pass --project-name or set SUPABASE_PROJECT_NAME.",
    );
  }
  if (!expectedRef) {
    throw new ProjectVerificationError(
      "GD_MISSING_EXPECTED_REF",
      "EXPECTED_SUPABASE_PROJECT_REF is not set. Refusing to verify against an undefined target.",
    );
  }
  if (!expectedName) {
    throw new ProjectVerificationError(
      "GD_MISSING_EXPECTED_NAME",
      'EXPECTED_SUPABASE_PROJECT_NAME is not set. It must equal "GearDrop Development".',
    );
  }

  if (forbidden.includes(declaredRef)) {
    throw new ProjectVerificationError(
      "GD_FORBIDDEN_PROJECT_REF",
      `Project ref ${maskRef(declaredRef)} is on the forbidden list (e.g. IBNApp) and must never be targeted by GearDrop tooling.`,
    );
  }

  if (declaredName !== expectedName) {
    throw new ProjectVerificationError(
      "GD_PROJECT_NAME_MISMATCH",
      `Declared project name "${declaredName}" does not match the expected "${expectedName}". Refusing.`,
    );
  }

  if (declaredRef !== expectedRef) {
    throw new ProjectVerificationError(
      "GD_PROJECT_REF_MISMATCH",
      `Declared project ref ${maskRef(declaredRef)} does not match the expected ${maskRef(expectedRef)}. Refusing.`,
    );
  }
}

/**
 * Optional defense-in-depth: if a Supabase access token is available, confirm via the Management
 * API that the ref really does resolve to the expected name remotely, catching the case where an
 * operator's local EXPECTED_* values are themselves stale or wrong. This is opt-in — a preflight
 * that hard-requires a fresh credential just to run would get bypassed under time pressure, and
 * the offline identity check above is already sufficient to catch typos/copy-paste mistakes.
 * Never throws on network failure; only throws on a confirmed identity mismatch.
 */
export async function confirmProjectRemotely(
  input: { readonly ref: string; readonly expectedName: string },
  accessToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<"confirmed" | "skipped"> {
  const token = trimmed(accessToken);
  if (!token) return "skipped";

  const ref = trimmed(input.ref);
  let response: Response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // DNS failure, offline, timeout — an unreachable API is not proof of a wrong project.
    return "skipped";
  }

  if (!response.ok) {
    // A failed lookup (network blip, expired token, wrong scope) is not proof of a wrong
    // project — it is proof the API call failed. Do not turn that into a hard block.
    return "skipped";
  }

  let body: { name?: string };
  try {
    body = (await response.json()) as { name?: string };
  } catch {
    // Malformed/empty response body: same reasoning as an unreachable API.
    return "skipped";
  }

  const remoteName = trimmed(body.name);
  const expectedName = trimmed(input.expectedName);

  if (remoteName && remoteName !== expectedName) {
    throw new ProjectVerificationError(
      "GD_PROJECT_NAME_MISMATCH",
      `Remote project ${maskRef(ref)} is named "${remoteName}" on Supabase, not "${expectedName}". Refusing.`,
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
  const declared: ProjectIdentity = {
    ref: readArg(argv, "--project-ref") ?? process.env["SUPABASE_PROJECT_REF"] ?? "",
    name: readArg(argv, "--project-name") ?? process.env["SUPABASE_PROJECT_NAME"] ?? "",
  };
  const expected: ProjectIdentity = {
    ref: process.env["EXPECTED_SUPABASE_PROJECT_REF"] ?? "",
    name: process.env["EXPECTED_SUPABASE_PROJECT_NAME"] ?? "",
  };
  const forbiddenRefs = (process.env["FORBIDDEN_SUPABASE_PROJECT_REFS"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    verifyGeardropProject({ declared, expected, forbiddenRefs });

    const remoteCheck = await confirmProjectRemotely(
      { ref: declared.ref, expectedName: expected.name },
      process.env["SUPABASE_ACCESS_TOKEN"],
    );

    console.log(`GearDrop project verified: ${maskRef(declared.ref)} — "${declared.name}"`);
    console.log(
      remoteCheck === "confirmed"
        ? "Remote Management API confirmed the project name matches."
        : "Remote confirmation skipped (no SUPABASE_ACCESS_TOKEN or lookup unavailable) — offline identity check passed.",
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

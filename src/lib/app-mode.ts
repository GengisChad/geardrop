// No imports: next.config.ts loads this file before the path aliases exist.

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The management app deployed on its own: GESTIONALE_ONLY=true serves /admin and nothing of
 * the shop. The shop deployment leaves it unset and keeps its admin under /admin as before.
 */
export function isGestionaleOnly(env: Env = process.env): boolean {
  return env["GESTIONALE_ONLY"] === "true";
}

/**
 * Paths the management app still answers: the admin, auth callbacks, API routes, Next assets,
 * the files that make it installable and the product images the admin shows. Everything else
 * redirects to /admin. Kept here so next.config.ts and its test share one list.
 */
export const GESTIONALE_KEPT_PATHS = [
  "admin",
  "auth",
  "api",
  "_next",
  "manifest\\.webmanifest",
  "sw\\.js",
  "offline\\.html",
  "icons",
  "products",
  "brand",
  "favicon\\.ico",
  "robots\\.txt",
] as const;

export function gestionaleRedirectSource(): string {
  return `/:path((?!${GESTIONALE_KEPT_PATHS.join("|")}).*)`;
}

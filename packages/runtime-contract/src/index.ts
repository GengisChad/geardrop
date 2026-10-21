type Env = Readonly<Record<string, string | undefined>>;

export type AppSurface = "storefront" | "management";
export type ManagementMode = "read_only" | "active";
export type LegacyAdminMode = "enabled" | "redirect";

export type DeploymentContract = Readonly<{
  surface: AppSurface;
  managementMode: ManagementMode;
  managementOrigin: string | null;
  storefrontOrigin: string;
  expectedSupabaseProjectRef: string | null;
  legacyAdminMode: LegacyAdminMode;
}>;

export type RequestDisposition =
  | { readonly kind: "allow" }
  | { readonly kind: "redirect"; readonly destination: string }
  | { readonly kind: "not_found" };

const SHOP_PATHS = [
  "/assistenza", "/carrello", "/chi-siamo", "/conferma-email", "/conferma-recupero",
  "/legale", "/negozio", "/nuova-password", "/ordine", "/password-dimenticata",
  "/preferiti", "/prodotto", "/registrati", "/ricerca",
] as const;

export const MANAGEMENT_ROUTE_ALLOWLIST = [
  "/", "/login", "/logout", "/account", "/settings/security", "/mfa/enroll", "/mfa/challenge", "/auth/callback",
] as const;

export function isManagementApplicationRoute(pathname: string): boolean {
  return (MANAGEMENT_ROUTE_ALLOWLIST as readonly string[]).includes(pathname) || pathAtOrBelow(pathname, "/mfa");
}

export function assertStorefrontApplicationSurface(env: Env = process.env): DeploymentContract {
  if (env.NEXT_PUBLIC_APP_SURFACE?.trim() === "management") throw new Error("GD_ROOT_MANAGEMENT_BUILD_UNSUPPORTED");
  return readDeploymentContract(env);
}

export function assertManagementApplicationSurface(env: Env = process.env): DeploymentContract {
  if (env.NEXT_PUBLIC_APP_SURFACE?.trim() !== "management") throw new Error("GD_MANAGEMENT_SURFACE_REQUIRED");
  return readDeploymentContract(env);
}

function pathAtOrBelow(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function origin(value: string | undefined, error: string): string {
  try {
    const parsed = new URL(value ?? "");
    if (!(["http:", "https:"].includes(parsed.protocol)) || parsed.username || parsed.password ||
        parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error(error);
    return parsed.origin;
  } catch {
    throw new Error(error);
  }
}

export function readDeploymentContract(env: Env = process.env): DeploymentContract {
  const rawSurface = env.NEXT_PUBLIC_APP_SURFACE === undefined ? "storefront" : env.NEXT_PUBLIC_APP_SURFACE.trim();
  if (rawSurface !== "storefront" && rawSurface !== "management") throw new Error("GD_APP_SURFACE_INVALID");

  const rawMode = env.MANAGEMENT_MODE?.trim() || "read_only";
  if (rawMode !== "read_only" && rawMode !== "active") throw new Error("GD_MANAGEMENT_MODE_INVALID");

  const rawLegacy = env.LEGACY_ADMIN_MODE?.trim() || "enabled";
  if (rawLegacy !== "enabled" && rawLegacy !== "redirect") throw new Error("Invalid LEGACY_ADMIN_MODE");

  const needsManagementOrigin = rawSurface === "management" || rawLegacy === "redirect";
  const managementOrigin = needsManagementOrigin
    ? origin(env.MANAGEMENT_ORIGIN?.trim(), "GD_MANAGEMENT_ORIGIN_REQUIRED")
    : null;
  const expectedSupabaseProjectRef = env.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF?.trim() || null;
  if (rawSurface === "management" &&
      (!expectedSupabaseProjectRef || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expectedSupabaseProjectRef))) {
    throw new Error("GD_MANAGEMENT_PROJECT_REF_REQUIRED");
  }

  return {
    surface: rawSurface,
    managementMode: rawMode,
    managementOrigin,
    storefrontOrigin: origin(env.STOREFRONT_ORIGIN?.trim() || "https://geardropshop.it", "Invalid STOREFRONT_ORIGIN"),
    expectedSupabaseProjectRef,
    legacyAdminMode: rawLegacy,
  };
}

/** Compatibility for the legacy admin UI while its imports remain in the repository. */
export function isGestionaleOnly(env: Env = process.env): boolean {
  return readDeploymentContract(env).surface === "management";
}

export function assertManagementSupabaseTarget(
  contract: Pick<DeploymentContract, "surface" | "expectedSupabaseProjectRef">,
  supabaseUrl: string,
  nodeEnv: string | undefined,
): void {
  if (contract.surface !== "management") return;
  const expected = contract.expectedSupabaseProjectRef;
  if (!expected || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expected)) throw new Error("GD_MANAGEMENT_PROJECT_REF_REQUIRED");

  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error(expected === "local" ? "GD_MANAGEMENT_REMOTE_REQUIRED" : "GD_MANAGEMENT_PROJECT_MISMATCH");
  }

  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("GD_MANAGEMENT_PROJECT_MISMATCH");
  }
  if (expected === "local") {
    const loopback = parsed.hostname === "localhost" || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(parsed.hostname) ||
      parsed.hostname === "[::1]";
    if (nodeEnv === "production" || !loopback || !["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("GD_MANAGEMENT_REMOTE_REQUIRED");
    }
    return;
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== `${expected}.supabase.co` || parsed.port) {
    throw new Error("GD_MANAGEMENT_PROJECT_MISMATCH");
  }
}

export function classifyRequest(pathname: string, method: string, contract: DeploymentContract): RequestDisposition {
  const readable = method === "GET" || method === "HEAD";
  const admin = pathAtOrBelow(pathname, "/admin");
  if (contract.surface === "storefront") {
    if (admin && contract.legacyAdminMode === "redirect") {
      return readable
        ? { kind: "redirect", destination: `${contract.managementOrigin}/` }
        : { kind: "not_found" };
    }
    return { kind: "allow" };
  }

  return classifyManagementRequest(pathname, method, contract);
}

export function classifyManagementRequest(pathname: string, method: string, contract: DeploymentContract): RequestDisposition {
  const readable = method === "GET" || method === "HEAD";
  const admin = pathAtOrBelow(pathname, "/admin");

  if (admin) {
    return readable
      ? { kind: "redirect", destination: `${contract.managementOrigin}/` }
      : { kind: "not_found" };
  }
  if (pathAtOrBelow(pathname, "/api") || pathAtOrBelow(pathname, "/checkout") ||
      pathAtOrBelow(pathname, "/preview") || pathAtOrBelow(pathname, "/webhook")) {
    return { kind: "not_found" };
  }
  if (isManagementApplicationRoute(pathname) && pathname !== "/auth/callback" && (readable || method === "POST")) return { kind: "allow" };
  if (readable && pathname === "/auth/callback") return { kind: "allow" };
  if (readable && (
    pathAtOrBelow(pathname, "/_next/static") || pathname === "/_next/image" ||
    pathname === "/management.webmanifest" || pathname === "/management-sw.js" ||
    pathname === "/management-offline.html" || pathname.startsWith("/icons/gestionale-") ||
    pathname === "/favicon.ico" || pathname === "/robots.txt"
  )) return { kind: "allow" };
  if (readable && SHOP_PATHS.some((root) => pathAtOrBelow(pathname, root))) {
    return { kind: "redirect", destination: `${contract.storefrontOrigin}${pathname}` };
  }
  return { kind: "not_found" };
}

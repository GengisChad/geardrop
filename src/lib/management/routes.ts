/** Public paths on the management deployment and their internal Next routes. */
export const MANAGEMENT_REWRITES = {
  "/": "/gestionale",
  "/login": "/gestionale/login",
  "/logout": "/gestionale/logout",
  "/account": "/gestionale/account",
  "/settings/security": "/gestionale/settings/security",
} as const;

export function managementInternalPath(pathname: string): string | null {
  if (Object.prototype.hasOwnProperty.call(MANAGEMENT_REWRITES, pathname)) {
    return MANAGEMENT_REWRITES[pathname as keyof typeof MANAGEMENT_REWRITES];
  }
  if (pathname === "/mfa" || pathname.startsWith("/mfa/")) return `/gestionale${pathname}`;
  return null;
}

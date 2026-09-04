import type { BeforeSendEvent } from "@vercel/analytics/next";

const SENSITIVE_ROUTE_FAMILIES = [
  "/account",
  "/admin",
  "/auth",
  "/carrello",
  "/checkout",
  "/login",
  "/registrati",
  "/password-dimenticata",
  "/nuova-password",
  "/conferma-email",
  "/conferma-recupero",
  "/preferiti",
] as const;

function isSensitivePath(pathname: string): boolean {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathname).replaceAll("\\", "/");
  } catch {
    return true;
  }

  return SENSITIVE_ROUTE_FAMILIES.some(
    (route) => decodedPath === route || decodedPath.startsWith(`${route}/`),
  );
}

export function sanitizeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;

  try {
    const url = new URL(event.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isSensitivePath(url.pathname)) return null;

    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}

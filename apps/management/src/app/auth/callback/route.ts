import "server-only";

/**
 * Callback OAuth/PKCE per lo staff del gestionale.
 * Gestisce inviti e recovery dello staff; il callback root resta proprietario
 * dei clienti dello storefront e NON va toccato.
 *
 * Sicurezza:
 * - Solo codici validi vengono scambiati; un errore Supabase rimanda a /login.
 * - Il parametro `next` viene validato contro la allowlist delle route gestionali:
 *   qualsiasi path non riconosciuto viene ignorato e sostituito con "/".
 * - Non viene mai eseguito un redirect verso origini esterne.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createManagementServerClient } from "@/lib/supabase/server";
import { isManagementApplicationRoute } from "@geardrop/runtime-contract";

/**
 * Valida il parametro `next` restituendo solo path gestionali sicuri.
 * Accetta esclusivamente path assoluti presenti nella allowlist management.
 */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/";
  // Separa il pathname dai parametri query e dal fragment per la validazione.
  const pathname = (raw.split("?")[0] ?? "").split("#")[0] ?? "";
  if (!pathname || !isManagementApplicationRoute(pathname)) return "/";
  return raw;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const errorParam = searchParams.get("error");

  // Supabase ha inviato un errore (link scaduto, già usato, ecc.).
  // Non rivela il dettaglio dell'errore nella query string del redirect.
  if (errorParam) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Scambia il codice PKCE per la sessione.
  const client = await createManagementServerClient();
  const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect verso la destinazione validata (solo route gestionali).
  // Per gli inviti staff il `next` sarà tipicamente "/mfa/enroll".
  // Per il recovery senza `next` esplicito si torna a "/" (area protetta).
  const destination = safeNextPath(next);
  return NextResponse.redirect(new URL(destination, request.url));
}

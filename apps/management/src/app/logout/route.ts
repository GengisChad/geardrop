import "server-only";

/**
 * Route di logout del gestionale.
 * 1. Sign-out lato server.
 * 2. Risponde con una pagina HTML minimale che pulisce la cache PWA nominata
 *    e reindirizza a /login. La pulizia è innocua se la cache non esiste
 *    (il service worker arriverà nel Task 6).
 */

import { NextResponse } from "next/server";
import { createManagementServerClient } from "@/lib/supabase/server";

/**
 * Nome della cache PWA gestionale.
 * Il service worker del Task 6 userà esattamente questo nome.
 * Dichiarato ed esportato qui affinché task/test successivi possano importarlo
 * senza rischio di disallineamento.
 */
export const MANAGEMENT_CACHE_NAME = "geardrop-management-shell-v1" as const;

export async function GET(): Promise<NextResponse> {
  // Sign-out lato server. Un errore non blocca il logout: l'utente viene comunque
  // rimandato al login e la sessione scade per TTL.
  try {
    const client = await createManagementServerClient();
    await client.auth.signOut();
  } catch {
    // Nessuna azione: il redirect avviene comunque.
  }

  // Restituisce HTML con script che:
  // 1. Elimina la cache PWA (innocuo se non esiste o se l'API Cache non è supportata).
  // 2. Reindirizza a /login.
  // Il tag <noscript> gestisce il caso senza JavaScript.
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<title>Disconnessione in corso…</title>
</head>
<body>
<script>
(function () {
  if (typeof caches !== 'undefined') {
    caches.delete(${JSON.stringify(MANAGEMENT_CACHE_NAME)}).catch(function () {});
  }
  location.replace('/login');
}());
</script>
<noscript>
  <meta http-equiv="refresh" content="0;url=/login">
</noscript>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

"use client";

/**
 * Registra il service worker del gestionale lato client.
 *
 * Il service worker viene registrato solo in produzione (NODE_ENV=production)
 * tramite la variabile NEXT_PUBLIC_APP_SURFACE. In sviluppo il componente
 * resta montato ma non registra nulla, evitando interferenze con HMR.
 *
 * Non ha stato visibile: il componente è puramente un effetto collaterale.
 * Deve essere incluso nel layout protetto (apps/management/src/app/(protected)/layout.tsx)
 * o nel layout root (apps/management/src/app/layout.tsx), non in entrambi.
 *
 * Istruzioni per l'agente della shell (NON modificare layout.tsx in questo task):
 *   1. Aggiungere nel <head> del layout:
 *        <link rel="manifest" href="/management.webmanifest" />
 *   2. Includere il componente nel corpo del layout:
 *        import { ManagementPwa } from "@/components/management-pwa";
 *        // dentro il body, fuori da Suspense/Protected:
 *        <ManagementPwa />
 */

import { useEffect } from "react";

export function ManagementPwa() {
  useEffect(() => {
    // Registra solo in produzione e solo se l'API è disponibile.
    // In sviluppo (next dev) il service worker non viene registrato per evitare
    // di interferire con il Fast Refresh e le route di sviluppo.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/management-sw.js", { scope: "/" })
      .catch(() => {
        // La registrazione fallisce in modo silenzioso: l'app funziona comunque
        // in modalità non-PWA. Non logghiamo errori per evitare di esporre
        // dettagli di configurazione in console produzione.
      });
  }, []);

  return null;
}

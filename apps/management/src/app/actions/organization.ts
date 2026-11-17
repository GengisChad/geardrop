"use server";
/**
 * Server action: cambia l'organizzazione corrente dell'utente.
 *
 * Sicurezza: il principal viene sempre riletto dal database (requireManagementPrincipal
 * senza slug preferito), così lo slug fornito viene validato contro le sole membership
 * attive reali. Un input non valido non imposta nulla e non dà errori al chiamante.
 *
 * Nessuna dipendenza dalla root (src/...). Solo package workspace e file propri dell'app.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  MANAGEMENT_ORGANIZATION_COOKIE,
  requireManagementPrincipal,
} from "@geardrop/data-contract";
import { createManagementServerClient } from "../../lib/supabase/server";

/**
 * Imposta la preferenza organizzazione per l'utente corrente.
 *
 * - Rilegge il principal dal database: non si fida dell'input.
 * - Se lo slug non è tra le membership attive, non imposta nulla e ritorna.
 * - In caso di successo, imposta il cookie e redirect a /.
 */
export async function setOrganization(slug: string): Promise<void> {
  const client = await createManagementServerClient();

  // Rilegge il principal dal DB: mai fidarsi dell'input per autorizzare.
  const principal = await requireManagementPrincipal(client);

  const isValid = principal.organizations.some((org) => org.slug === slug);
  if (!isValid) {
    // Slug sconosciuto o senza membership attiva: ignora silenziosamente.
    return;
  }

  const store = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  store.set(MANAGEMENT_ORGANIZATION_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    // La preferenza dura un anno: verrà sempre rivalidata contro le membership attive.
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/");
}

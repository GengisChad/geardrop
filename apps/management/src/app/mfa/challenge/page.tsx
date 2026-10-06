/**
 * Pagina di challenge TOTP per il gestionale.
 * Server Component: verifica che l'utente sia autenticato prima di mostrare il form.
 * Il fattore e il codice vengono gestiti SOLO nel componente client.
 */
import { redirect } from "next/navigation";
import { createManagementServerClient } from "@/lib/supabase/server";
import { MfaChallenge } from "@/components/mfa-challenge";

export const dynamic = "force-dynamic";

export default async function ChallengePage() {
  // Verifica autenticazione server-side (mai getSession)
  const client = await createManagementServerClient();
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  // Se già AAL2, non serve la challenge
  const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData?.currentLevel === "aal2") {
    redirect("/");
  }

  if (aalData?.nextLevel !== "aal2") {
    // Nessun fattore registrato: va all'enrollment (solo se owner, ma il layout lo gestisce)
    redirect("/mfa/enroll");
  }

  return (
    <main>
      <h1>Verifica identità</h1>
      <p>Inserisci il codice dalla tua app di autenticazione per continuare.</p>
      <MfaChallenge />
    </main>
  );
}

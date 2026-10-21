/**
 * Pagina di enrollment TOTP per il gestionale.
 * Server Component: verifica che l'utente sia autenticato prima di mostrare il form.
 * QR e secret vengono gestiti SOLO nel componente client (mai qui).
 */
import { redirect } from "next/navigation";
import { createManagementServerClient } from "@/lib/supabase/server";
import { MfaEnrollment } from "@/components/mfa-enrollment";

export const dynamic = "force-dynamic";

export default async function EnrollPage() {
  // Verifica autenticazione server-side (mai getSession)
  const client = await createManagementServerClient();
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  // Se l'utente ha già un fattore verificato, la destinazione corretta è la challenge
  const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData?.currentLevel === "aal2") {
    // Già autenticato con AAL2: nessun enrollment necessario
    redirect("/");
  }

  if (aalData?.nextLevel === "aal2") {
    // Fattore già registrato ma non ancora sfidato in questa sessione
    redirect("/mfa/challenge");
  }

  return (
    <main>
      <h1>Configura l&apos;autenticazione a due fattori</h1>
      <p>
        Per accedere al gestionale come owner è necessario configurare
        un&apos;app di autenticazione (TOTP).
      </p>
      <MfaEnrollment />
    </main>
  );
}

/**
 * Pagina di login del gestionale.
 * Titolo neutro: non rivela a quale azienda appartiene il gestionale prima dell'accesso.
 * Nessun link di registrazione, nessun recupero self-service che aggiri l'MFA.
 */

import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main>
      <h1>Gestionale</h1>
      <p className="lead">Accesso riservato allo staff</p>
      <LoginForm />
    </main>
  );
}

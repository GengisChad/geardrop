/**
 * Pagina di login del gestionale.
 * Nessun link di registrazione, nessun recupero self-service che aggiri l'MFA.
 */

import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main>
      <h1>GEAR//DROP</h1>
      <p className="lead">Gestionale · accesso riservato allo staff</p>
      <LoginForm />
    </main>
  );
}

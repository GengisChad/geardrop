import type { Metadata } from "next";
import { AuthLink, AuthShell } from "@/components/auth/auth-shell";
import { RecoverForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Recupera password",
  robots: { index: false, follow: false },
};

export default function RecuperaPage() {
  return (
    <AuthShell
      title="Password dimenticata"
      intro="Inserisci la tua email: se l'indirizzo è registrato ricevi un link per impostarne una nuova."
      footer={<AuthLink href="/auth/login">Torna all&apos;accesso</AuthLink>}
    >
      <RecoverForm />
    </AuthShell>
  );
}

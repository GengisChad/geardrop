import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoverForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Password dimenticata",
  description: "Reimposta la password del tuo account GEAR//DROP.",
  robots: { index: false, follow: false },
};

export default function RecoverPage() {
  return (
    <AuthShell
      title="Password dimenticata"
      intro="Inserisci la tua email: se l'indirizzo è registrato ti arriva un link per reimpostare la password."
      breadcrumb="Password dimenticata"
    >
      <RecoverForm />
    </AuthShell>
  );
}

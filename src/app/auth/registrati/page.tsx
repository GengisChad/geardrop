import type { Metadata } from "next";
import { AuthLink, AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Registrati",
  robots: { index: false, follow: false },
};

export default function RegistratiPage() {
  return (
    <AuthShell
      title="Crea account"
      intro="Ti serve solo un'email. Riceverai un link di conferma prima del primo accesso."
      footer={
        <>
          Hai già un account? <AuthLink href="/auth/login">Accedi</AuthLink>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}

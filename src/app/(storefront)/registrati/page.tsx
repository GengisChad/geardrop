import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/auth-forms";
import { getCustomerSession } from "@/lib/auth/customer";

export const metadata: Metadata = {
  title: "Crea un account",
  description: "Registrati su GEAR//DROP.",
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  if (await getCustomerSession()) redirect("/account");

  return (
    <AuthShell
      title="Crea un account"
      intro="Ti serve solo un'email. Confermi l'indirizzo e sei dentro."
      breadcrumb="Registrati"
    >
      <RegisterForm />
    </AuthShell>
  );
}

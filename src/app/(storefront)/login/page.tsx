import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";
import { getCustomerSession } from "@/lib/auth/customer";

export const metadata: Metadata = {
  title: "Accedi",
  description: "Accedi al tuo account GEAR//DROP.",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getCustomerSession()) redirect("/account");

  return (
    <AuthShell
      title="Accedi"
      intro="Entra per seguire i tuoi ordini e ritrovare i preferiti su ogni dispositivo."
      breadcrumb="Accedi"
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/auth-forms";
import { getCustomerSession } from "@/lib/auth/customer";

export const metadata: Metadata = {
  title: "Nuova password",
  description: "Imposta una nuova password.",
  robots: { index: false, follow: false },
};

export default async function NewPasswordPage() {
  // The recovery link creates the session before redirecting here. Without one there is
  // nothing to update, so send the visitor back to recovery instead of showing a form
  // whose submit could only fail.
  const session = await getCustomerSession();

  if (!session) {
    return (
      <AuthShell
        title="Link non valido"
        intro="Il link di recupero è scaduto o è già stato usato."
        breadcrumb="Nuova password"
      >
        <Link
          href={"/password-dimenticata" as Route}
          className="gd-display gd-glass-interactive inline-flex h-12 items-center justify-center rounded-2xl bg-violet px-6 text-small font-bold tracking-wider text-white"
        >
          RICHIEDI UN NUOVO LINK
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nuova password"
      intro="Scegli una password di almeno 8 caratteri."
      breadcrumb="Nuova password"
    >
      <NewPasswordForm />
    </AuthShell>
  );
}

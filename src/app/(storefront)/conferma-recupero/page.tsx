import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmRecoveryForm } from "@/components/auth/confirm-forms";

export const metadata: Metadata = {
  title: "Recupero password",
  description: "Continua la reimpostazione della password GEAR//DROP.",
  robots: { index: false, follow: false },
};

/**
 * The landing page of the recovery email. Same contract as /conferma-email: the GET is
 * inert, verifyOtp runs only on the explicit button's server action, and a successful
 * verification continues to /nuova-password.
 */
export default async function ConfirmRecoveryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash?.trim() ?? "";
  const wellFormed = tokenHash.length >= 16 && tokenHash.length <= 256 && (params.type ?? "recovery") === "recovery";

  if (!wellFormed) {
    return (
      <AuthShell
        title="Link non valido"
        intro="Il link di recupero è incompleto. Apri l'email più recente e usa il suo pulsante, oppure richiedi un nuovo link."
        breadcrumb="Recupero password"
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
      title="Reimposta la password"
      intro="Premi il pulsante per verificare il link e scegliere una nuova password. Il link email da solo non fa nulla."
      breadcrumb="Recupero password"
    >
      <ConfirmRecoveryForm tokenHash={tokenHash} />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmSignupForm } from "@/components/auth/confirm-forms";

export const metadata: Metadata = {
  title: "Conferma email",
  description: "Conferma il tuo account GEAR//DROP.",
  robots: { index: false, follow: false },
};

/**
 * The landing page of the confirmation email. Deliberately inert on GET: it validates the
 * parameters' shape, renders the glass page and the explicit button, and touches nothing —
 * verifyOtp runs only in the form's server action. Mailbox link scanners fetch this page
 * and burn nothing.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash?.trim() ?? "";
  const wellFormed = tokenHash.length >= 16 && tokenHash.length <= 256 && (params.type ?? "email") === "email";

  if (!wellFormed) {
    return (
      <AuthShell
        title="Link non valido"
        intro="Il link di conferma è incompleto. Apri l'email più recente e usa il suo pulsante, oppure richiedi una nuova email."
        breadcrumb="Conferma email"
      >
        <Link
          href={"/login" as Route}
          className="gd-display gd-glass-interactive inline-flex h-12 items-center justify-center rounded-2xl bg-violet px-6 text-small font-bold tracking-wider text-white"
        >
          VAI ALL&apos;ACCESSO
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Conferma il tuo account"
      intro="Un ultimo passo: premi il pulsante per attivare l'account. Il link email da solo non attiva nulla."
      breadcrumb="Conferma email"
    >
      <ConfirmSignupForm tokenHash={tokenHash} />
    </AuthShell>
  );
}

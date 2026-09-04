import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/auth-forms";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Nuova password",
  robots: { index: false, follow: false },
};

/** Guarded by the recovery session, so the outcome cannot be baked in at build time. */
export const dynamic = "force-dynamic";

/**
 * Reached from the recovery email through /auth/confirm, which has already exchanged the
 * token for a session. Without that session there is nothing to update, so the guard
 * sends the visitor back to the login page.
 */
export default async function NuovaPasswordPage() {
  await requireUser("/auth/nuova-password");

  return (
    <AuthShell title="Nuova password" intro="Scegli una password di almeno 8 caratteri.">
      <NewPasswordForm />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLink, AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";
import { getSessionUser } from "@/lib/auth/session";
import { appRoute } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Accedi",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; errore?: string }>;
}) {
  const { redirect: target, errore } = await searchParams;

  // Already signed in: there is nothing to do on this page.
  if (await getSessionUser()) {
    redirect(appRoute(target?.startsWith("/") && !target.startsWith("//") ? target : "/account"));
  }

  return (
    <AuthShell
      title="Accedi"
      intro="Entra per seguire i tuoi ordini e ritrovare tutto dove l'hai lasciato."
      footer={
        <>
          Non hai un account? <AuthLink href="/auth/registrati">Registrati</AuthLink> ·{" "}
          <AuthLink href="/auth/recupera">Password dimenticata</AuthLink>
        </>
      }
    >
      {errore === "link" ? (
        <p role="alert" className="mb-4 rounded-xl bg-soldout/10 px-3.5 py-2.5 text-small text-soldout">
          Il link non è più valido. Richiedine uno nuovo.
        </p>
      ) : null}
      <LoginForm {...(target ? { redirectTo: target } : {})} />
    </AuthShell>
  );
}

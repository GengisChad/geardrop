import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewsletterTokenForm } from "@/components/newsletter/newsletter-token-form";
import { Button } from "@/components/ui/button";
import { isNewsletterToken } from "@/lib/newsletter/newsletter";

export const metadata: Metadata = {
  title: "Conferma iscrizione",
  description: "Conferma l'iscrizione alle novità di GEAR//DROP.",
  robots: { index: false, follow: false },
};

/** The landing page of the confirmation email. Inert on GET: only its button confirms. */
export default async function NewsletterConfirmPage({ searchParams }: { readonly searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;

  if (!isNewsletterToken(t)) {
    return (
      <AuthShell title="Link non valido" intro="Il link è incompleto. Apri l'email più recente e usa il suo pulsante, oppure iscriviti di nuovo dalla home." breadcrumb="Novità">
        <Button as={Link} href="/" variant="primary" size="md" fullWidth>
          Vai alla home
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Conferma l'iscrizione"
      intro="Un ultimo passo: premi il pulsante e ti scriviamo quando arrivano pezzi nuovi o tornano quelli finiti."
      breadcrumb="Novità"
    >
      <NewsletterTokenForm kind="confirm" token={t.trim()} />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewsletterTokenForm } from "@/components/newsletter/newsletter-token-form";
import { isNewsletterToken } from "@/lib/newsletter/newsletter";

export const metadata: Metadata = {
  title: "Cancella iscrizione",
  description: "Smetti di ricevere le novità di GEAR//DROP.",
  robots: { index: false, follow: false },
};

/** The unsubscribe link in every newsletter email. Inert on GET: only its button unsubscribes. */
export default async function NewsletterUnsubscribePage({ searchParams }: { readonly searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;

  if (!isNewsletterToken(t)) {
    return (
      <AuthShell title="Link non valido" intro="Il link è incompleto. Scrivici a infogeardrop@gmail.com e ti cancelliamo noi." breadcrumb="Novità">
        {null}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Cancella l'iscrizione" intro="Premi il pulsante e non riceverai più le nostre email sulle novità." breadcrumb="Novità">
      <NewsletterTokenForm kind="unsubscribe" token={t.trim()} />
    </AuthShell>
  );
}

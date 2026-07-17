import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SlashMark } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { TrustBandDark } from "@/components/home/trust";

export const metadata: Metadata = {
  title: "Chi siamo",
  description:
    "GEAR//DROP è il punto di riferimento italiano per Beyblade X: prodotti originali, spedizione veloce, community.",
};

const PILLARS = [
  {
    title: "Solo prodotti originali",
    body: "Vendiamo esclusivamente Beyblade X ufficiali. Nessuna replica: quello che compri è quello che porti in torneo.",
  },
  {
    title: "Drop, non scaffali",
    body: "Ogni settimana entrano nuovi pezzi. Quando un drop finisce, finisce: preferiamo dirlo che fingere disponibilità.",
  },
  {
    title: "Parliamo la lingua del gioco",
    body: "Attacco, difesa, stamina, bilanciato: se ci chiedi un consiglio su un assetto, sappiamo di cosa parli.",
  },
  {
    title: "Community prima di tutto",
    body: "Siamo nati dalla community italiana di Beyblade X e continuiamo a farne parte, dentro e fuori dallo stadio.",
  },
] as const;

export default function ChiSiamoPage() {
  return (
    <>
      <section className="gd-glass gd-section-ambient relative mx-4 mt-4 overflow-hidden rounded-[--radius-glass-lg] sm:mx-6">
        <div className="gd-streaks absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Chi siamo" }]} className="mb-6" />
          <h1 className="gd-display-wide text-[2.25rem] font-extrabold leading-[0.98] text-graphite sm:text-[3rem]">
            <span className="block">Nati nello stadio.</span>{" "}
            <span className="block text-lime-ink">Cresciuti nella community.</span>
          </h1>
          <p className="mt-5 max-w-xl text-body text-grey-600">
            GEAR//DROP è uno store indipendente costruito da blader per blader. Un posto dove trovare i pezzi giusti,
            sapere davvero cosa stai comprando e riceverlo in fretta.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-h2 font-bold text-graphite">Come lavoriamo</h2>
          <SlashMark />
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <li key={pillar.title} className="gd-glass-card gd-glass-interactive rounded-[--radius-glass] p-5">
              <h3 className="text-h3 font-bold text-graphite">{pillar.title}</h3>
              <p className="mt-2 text-small leading-relaxed text-grey-600">{pillar.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button as={Link} href="/negozio" variant="primary" size="lg">
            Esplora il catalogo
          </Button>
          <Button as={Link} href="/assistenza/contatti" variant="secondary" size="lg">
            Scrivici
          </Button>
        </div>
      </div>

      <TrustBandDark className="pb-16" />
    </>
  );
}

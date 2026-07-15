import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Emblem } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="relative overflow-hidden">
      <div className="gd-streaks absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:px-6">
        {/* The emblem is the decorative mark. (audit §7.2) */}
        <Emblem size={96} className="size-24 animate-[gd-spin_9s_linear_infinite] opacity-90" />

        <p className="gd-display-wide mt-8 text-[4rem] font-extrabold leading-none text-graphite">404</p>
        <h1 className="gd-display-wide mt-2 text-h2 font-extrabold text-lime-ink">Fuori dallo stadio.</h1>
        <p className="mt-4 text-small text-grey-600">
          La pagina che cerchi non esiste o è stata spostata. Torna in arena e riprova.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button as={Link} href="/" variant="primary" size="lg">
            Torna alla home
          </Button>
          <Button as={Link} href="/negozio" variant="secondary" size="lg">
            Esplora il negozio
          </Button>
        </div>
      </div>
    </div>
  );
}

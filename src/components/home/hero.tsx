import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/commerce/types";

/**
 * Hero pattern from mockup-home-upper: eyebrow, two graphite lines + one lime line,
 * lime CTA + secondary CTA. The diagonal streaks are CSS (gd-streaks), not the mockup
 * image. (audit §7.9)
 */
export function Hero({ product }: { product: Product }) {
  const image = product.images[0];

  return (
    <section className="relative overflow-hidden bg-grey-100">
      <div className="gd-streaks absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="absolute -right-24 top-1/2 size-[42rem] -translate-y-1/2 rounded-full bg-violet/12 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-[1400px] items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-6 lg:py-20">
        <div className="lg:pr-6">
          {/* Beyblade X is a third-party mark: set as type, not lifted as an asset. (audit §9.3) */}
          <p className="gd-display-wide flex items-center gap-1.5 text-small font-bold tracking-[0.2em] text-graphite">
            Beyblade <span className="text-lime-ink">X</span>
          </p>

          {/* The {" "} between the block spans is load-bearing: without it the text nodes
              concatenate and the heading reads "Pronti allabattaglia." to a screen
              reader and on copy. The spaces collapse and never render. */}
          <h1 className="gd-display-wide mt-4 text-[2.5rem] font-extrabold leading-[0.95] sm:text-[3.5rem] lg:text-[4.25rem]">
            <span className="block text-graphite">Pronti alla</span>{" "}
            <span className="block text-graphite">battaglia.</span>{" "}
            <span className="block text-lime-ink">Nati per vincere.</span>
          </h1>

          <p className="mt-6 max-w-md text-body text-grey-600">
            {product.name}
            {" con arena, 2 trottole e lanciatori inclusi. Entra nell'arena. Domina lo scontro."}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button as={Link} href={`/prodotto/${product.slug}`} variant="primary" size="lg" className="sm:w-auto">
              Acquista ora
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button as={Link} href="/negozio/beyblade-x" variant="secondary" size="lg" className="sm:w-auto">
              Esplora Beyblade X
            </Button>
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 size-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/10 blur-2xl"
          />
          {image ? (
            <Image
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              priority
              sizes="(min-width: 1024px) 620px, 92vw"
              className="relative mx-auto h-auto w-full max-w-[620px] object-contain drop-shadow-[0_28px_40px_rgba(18,20,23,0.22)]"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

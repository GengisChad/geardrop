import Image from "next/image";

/**
 * The hero centrepiece: the supplied energy-impact VFX — a lime and a violet trail
 * colliding. Its painted checkerboard background is keyed to real transparency and the
 * canvas cropped to the energy's alpha mass in scripts/build-assets.py (`cut_glow`).
 *
 * Deliberately plain: the image is shown statically and almost whole (intrinsic size,
 * no object-cover, no crop) with no masks, blooms or filters over it — the artwork is
 * the effect, and anything layered on top washed it out.
 */
export function HeroImpact() {
  return (
    <div
      data-testid="hero-impact"
      className="relative mx-auto min-w-0 w-[112%] max-w-none -translate-x-[2%] sm:w-full lg:w-[128%] lg:-translate-x-[8%]"
    >
      <Image
        src="/hero/impact.png"
        alt="Scia di energia lime e scia viola che si scontrano"
        width={1353}
        height={830}
        priority
        sizes="(min-width: 1280px) 840px, (min-width: 1024px) 58vw, 94vw"
        className="h-auto w-full object-contain"
      />
    </div>
  );
}

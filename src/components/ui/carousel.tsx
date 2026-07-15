"use client";

import { useEffect, useReducer } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CarouselProps = {
  children: ReactNode;
  /** Side arrows, as on the "ULTIMI DROP" / "PIÙ VENDUTI" rows. */
  arrows?: boolean;
  /** Progress dots, as under the "IN EVIDENZA" row. */
  dots?: boolean;
  label: string;
  className?: string;
};

export function Carousel({ children, arrows = true, dots = false, label, className }: CarouselProps) {
  const [emblaRef, embla] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", loop: false });

  // Embla owns this state. Rather than mirroring it into React state from the effect
  // body (which cascades renders), the effect only subscribes, and the values are read
  // straight off the instance while rendering. `embla` arrives via a state update from
  // useEmblaCarousel, so the first render that has it already reads the real values.
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!embla) return;
    embla.on("select", forceRender).on("reInit", forceRender);
    return () => {
      embla.off("select", forceRender).off("reInit", forceRender);
    };
  }, [embla]);

  const snaps = embla ? embla.scrollSnapList() : [];
  const selected = embla ? embla.selectedScrollSnap() : 0;
  const canPrev = embla ? embla.canScrollPrev() : false;
  const canNext = embla ? embla.canScrollNext() : false;

  return (
    <div className={cn("relative", className)}>
      <div className="overflow-hidden" ref={emblaRef} role="region" aria-roledescription="carosello" aria-label={label}>
        <div className="flex gap-4 md:gap-5">{children}</div>
      </div>

      {arrows ? (
        <>
          <CarouselArrow
            direction="prev"
            disabled={!canPrev}
            onClick={() => embla?.scrollPrev()}
            className="-left-3 lg:-left-5"
          />
          <CarouselArrow
            direction="next"
            disabled={!canNext}
            onClick={() => embla?.scrollNext()}
            className="-right-3 lg:-right-5"
          />
        </>
      ) : null}

      {dots && snaps.length > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          {snaps.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => embla?.scrollTo(index)}
              aria-label={`Vai alla slide ${index + 1}`}
              aria-current={index === selected}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                index === selected ? "w-8 bg-lime" : "w-4 bg-grey-300 hover:bg-grey-400",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
  className,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Precedente" : "Successivo"}
      className={cn(
        "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full",
        "border border-grey-200 bg-white text-graphite shadow-[0_4px_16px_-4px_rgba(18,20,23,0.25)]",
        "transition-all duration-200 hover:border-violet hover:text-violet",
        "disabled:pointer-events-none disabled:opacity-0",
        "sm:flex",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

/** Fixed-width slide so cards keep a consistent rhythm across breakpoints. */
export function CarouselSlide({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 shrink-0 grow-0 basis-[70%] sm:basis-[42%] md:basis-[31%] lg:basis-[23%] xl:basis-[19%]", className)}>
      {children}
    </div>
  );
}

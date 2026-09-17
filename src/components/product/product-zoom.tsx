"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { cutoutSrc, type ProductImage } from "@/data/assets";
import { cn } from "@/lib/cn";

type ProductZoomProps = {
  readonly images: readonly ProductImage[];
  readonly index: number;
  readonly name: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onIndexChange: (index: number) => void;
};

/**
 * Full-screen view of the product photos. A tap or click zooms in two times on that spot and the
 * enlarged photo scrolls in both directions; another tap fits it back. Native <dialog>, so focus
 * is trapped and Esc closes it.
 */
export function ProductZoom({ images, index, name, open, onClose, onIndexChange }: ProductZoomProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  // Where the zoom was asked for, as a share of the photo's width and height.
  const focus = useRef({ x: 0.5, y: 0.5 });
  const active = images[index];
  const many = images.length > 1;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      const root = document.documentElement;
      const previous = root.style.overflow;
      root.style.overflow = "hidden";
      return () => {
        root.style.overflow = previous;
      };
    }
    if (!open && element.open) element.close();
    return undefined;
  }, [open]);

  // Esc and the browser's own close both end in the native close event; the page state follows it,
  // otherwise the photo could not be opened a second time.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return undefined;
    const closed = () => {
      setZoomed(false);
      onClose();
    };
    element.addEventListener("close", closed);
    return () => element.removeEventListener("close", closed);
  }, [onClose]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (!zoomed) {
      element.scrollTo({ left: 0, top: 0 });
      return;
    }
    element.scrollTo({
      left: focus.current.x * element.scrollWidth - element.clientWidth / 2,
      top: focus.current.y * element.scrollHeight - element.clientHeight / 2,
    });
  }, [zoomed]);

  if (!active) return null;

  const show = (next: number) => {
    setZoomed(false);
    onIndexChange((next + images.length) % images.length);
  };

  const toggleZoom = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    focus.current = {
      x: box.width ? (event.clientX - box.left) / box.width : 0.5,
      y: box.height ? (event.clientY - box.top) / box.height : 0.5,
    };
    setZoomed((current) => !current);
  };

  return (
    <dialog
      ref={dialog}
      aria-label={`${name}: foto ingrandita`}
      data-testid="product-zoom"
      onClick={(event) => {
        // A click on the dark surround, not on the photo or the controls, closes the view.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onKeyDown={(event) => {
        // Browsers close a modal on Esc themselves; this also covers keyboards they do not see.
        if (event.key === "Escape") event.currentTarget.close();
        if (!many) return;
        if (event.key === "ArrowLeft") show(index - 1);
        if (event.key === "ArrowRight") show(index + 1);
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-void p-0 text-graphite backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="gd-mono min-w-0 truncate text-[0.6875rem] uppercase tracking-[0.12em] text-grey-600">
            {name}
            {many ? ` · ${index + 1}/${images.length}` : ""}
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Chiudi"
            data-testid="product-zoom-close"
            className="gd-glass-compact inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:text-violet-soft"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div ref={viewport} className={cn("relative min-h-0 flex-1", zoomed ? "overflow-auto" : "overflow-hidden")}>
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={zoomed ? "Riduci la foto" : "Ingrandisci la foto"}
            aria-pressed={zoomed}
            data-testid="product-zoom-toggle"
            className={cn("relative block", zoomed ? "h-[200%] w-[200%] cursor-zoom-out" : "h-full w-full cursor-zoom-in")}
          >
            <Image
              key={active.src}
              src={cutoutSrc(active.src) ?? active.src}
              alt={active.alt}
              fill
              quality={95}
              sizes={zoomed ? "200vw" : "100vw"}
              className="object-contain p-4 sm:p-10"
            />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 px-4 py-3">
          {many ? (
            <button
              type="button"
              onClick={() => show(index - 1)}
              aria-label="Foto precedente"
              className="gd-glass-compact inline-flex size-11 items-center justify-center rounded-full transition-colors hover:text-violet-soft"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          ) : null}
          <p className="flex items-center gap-2 text-[0.6875rem] text-grey-600">
            {zoomed ? <ZoomOut className="size-4" aria-hidden="true" /> : <ZoomIn className="size-4" aria-hidden="true" />}
            {zoomed ? "Scorri per spostarti, tocca per ridurre" : "Tocca la foto per ingrandire"}
          </p>
          {many ? (
            <button
              type="button"
              onClick={() => show(index + 1)}
              aria-label="Foto successiva"
              className="gd-glass-compact inline-flex size-11 items-center justify-center rounded-full transition-colors hover:text-violet-soft"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

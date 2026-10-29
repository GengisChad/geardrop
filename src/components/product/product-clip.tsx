"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import type { ProductClip } from "@/data/assets";

/**
 * The gallery's clip. It mounts only when chosen, plays once without sound and stops on its
 * settled last frame, then offers "Rivedi". With reduced motion it never starts on its own: the
 * poster shows with the native controls, so playing it stays the visitor's choice.
 */
export function ProductClipPlayer({ clip, name }: { clip: ProductClip; name: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element || reduce) return;
    // A browser that refuses to play straight away gets the replay button instead.
    element.play().catch(() => setEnded(true));
  }, [reduce]);

  const replay = () => {
    const element = video.current;
    if (!element) return;
    setEnded(false);
    element.currentTime = 0;
    element.play().catch(() => setEnded(true));
  };

  return (
    <div className="absolute inset-0">
      <video
        ref={video}
        src={clip.src}
        poster={clip.poster}
        width={clip.width}
        height={clip.height}
        muted
        playsInline
        preload="none"
        controls={Boolean(reduce)}
        onEnded={() => setEnded(true)}
        aria-label={`Clip di ${name}`}
        data-testid="product-clip"
        className="size-full object-cover"
      />
      {ended && !reduce ? (
        <button
          type="button"
          onClick={replay}
          className="gd-display absolute bottom-3 right-3 inline-flex h-11 items-center gap-2 border border-white/15 bg-void/75 px-3.5 text-[0.75rem] font-bold tracking-wider text-graphite transition-colors hover:border-lime hover:text-lime"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Rivedi
        </button>
      ) : null}
    </div>
  );
}

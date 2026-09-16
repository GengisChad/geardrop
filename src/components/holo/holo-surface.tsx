"use client";

import { useRef, type HTMLAttributes, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

const TILT_X_DEG = 20;
const TILT_Y_DEG = 24;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * The pointer target of a holographic card. It writes the pointer position into CSS
 * custom properties once per frame; the tilt, foil, glitter and glare in globals.css
 * read them, so React never re-renders while the mouse moves.
 *
 * Touch input is ignored on purpose: a card that tilts while the page scrolls under a
 * finger reads as jitter. Touch screens get the automatic sweep instead.
 */
export function HoloSurface({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const frame = useRef(0);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const element = event.currentTarget;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = element.getBoundingClientRect();
      const x = clamp((clientX - box.left) / box.width);
      const y = clamp((clientY - box.top) / box.height);
      const style = element.style;
      style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      style.setProperty("--px", (x - 0.5).toFixed(3));
      style.setProperty("--py", (y - 0.5).toFixed(3));
      style.setProperty("--rx", `${((0.5 - y) * TILT_X_DEG).toFixed(2)}deg`);
      style.setProperty("--ry", `${((x - 0.5) * TILT_Y_DEG).toFixed(2)}deg`);
      style.setProperty("--o", "1");
      style.setProperty("--tt", "0.1s");
    });
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(frame.current);
    const style = event.currentTarget.style;
    style.setProperty("--rx", "0deg");
    style.setProperty("--ry", "0deg");
    style.setProperty("--px", "0");
    style.setProperty("--py", "0");
    style.setProperty("--o", "0");
    style.setProperty("--tt", "0.7s");
  };

  return (
    <div {...rest} className={cn("gd-holo", className)} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {children}
    </div>
  );
}

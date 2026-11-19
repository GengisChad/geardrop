"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

/**
 * The holographic card (owner, 2026-11-19): a new release leans under the pointer or the finger
 * like a rare trading card, with a glare that follows the hand and the foil on its rim. Only new
 * releases wear it, as with the foil sticker. The styles are in globals.css; this only says
 * where the hand is, straight on the element, so moving over a card renders nothing in React.
 *
 * A mouse tilts it on hover. A finger tilts it while it drags sideways; a vertical drag stays the
 * page's scroll. Reduced motion leaves the card flat.
 */
export function HoloTilt({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);

  const rest = () => {
    pressed.current = false;
    const element = ref.current;
    if (!element) return;
    delete element.dataset["live"];
    for (const name of ["--gd-mx", "--gd-my", "--gd-k"]) element.style.removeProperty(name);
  };

  const lean = (event: PointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (!element) return;
    if (event.pointerType !== "mouse" && !pressed.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = element.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) - 0.5;
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) - 0.5;
    element.dataset["live"] = "";
    element.style.setProperty("--gd-mx", x.toFixed(3));
    element.style.setProperty("--gd-my", y.toFixed(3));
    element.style.setProperty("--gd-k", "1");
  };

  return (
    <div
      ref={ref}
      className="gd-holo"
      data-testid="holo-tilt"
      onPointerDown={(event) => {
        pressed.current = true;
        lean(event);
      }}
      onPointerMove={lean}
      onPointerUp={rest}
      onPointerCancel={rest}
      onPointerLeave={rest}
    >
      <div className="gd-holo-card">
        {children}
        <span aria-hidden="true" className="gd-holo-glare" />
        <span aria-hidden="true" className="gd-holo-rim" />
      </div>
    </div>
  );
}

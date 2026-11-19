/**
 * The photo's flight into the cart (owner, 2026-11-19): a copy of the packshot the shopper tapped
 * beside leaves its place, arcs up to the header's cart and shrinks into it, and the cart answers
 * with its nudge. It runs once, in under half a second, beside the real add (which has already
 * happened), and reduced motion skips it.
 */
const FLIGHT_MS = 460;

/** The packshot that belongs to an add button: its own card's, or the product page's main photo. */
export function packshotNear(control: HTMLElement): HTMLImageElement | null {
  const card = control.closest<HTMLElement>("[data-testid='product-card'], article");
  return card?.querySelector<HTMLImageElement>("img") ?? document.querySelector<HTMLImageElement>("[data-testid='product-gallery'] img");
}

const visibleCart = () =>
  [...document.querySelectorAll<HTMLElement>("[data-testid='cart-link']")].find((link) => link.getBoundingClientRect().width > 0) ?? null;

/** Resolves when the photo has landed, or at once when there is nothing to fly. */
export function flyToCart(source: HTMLImageElement | null): Promise<void> {
  if (!source || typeof source.animate !== "function") return Promise.resolve();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();

  const from = source.getBoundingClientRect();
  const cart = visibleCart();
  const onScreen = from.width > 0 && from.bottom > 0 && from.top < window.innerHeight;
  if (!cart || !onScreen) return Promise.resolve();
  const to = cart.getBoundingClientRect();

  const shell = document.createElement("div");
  shell.setAttribute("aria-hidden", "true");
  shell.style.cssText = `position:fixed;z-index:120;pointer-events:none;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
  const copy = new Image();
  copy.alt = "";
  copy.src = source.currentSrc || source.src;
  copy.style.cssText = `box-sizing:border-box;width:100%;height:100%;object-fit:contain;padding:${getComputedStyle(source).padding};filter:drop-shadow(0 10px 12px rgba(0,0,0,0.6))`;
  shell.append(copy);
  document.body.append(shell);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  return new Promise((resolve) => {
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      shell.remove();
      cart.animate(
        [{ transform: "none" }, { transform: "translateX(3px) rotate(-6deg)", offset: 0.35 }, { transform: "translateX(-1px)", offset: 0.7 }, { transform: "none" }],
        { duration: 420, easing: "ease-out" },
      );
      resolve();
    };
    // Two axes with different easings draw the arc: sideways steadily, upwards after a short dip.
    shell.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], { duration: FLIGHT_MS, easing: "cubic-bezier(0.3, 0, 0.6, 1)", fill: "forwards" });
    copy
      .animate([{ transform: "translateY(0) scale(1) rotate(0deg)" }, { transform: `translateY(${dy}px) scale(0.14) rotate(-28deg)` }], {
        duration: FLIGHT_MS,
        easing: "cubic-bezier(0.5, -0.3, 0.8, 0.55)",
        fill: "forwards",
      })
      .finished.then(land, land);
    // A tab in the background does not run animations: the confirmation must still arrive.
    window.setTimeout(land, FLIGHT_MS + 300);
  });
}

/**
 * A 10 ms tick under the thumb for an action that landed (a piece in the cart, a favourite saved,
 * a quantity changed). Android phones vibrate; iOS Safari has no vibration API and stays silent.
 * Reduced motion keeps it still as well.
 */
export function hapticTick(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(10);
  } catch {
    // Browsers refuse a vibration before the first tap on the page; nothing to recover.
  }
}

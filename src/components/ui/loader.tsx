import { Emblem } from "@/components/layout/logo";
import { cn } from "@/lib/cn";

/**
 * Loading state. The emblem is the brand's repeatable mark and the design system draws
 * a spinning ring loader (sheet §14), so the emblem itself does the spinning.
 *
 * Note: do not turn this into an app-root `loading.tsx`. That wraps every route in a
 * streaming Suspense boundary, so the 200 header is flushed before a page can call
 * `notFound()` — unknown products and categories would answer 200 with 404 content,
 * which is a soft 404 to a crawler.
 */
export function Loader({ label = "Caricamento…", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex min-h-[50vh] flex-col items-center justify-center gap-4", className)}
    >
      <Emblem size={56} className="size-14 animate-[gd-spin_1.1s_linear_infinite]" />
      <p className="gd-display text-small font-bold tracking-wider text-grey-600">{label}</p>
    </div>
  );
}

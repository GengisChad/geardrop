import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

/**
 * Shared frame for the four storefront auth pages. Keeps them on the same glass panel as
 * the rest of the storefront instead of inventing a second visual language for auth.
 */
export function AuthShell({
  title,
  intro,
  breadcrumb,
  children,
}: {
  readonly title: string;
  readonly intro: string;
  readonly breadcrumb: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: breadcrumb }]} className="mb-6" />

      <div className="mx-auto w-full max-w-md">
        <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">{title}</h1>
        <p className="mt-2 text-small text-grey-600">{intro}</p>

        <div className="gd-glass-panel mt-6 rounded-[--radius-glass] p-6 sm:p-7">{children}</div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Package, ShieldCheck, ShoppingCart } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logoutAction } from "@/app/auth/actions";
import { getStaffRole, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listMyOrders, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import type { AppHref } from "@/lib/routes";
import { ProfileForm, type ProfileDefaults } from "./profile-form";

export const metadata: Metadata = {
  title: "Account",
  description: "Il tuo account GEAR//DROP.",
  robots: { index: false, follow: false },
};

/** Per-visitor by definition: prerendering it would freeze one visitor's answer for all. */
export const dynamic = "force-dynamic";

const SHORTCUTS: readonly { label: string; hint: string; href: AppHref; Icon: typeof Heart }[] = [
  { label: "Preferiti", hint: "I prodotti che hai salvato", href: "/preferiti", Icon: Heart },
  { label: "Carrello", hint: "Riprendi da dove hai lasciato", href: "/carrello", Icon: ShoppingCart },
  { label: "Spedizioni", hint: "Tempi, costi e tracciamento", href: "/assistenza/spedizioni", Icon: Package },
];

const dateFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" });

/**
 * Profile defaults come from customer_profiles when the row exists, and otherwise from the
 * names captured at signup. The row itself is created the first time the customer saves:
 * signup happens before there is any authenticated database context to insert with.
 */
async function loadProfile(userId: string): Promise<ProfileDefaults> {
  if (!isSupabaseConfigured()) return { firstName: "", lastName: "", phone: "" };

  const supabase = await createClient();
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase.from("customer_profiles").select("first_name, last_name, phone").eq("user_id", userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const metadata = (auth.user?.user_metadata ?? {}) as { first_name?: string; last_name?: string };

  return {
    firstName: profile?.first_name || metadata.first_name || "",
    lastName: profile?.last_name || metadata.last_name || "",
    phone: profile?.phone ?? "",
  };
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [profile, orders, staffRole] = await Promise.all([loadProfile(user.id), listMyOrders(user.id), getStaffRole()]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Account" }]} className="mb-6" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">Account</h1>
          <p className="mt-1 text-small text-grey-600">{user.email}</p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="text" size="sm">
            Esci
          </Button>
        </form>
      </div>

      {staffRole ? (
        <Link
          href="/admin"
          className="mt-6 flex items-start gap-3 rounded-[--radius-card] border border-violet/30 bg-violet-tint p-5"
        >
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-violet" aria-hidden="true" />
          <span>
            <span className="gd-display block text-small font-bold tracking-wider text-graphite">Back-office</span>
            <span className="block text-small text-grey-600">
              Il tuo ruolo è <strong>{staffRole}</strong>. Apri la gestione di ordini, catalogo e magazzino.
            </span>
          </span>
        </Link>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <section className="gd-glass-card rounded-[--radius-glass] p-6">
          <h2 className="gd-display text-small font-bold tracking-wider text-graphite">I tuoi dati</h2>
          <p className="mt-1 mb-5 text-[0.6875rem] text-grey-600">
            Usati per precompilare il checkout. L&apos;email di accesso si cambia dal supporto.
          </p>
          <ProfileForm defaults={profile} />
        </section>

        <section>
          <h2 className="gd-display text-small font-bold tracking-wider text-graphite">I tuoi ordini</h2>

          {orders.length === 0 ? (
            <EmptyState
              className="mt-4"
              title="Nessun ordine"
              message="Quando completi un ordine da questo account lo trovi qui, con stato e totale."
              href="/negozio"
            />
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {orders.map((order) => (
                <li key={order.id} className="gd-glass-card rounded-[--radius-glass] p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="gd-display text-small font-bold tracking-wider text-graphite">
                      {order.orderNumber}
                    </span>
                    <span className="text-[0.6875rem] text-grey-600">
                      {dateFormatter.format(new Date(order.createdAt))}
                    </span>
                  </div>

                  <p className="mt-1 text-[0.6875rem] text-grey-600">
                    {ORDER_STATUS_LABELS[order.status]} · {PAYMENT_STATUS_LABELS[order.paymentStatus]} ·{" "}
                    {order.shippingMethodLabel}
                  </p>

                  <ul className="mt-3 flex flex-col gap-1 text-small text-graphite">
                    {order.items.map((item) => (
                      <li key={item.sku} className="flex justify-between gap-4">
                        <span>
                          {item.quantity}× {item.name}
                        </span>
                        <span className="tabular-nums">
                          {formatPrice({ amount: item.lineTotalCents, currency: "EUR" })}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-3 flex justify-between border-t border-grey-200 pt-3 text-small font-bold text-graphite">
                    <span>Totale</span>
                    <span className="tabular-nums">{formatPrice({ amount: order.totalCents, currency: "EUR" })}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}

          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {SHORTCUTS.map(({ label, hint, href, Icon }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="gd-glass-card gd-glass-interactive group flex h-full items-start gap-3 rounded-[--radius-glass] p-5"
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-tint">
                    <Icon className="size-4.5 text-violet" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="gd-display block text-small font-bold tracking-wider text-graphite">{label}</span>
                    <span className="block text-[0.6875rem] text-grey-600">{hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

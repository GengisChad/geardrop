import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, LogOut, MapPin, Package, ShoppingCart } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ProfileForm } from "@/components/auth/profile-form";
import { getCustomerSession } from "@/lib/auth/customer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppHref } from "@/lib/routes";
import { logoutAction } from "./auth-actions";

export const metadata: Metadata = {
  title: "Account",
  description: "Il tuo account GEAR//DROP.",
  robots: { index: false, follow: false },
};

// The session lives in cookies, so nothing here may be prerendered or cached.
export const dynamic = "force-dynamic";

const SHORTCUTS: readonly { label: string; hint: string; href: AppHref; Icon: typeof Heart }[] = [
  { label: "Preferiti", hint: "I prodotti che hai salvato", href: "/preferiti", Icon: Heart },
  { label: "Carrello", hint: "Riprendi da dove hai lasciato", href: "/carrello", Icon: ShoppingCart },
  { label: "Spedizioni", hint: "Tempi, costi e tracciamento", href: "/assistenza/spedizioni", Icon: Package },
];

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const DATE = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" });

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "In attesa",
  paid: "Pagato",
  processing: "In preparazione",
  shipped: "Spedito",
  delivered: "Consegnato",
  cancelled: "Annullato",
  refunded: "Rimborsato",
};

export default async function AccountPage() {
  const session = await getCustomerSession();

  if (!session) redirect("/login?next=/account");

  // Both reads are RLS-bound: orders_customer_read and customer_addresses_own_all return
  // this visitor's rows only, so no filter here is load-bearing for privacy.
  const client = await createSupabaseServerClient();
  const [{ data: orders }, { data: addresses }] = await Promise.all([
    client
      .from("orders")
      .select("id, order_number, status, total_cents, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    client.from("customer_addresses").select("id, label, line_one, postal_code, city, province").limit(5),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Account" }]} className="mb-6" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">Account</h1>
          <p className="mt-1 text-small text-grey-600" data-testid="account-email">
            {session.displayName ? `${session.displayName} · ` : ""}
            {session.email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {session.isStaff ? (
            <Link
              href="/admin"
              data-testid="account-admin-link"
              className="gd-display gd-glass-compact gd-glass-interactive inline-flex h-11 items-center rounded-2xl px-4 text-small font-bold tracking-wider text-graphite"
            >
              PANNELLO ADMIN
            </Link>
          ) : null}

          <form action={logoutAction}>
            <button
              type="submit"
              data-testid="logout-button"
              className="gd-display gd-glass-compact gd-glass-interactive inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-small font-bold tracking-wider text-graphite"
            >
              <LogOut className="size-4" aria-hidden="true" />
              ESCI
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="profilo" className="gd-glass-panel rounded-[--radius-glass] p-6">
          <h2 id="profilo" className="gd-display text-small font-bold tracking-wider text-graphite">
            I TUOI DATI
          </h2>
          <ProfileForm displayName={session.displayName ?? ""} />
        </section>

        <section aria-labelledby="ordini" className="gd-glass-panel rounded-[--radius-glass] p-6">
          <h2 id="ordini" className="gd-display text-small font-bold tracking-wider text-graphite">
            I TUOI ORDINI
          </h2>

          {orders && orders.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3" data-testid="order-list">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="gd-glass-card flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3"
                >
                  <span className="gd-display text-small font-bold text-graphite">{order.order_number}</span>
                  <span className="text-[0.6875rem] text-grey-600">{DATE.format(new Date(order.created_at))}</span>
                  <span className="text-[0.6875rem] text-grey-600">
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span className="text-small font-bold text-graphite">{EURO.format(order.total_cents / 100)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-small text-grey-600" data-testid="orders-empty">
              Non hai ancora ordini. Quando ne farai uno lo troverai qui, con stato e tracciamento.
            </p>
          )}

          <h3 className="gd-display mt-7 text-small font-bold tracking-wider text-graphite">I TUOI INDIRIZZI</h3>

          {addresses && addresses.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2" data-testid="address-list">
              {addresses.map((address) => (
                <li key={address.id} className="flex items-center gap-2 text-small text-grey-600">
                  <MapPin className="size-4 shrink-0 text-violet" aria-hidden="true" />
                  <span>
                    <span className="font-bold text-graphite">{address.label}</span> · {address.line_one},{" "}
                    {address.postal_code} {address.city} ({address.province})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-small text-grey-600" data-testid="addresses-empty">
              Nessun indirizzo salvato. Lo aggiungerai al primo checkout.
            </p>
          )}
        </section>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
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
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/admin/control/control.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { customersFrom } from "@/lib/admin/control";
import { loadControlOrders } from "@/lib/admin/control-repository";
import { formatEuro } from "@/lib/admin/warehouse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" });

/**
 * "Clienti" (owner, 2026-11-18): every buyer from the paid orders, with what they spent net of
 * refunds. Owner and admin only, since it lists names and emails.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const raw = (await searchParams).q;
  const query = ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim().toLowerCase().slice(0, 80);

  const customers = customersFrom(await loadControlOrders(client, principal.organization.id));
  const shown = query ? customers.filter((customer) => customer.email.includes(query) || (customer.name ?? "").toLowerCase().includes(query)) : customers;
  const returning = customers.filter((customer) => customer.orders > 1).length;
  const spent = customers.reduce((sum, customer) => sum + customer.spentCents, 0);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Ordini / Clienti</p>
          <h1>Clienti</h1>
          <span>
            {customers.length} clienti · {returning} tornati a comprare · {formatEuro(customers.length ? Math.round(spent / customers.length) : 0)} spesi in media
          </span>
        </div>
        <form className={styles.search} method="get">
          <input aria-label="Cerca cliente" defaultValue={query} name="q" placeholder="Nome o email" type="search" />
          <button type="submit">Cerca</button>
        </form>
      </header>
      <p className={styles.intro}>
        Un cliente per email, dagli ordini pagati. La spesa è al netto dei rimborsi. I dati restano nel pannello: per scrivere a un
        cliente usa &ldquo;Scrivi al cliente&rdquo; nella scheda dell&rsquo;ordine.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th className={styles.num}>Ordini</th>
              <th className={styles.num}>Spesa</th>
              <th>Primo ordine</th>
              <th>Ultimo ordine</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((customer) => (
              <tr data-testid="customer-row" key={customer.email}>
                <td>
                  {customer.name ?? "—"}
                  <small>{customer.email}</small>
                </td>
                <td className={styles.num}>{customer.orders}</td>
                <td className={styles.num}>{formatEuro(customer.spentCents)}</td>
                <td>{date.format(new Date(customer.firstOrderAt))}</td>
                <td>
                  <Link href={`/admin/ordini/${customer.lastOrderId}`}>{date.format(new Date(customer.lastOrderAt))}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

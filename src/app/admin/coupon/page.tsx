import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toggleCouponAction, upsertCouponAction } from "@/app/admin/actions";
import { AdminField, AdminForm, adminControlClass } from "@/components/admin/admin-form";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Coupon" };

/**
 * Coupons are never readable by the storefront: they have no anon policy at all, and their
 * validity is decided inside create_order's transaction. This page is the only place they
 * are visible.
 */
export default async function AdminCouponsPage() {
  if (!(await getStaffSession("admin"))) notFound();

  const supabase = await createClient();
  const { data: coupons, error } = await supabase
    .from("coupons")
    .select("id, code, discount_kind, discount_value, min_subtotal_cents, max_redemptions, redemption_count, active")
    .order("code");

  if (error) throw new Error(`Lettura coupon fallita: ${error.message}`);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <section className="gd-glass-card h-fit rounded-[--radius-glass] p-5">
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Nuovo coupon</h2>
        <p className="mt-1 mb-4 text-[0.6875rem] text-grey-600">
          Un codice già esistente viene aggiornato. Gli importi sono in centesimi.
        </p>

        <AdminForm action={upsertCouponAction} submitLabel="Salva coupon" variant="primary">
          <AdminField label="Codice">
            <input name="code" required maxLength={32} className={adminControlClass} placeholder="DROP10" />
          </AdminField>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Tipo">
              <select name="discountKind" defaultValue="percentage" className={adminControlClass}>
                <option value="percentage">Percentuale</option>
                <option value="fixed">Importo fisso</option>
              </select>
            </AdminField>
            <AdminField label="Valore">
              <input name="discountValue" type="number" min={1} required className={adminControlClass} />
            </AdminField>
            <AdminField label="Subtotale minimo">
              <input name="minSubtotalCents" type="number" min={0} className={adminControlClass} />
            </AdminField>
            <AdminField label="Usi massimi">
              <input name="maxRedemptions" type="number" min={1} className={adminControlClass} />
            </AdminField>
          </div>
          <label className="flex items-center gap-2 text-small text-graphite">
            <input type="checkbox" name="active" defaultChecked className="size-4" />
            Attivo
          </label>
        </AdminForm>
      </section>

      <section>
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Coupon esistenti</h2>

        {coupons?.length ? (
          <ul className="mt-3 flex flex-col gap-2">
            {coupons.map((coupon) => (
              <li
                key={coupon.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[--radius-card] border border-grey-200 px-4 py-3"
              >
                <div>
                  <p className="gd-display text-small font-bold tracking-wider text-graphite">{coupon.code}</p>
                  <p className="text-[0.6875rem] text-grey-600">
                    {coupon.discount_kind === "percentage"
                      ? `−${coupon.discount_value}%`
                      : `−${formatPrice({ amount: coupon.discount_value, currency: "EUR" })}`}
                    {coupon.min_subtotal_cents
                      ? ` · min ${formatPrice({ amount: coupon.min_subtotal_cents, currency: "EUR" })}`
                      : ""}
                    {" · "}
                    {coupon.redemption_count}
                    {coupon.max_redemptions ? `/${coupon.max_redemptions}` : ""} usi
                    {coupon.active ? "" : " · disattivato"}
                  </p>
                </div>

                <AdminForm
                  action={toggleCouponAction}
                  submitLabel={coupon.active ? "Disattiva" : "Attiva"}
                  className="items-end"
                >
                  <input type="hidden" name="couponId" value={coupon.id} />
                  <input type="hidden" name="active" value={coupon.active ? "false" : "true"} />
                </AdminForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-small text-grey-600">Nessun coupon.</p>
        )}
      </section>
    </div>
  );
}

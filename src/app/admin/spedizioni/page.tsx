import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { updateStoreSettingsAction, upsertShippingMethodAction } from "@/app/admin/actions";
import { AdminField, AdminForm, adminControlClass } from "@/components/admin/admin-form";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Spedizioni e vendite" };

export default async function AdminShippingPage() {
  if (!(await getStaffSession("admin"))) notFound();

  const supabase = await createClient();
  const [{ data: methods, error: methodsError }, { data: settings }] = await Promise.all([
    supabase
      .from("shipping_methods")
      .select("code, label, delivery_hint, price_cents, free_shipping_threshold_cents, active")
      .order("sort_order"),
    supabase.from("store_settings").select("checkout_enabled, max_quantity_per_line").eq("id", 1).maybeSingle(),
  ]);

  if (methodsError) throw new Error(`Lettura spedizioni fallita: ${methodsError.message}`);

  return (
    <div className="flex flex-col gap-10">
      <section className="gd-glass-card rounded-[--radius-glass] p-5">
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Vendite</h2>
        <p className="mt-1 mb-4 max-w-prose text-[0.6875rem] text-grey-600">
          Questo interruttore è letto dentro la transazione d&apos;ordine: a vendite chiuse nessun ordine può essere
          creato, nemmeno da una richiesta costruita a mano. Aprile solo quando il magazzino è caricato davvero.
        </p>

        <AdminForm action={updateStoreSettingsAction} submitLabel="Salva impostazioni" variant="primary">
          <label className="flex items-center gap-2 text-small text-graphite">
            <input
              type="checkbox"
              name="checkoutEnabled"
              defaultChecked={settings?.checkout_enabled ?? false}
              className="size-4"
            />
            Vendite aperte
          </label>
          <AdminField label="Quantità massima per riga">
            <input
              name="maxQuantityPerLine"
              type="number"
              min={1}
              max={100}
              defaultValue={settings?.max_quantity_per_line ?? 10}
              className={adminControlClass}
            />
          </AdminField>
        </AdminForm>
      </section>

      <section>
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Metodi di spedizione</h2>
        <p className="mt-1 text-[0.6875rem] text-grey-600">
          Il prezzo applicato all&apos;ordine è sempre quello salvato qui, non quello inviato dal browser.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {(methods ?? []).map((method) => (
            <li key={method.code} className="gd-glass-card rounded-[--radius-glass] p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="gd-display text-small font-bold tracking-wider text-graphite">{method.label}</span>
                <span className="text-[0.6875rem] text-grey-600">
                  {method.code} · {formatPrice({ amount: method.price_cents, currency: "EUR" })}
                  {method.free_shipping_threshold_cents !== null
                    ? ` · gratis da ${formatPrice({ amount: method.free_shipping_threshold_cents, currency: "EUR" })}`
                    : ""}
                  {method.active ? "" : " · disattivato"}
                </span>
              </div>

              <AdminForm action={upsertShippingMethodAction} submitLabel="Salva" className="mt-4">
                <input type="hidden" name="code" value={method.code} />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <AdminField label="Etichetta">
                    <input name="label" defaultValue={method.label} required className={adminControlClass} />
                  </AdminField>
                  <AdminField label="Tempi">
                    <input name="deliveryHint" defaultValue={method.delivery_hint} className={adminControlClass} />
                  </AdminField>
                  <AdminField label="Prezzo (centesimi)">
                    <input
                      name="priceCents"
                      type="number"
                      min={0}
                      defaultValue={method.price_cents}
                      className={adminControlClass}
                    />
                  </AdminField>
                  <AdminField label="Soglia gratis (centesimi)">
                    <input
                      name="freeShippingThresholdCents"
                      type="number"
                      min={0}
                      defaultValue={method.free_shipping_threshold_cents ?? ""}
                      className={adminControlClass}
                    />
                  </AdminField>
                </div>
                <label className="flex items-center gap-2 text-small text-graphite">
                  <input type="checkbox" name="active" defaultChecked={method.active} className="size-4" />
                  Attivo
                </label>
              </AdminForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

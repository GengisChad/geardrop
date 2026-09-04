import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaffSession, hasAtLeast } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { adjustStockAction, updateProductAction } from "@/app/admin/actions";
import { AdminField, AdminForm, adminControlClass } from "@/components/admin/admin-form";

export const metadata: Metadata = { title: "Catalogo" };

const PUBLICATION = [
  { value: "draft", label: "Bozza" },
  { value: "published", label: "Pubblicato" },
  { value: "archived", label: "Archiviato" },
] as const;

const STOCK_STATUS = [
  { value: "disponibile", label: "Disponibile" },
  { value: "in-arrivo", label: "In arrivo" },
  { value: "pre-ordine", label: "Pre-ordine" },
  { value: "esaurito", label: "Esaurito" },
] as const;

/**
 * One row per product: content on the left (editor and up), stock on the right (admin and
 * up). Prices are edited in cents — the same unit the database stores — so nothing is lost
 * to a decimal round-trip.
 */
export default async function AdminCatalogPage() {
  const session = await getStaffSession("editor");
  if (!session) notFound();

  const canManageStock = hasAtLeast(session.role, "admin");

  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, sku, name, price_cents, publication_status, active, stock_status, stock_quantity, categories (name)")
    .order("name");

  if (error) throw new Error(`Lettura catalogo fallita: ${error.message}`);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-grey-600">
        {products?.length ?? 0} prodotti. Le modifiche sono immediate: un prodotto in bozza o non attivo sparisce dal
        negozio.
      </p>

      <ul className="flex flex-col gap-3">
        {(products ?? []).map((product) => (
          <li key={product.id} className="gd-glass-card rounded-[--radius-glass] p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="gd-display text-small font-bold tracking-wider text-graphite">{product.name}</span>
              <span className="text-[0.6875rem] text-grey-600">
                {product.sku} · {(product.categories as unknown as { name: string } | null)?.name ?? "—"} ·{" "}
                {product.stock_quantity} pz
              </span>
            </div>

            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <AdminForm action={updateProductAction} submitLabel="Salva prodotto">
                <input type="hidden" name="productId" value={product.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField label="Pubblicazione">
                    <select name="publicationStatus" defaultValue={product.publication_status} className={adminControlClass}>
                      {PUBLICATION.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Disponibilità mostrata">
                    <select name="stockStatus" defaultValue={product.stock_status} className={adminControlClass}>
                      {STOCK_STATUS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Prezzo (centesimi)">
                    <input
                      name="priceCents"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={product.price_cents}
                      className={adminControlClass}
                    />
                  </AdminField>
                  <label className="mt-6 flex items-center gap-2 text-small text-graphite">
                    <input type="checkbox" name="active" defaultChecked={product.active} className="size-4" />
                    Attivo
                  </label>
                </div>
              </AdminForm>

              {canManageStock ? (
                <AdminForm action={adjustStockAction} submitLabel="Applica movimento">
                  <input type="hidden" name="productId" value={product.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AdminField label="Variazione pezzi">
                      <input name="delta" type="number" step={1} defaultValue={0} className={adminControlClass} />
                    </AdminField>
                    <AdminField label="Causale">
                      <select name="reason" defaultValue="restock" className={adminControlClass}>
                        <option value="restock">Rifornimento</option>
                        <option value="adjustment">Rettifica</option>
                        <option value="return">Reso</option>
                      </select>
                    </AdminField>
                    <AdminField label="Nota (facoltativa)">
                      <input name="note" maxLength={200} className={adminControlClass} />
                    </AdminField>
                  </div>
                </AdminForm>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

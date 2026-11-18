import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import styles from "@/components/admin/barcodes/barcodes.module.css";
import { PrintButton } from "@/components/admin/fulfillment/station-controls";
import { requireAdminAccess } from "@/lib/admin/access";
import { parseLabelRequests } from "@/lib/admin/barcodes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * The SKU labels to print: name, SKU in clear and as a QR code (what the parcel check reads), and
 * the box barcode in digits when it is known. No price on purpose: a printed price goes stale.
 */
export default async function ProductLabelsPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const entries = Object.entries(params).flatMap(([key, value]) => {
    const id = /^c-(\d+)$/.exec(key)?.[1];
    const copies = Array.isArray(value) ? value[0] : value;
    return id && copies ? [`${id}:${copies}`] : [];
  });
  const requests = parseLabelRequests(entries);

  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  if (requests.length === 0) redirect("/admin/inventario/codici");

  const { data, error } = await client
    .from("products")
    .select("id,name,sku,gtin")
    .eq("organization_id", principal.organization.id)
    .in("id", requests.map((request) => request.productId));
  if (error) throw new Error("Impossibile caricare i prodotti da etichettare");
  const byId = new Map((data ?? []).map((product) => [product.id, product]));

  const labels = await Promise.all(
    requests.flatMap((request) => {
      const product = byId.get(request.productId);
      if (!product) return [];
      return Array.from({ length: request.copies }, async (_, copy) => ({
        key: `${product.id}-${copy}`,
        product,
        // Our own content (the SKU), drawn by the qrcode library as SVG markup.
        qr: await QRCode.toString(product.sku, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
      }));
    }),
  );

  return (
    <div className={styles.page}>
      <div className={styles.printBar}>
        <PrintButton />
        <Link className={styles.secondary} href="/admin/inventario/codici">
          Torna ai codici
        </Link>
        <span className={styles.intro}>
          {labels.length} etichette su {Math.ceil(labels.length / 24)} fogli. Stampa al 100 %, senza margini.
        </span>
      </div>
      <div className={styles.sheet} data-testid="label-sheet">
        {labels.map((label) => (
          <div className={styles.label} key={label.key}>
            <div className={styles.qr} dangerouslySetInnerHTML={{ __html: label.qr }} />
            <div className={styles.labelText}>
              <strong>{label.product.name}</strong>
              <code>{label.product.sku}</code>
              {label.product.gtin ? <span>EAN {label.product.gtin}</span> : null}
              <span>GEAR//DROP</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

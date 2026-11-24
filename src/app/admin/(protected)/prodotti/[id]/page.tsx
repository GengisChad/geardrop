import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductEditorForm, type ShopDetails } from "@/components/admin/products/product-editor-form";
import { PRODUCTS } from "@/data/catalog";
import { ProductCostPanel } from "@/components/admin/warehouse/product-cost-panel";
import styles from "@/components/admin/products/products.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadAdminProductEditor, loadProductDeletionImpact } from "@/lib/admin/product-repository";
import { productIdSchema } from "@/lib/admin/products";
import { loadProductCost } from "@/lib/admin/warehouse-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The details the shop's page prints for this slug, when the shop sells it from its catalogue.
 * Packs are left out: their page is composed from their pieces, not from the sheet.
 */
function shopDetails(slug: string): ShopDetails | null {
  const product = PRODUCTS.find((candidate) => candidate.slug === slug);
  return product ? { specs: product.specs, features: product.features, boxContents: product.boxContents } : null;
}

export default async function EditAdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = productIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  const data = await loadAdminProductEditor(client, principal.organization.id, parsedId.data);
  if (!data) notFound();
  const isManager = principal.role === "owner" || principal.role === "admin";
  const [deletionImpact, cost] = isManager
    ? await Promise.all([
        loadProductDeletionImpact(client, parsedId.data),
        loadProductCost(client, principal.organization.id, parsedId.data),
      ])
    : [null, null];
  return <div className={styles.productsPage}><header className={styles.heading}><div><p>Catalogo / {data.product.sku}</p><h1>{data.product.name}</h1><span>{data.product.publication_status} · {data.product.stock_status} · stock reale {data.product.stock_quantity}</span></div><Link href="/admin/prodotti">Torna ai prodotti</Link></header><ProductEditorForm categories={data.categories} costGuard={cost ? { averageCostCents: cost.averageCostCents, vatRateBp: cost.vatRateBp } : null} data={data} deletionImpact={deletionImpact} role={principal.role} shop={shopDetails(data.product.slug)} />{cost ? <ProductCostPanel canSetCost={principal.role === "owner"} cost={cost} priceCents={data.product.price_cents} productId={data.product.id} /> : null}</div>;
}

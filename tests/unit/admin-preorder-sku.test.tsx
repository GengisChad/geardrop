import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductEditorForm } from "@/components/admin/products/product-editor-form";
import { saveProductAction } from "@/app/admin/actions/products";
import { adjustInventoryAction } from "@/app/admin/actions/inventory";
import type { AdminProductEditorData } from "@/lib/admin/product-repository";

const boundary = vi.hoisted(() => ({
  update: vi.fn(), eq: vi.fn(), rpc: vi.fn(), from: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// CSS presentation is outside this form-validation test; avoid invoking PostCSS in Node.
vi.mock("@/components/admin/products/products.module.css", () => ({ default: {} }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "owner" }),
  requireStaffRole: vi.fn().mockResolvedValue({ role: "owner", userId: "owner" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => boundary }));

const data: AdminProductEditorData = {
  product: {
    id: 1, category_id: 1, slug: "cobalt-dragoon-2-60c", sku: "COBALT-DRAGOON-2-60C",
    name: "Cobalt Dragoon 2-60C", short_name: null, tagline: "Attacco left-spin.",
    description: "Starter con lanciatore a corda.", price_cents: 2550, compare_at_price_cents: null,
    currency: "EUR", publication_status: "published", active: true, blade_type: "attacco",
    stock_quantity: 0, manage_stock: true, low_stock_threshold: 5, allow_backorder: false,
    availability_override: "preorder", preorder_allocation: 10, preorder_release_date: null,
    stock_status: "pre-ordine", is_purchasable: true, is_low_stock: true, rating: 0,
    review_count: 0, seo_title: null, seo_description: null, sort_order: 0,
    created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
  },
  categories: [], images: [], specs: [], features: [], boxContents: [], tags: [],
  relations: [], relationCandidates: [], readyMedia: [],
};

function editForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id: "1", name: "Cobalt Dragoon aggiornato", slug: "cobalt-dragoon-2-60c",
    sku: "COBALT-DRAGOON-2-60C", categoryId: "1", tagline: "Attacco left-spin.",
    description: "Starter con lanciatore a corda.", priceCents: "2550", publicationStatus: "published",
    active: "true", bladeType: "attacco", manageStock: "on", lowStockThreshold: "5",
    availabilityOverride: "preorder", preorderAllocation: "10", preorderWarningConfirmed: "on",
    sortOrder: "0",
  })) form.set(key, value);
  return form;
}

describe("seeded uppercase SKU admin operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.from.mockReturnValue(boundary);
    boundary.update.mockReturnValue(boundary);
    boundary.eq.mockResolvedValue({ error: null });
    boundary.rpc.mockResolvedValue({ data: 5, error: null });
  });

  it("allows the displayed seeded SKU through the editor HTML constraint without allowing uppercase slugs", () => {
    const html = renderToStaticMarkup(<ProductEditorForm data={data} categories={[]} deletionImpact={null} role="owner" />);
    for (const [name, valid, invalid] of [
      ["sku", "COBALT-DRAGOON-2-60C", "COBALT DRAGOON"],
      ["slug", "cobalt-dragoon-2-60c", "COBALT-DRAGOON-2-60C"],
    ]) {
      const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
      const pattern = input.match(/pattern="([^"]+)"/)?.[1];
      expect(pattern).toBeDefined();
      expect(new RegExp(`^(?:${pattern})$`, "v").test(valid!)).toBe(true);
      expect(new RegExp(`^(?:${pattern})$`, "v").test(invalid!)).toBe(false);
    }
  });

  it("saves an edited seeded product retaining its uppercase SKU", async () => {
    expect(await saveProductAction({ ok: false, message: "" }, editForm())).toEqual({ ok: true, message: "Prodotto salvato." });
    expect(boundary.from).toHaveBeenCalledWith("products");
    expect(boundary.update).toHaveBeenCalledWith(expect.objectContaining({ sku: "COBALT-DRAGOON-2-60C", name: "Cobalt Dragoon aggiornato" }));
    expect(boundary.eq).toHaveBeenCalledWith("id", 1);
  });

  it("submits an inventory adjustment with the displayed SKU unchanged", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ sku: "COBALT-DRAGOON-2-60C", delta: "5", reason: "manual_adjustment", note: "Conteggio scaffale" })) form.set(key, value);
    expect(await adjustInventoryAction({ ok: false, message: "" }, form)).toEqual({ ok: true, message: "Movimento registrato. Stock attuale: 5.", newStock: 5 });
    expect(boundary.rpc).toHaveBeenCalledWith("adjust_inventory", { p_sku: "COBALT-DRAGOON-2-60C", p_delta: 5, p_reason: "manual_adjustment", p_note: "Conteggio scaffale" });
  });

  it("still rejects uppercase public slugs before a database write", async () => {
    const form = editForm();
    form.set("slug", "COBALT-DRAGOON-2-60C");
    expect((await saveProductAction({ ok: false, message: "" }, form)).ok).toBe(false);
    expect(boundary.update).not.toHaveBeenCalled();
  });
});

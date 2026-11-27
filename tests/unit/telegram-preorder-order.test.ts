/**
 * Owner, 2026-11-27: a Telegram pre-order paid with PayPal.me becomes an order of the shop, like one
 * paid on Stripe. These are the pieces the TypeScript side owns: the buyer's confirmation email, and
 * the migration that records the order.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { customerOrderEmail } from "@/lib/orders/order-email";
import { paidCheckoutFromPreorder } from "@/lib/telegram/preorder-order";
import type { Preorder } from "@/lib/telegram/preorders";

const paid: Preorder = {
  id: 12,
  code: "GDT-7K3Q9A",
  chatId: "444555666",
  username: "blader_mario",
  slug: "bx-09-beybattle-pass",
  productName: "BX-09 Beybattle Pass",
  quantity: 1,
  unitCents: 8000,
  shippingCents: 490,
  totalCents: 8490,
  buyerName: "Mario Rossi",
  email: "mario@example.it",
  phone: "+393331234567",
  locker: { id: "IT_ITROM01M", label: "ROM01 · Via Marsala 29, 00185 Roma" },
  lockerOptions: [],
  status: "paid",
  step: "confirm",
  expiresAt: null,
  orderId: null,
};

describe("the confirmation email of a PayPal.me pre-order", () => {
  const checkout = paidCheckoutFromPreorder(paid, "GD-T7K3Q9A", new Date("2026-11-27T10:00:00.000Z"));

  it("is written from what the buyer paid in the bot, to the Locker he chose", () => {
    expect(checkout).toMatchObject({
      reference: "GD-T7K3Q9A",
      email: "mario@example.it",
      lines: [{ slug: "bx-09-beybattle-pass", name: "BX-09 Beybattle Pass", quantity: 1, unitPriceCents: 8000 }],
      shippingCents: 490,
      totalCents: 8490,
      discountCents: 0,
      shipping: { name: "Mario Rossi", method: "inpost-locker", methodLabel: "InPost · Locker", pickupPoint: paid.locker!.label, pickupPointId: "IT_ITROM01M" },
    });
  });

  it("says the order number, the pre-order's wait and the Locker", () => {
    const email = customerOrderEmail(checkout, { id: 77, orderNumber: "GD-T7K3Q9A", preorderQuantities: [1] });
    expect(email.subject).toBe("Ordine GD-T7K3Q9A confermato · GEAR//DROP");
    expect(email.text).toContain("GD-T7K3Q9A");
    expect(email.text).toContain("BX-09 Beybattle Pass");
    expect(email.text).toContain("PRE-ORDINE");
    expect(email.text).toContain("Punto InPost: ROM01 · Via Marsala 29, 00185 Roma");
    expect(email.text).toContain("84,90");
  });
});

describe("the migration that records the order", () => {
  const sql = readFileSync("supabase/migrations/20261127130000_telegram_preorder_orders.sql", "utf8");

  it("records a paid Locker order with the pre-ordered line, and takes nothing off the count again", () => {
    expect(sql).toContain("'confirmed'::public.order_status, 'paid'::public.payment_status");
    expect(sql).toContain("'method', 'inpost-locker'");
    expect(sql).toContain("'pickupPointId', pre.locker ->> 'id'");
    expect(sql).toContain("'preorder', pre.quantity");
    expect(sql).not.toMatch(/update public\.products/);
  });

  it("is one order per reservation, and only the server runs it", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('telegram-preorder:' || p_preorder_id))");
    expect(sql).toContain("if pre.order_id is not null then");
    expect(sql).toContain("revoke all on function public.record_telegram_preorder_order(bigint) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.record_telegram_preorder_order(bigint) to service_role;");
  });
});

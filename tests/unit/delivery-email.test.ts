import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deliverOrderSchema } from "@/lib/admin/orders";
import { deliveryConfirmationEmail, RETURN_WINDOW_DAYS } from "@/lib/orders/delivery-email";

const order = {
  orderNumber: "GD-FL3NHC8W",
  email: "cliente@example.com",
  carrier: "Poste Italiane",
  trackingCode: "RR123456789IT",
  trackingUrl: null,
  shippingAddress: { name: "mario rossi", address: "Via Roma 1", postalCode: "34148", city: "Trieste", province: "TS", country: "IT", phone: "3331234567" },
  items: [
    { name: "Glory Valkerion LF", quantity: 1 },
    { name: "Duo Shatter Horus + Hurricane Enlil", quantity: 2 },
  ],
};

describe("delivery confirmation email", () => {
  it("confirms the arrival, lists the parcel and says how long the buyer has to change their mind", () => {
    const email = deliveryConfirmationEmail(order);
    expect(email.to).toBe("cliente@example.com");
    expect(email.subject).toBe("Il tuo ordine GD-FL3NHC8W è arrivato · GEAR//DROP");
    for (const part of [
      "Ciao Mario,",
      "risulta consegnato",
      "Poste Italiane",
      "1 × Glory Valkerion LF",
      "2 × Duo Shatter Horus + Hurricane Enlil",
      `${RETURN_WINDOW_DAYS} giorni dalla consegna`,
      "geardropshop.it/assistenza/resi",
      "geardropshop.it/ordine",
      "infogeardrop@gmail.com",
    ]) {
      expect(email.html).toContain(part);
    }
    expect(email.text).toContain("Ciao Mario, il tuo ordine GD-FL3NHC8W risulta consegnato.");
  });

  it("matches the return window the Resi e rimborsi page promises", () => {
    const pages = readFileSync(join(process.cwd(), "src/data/pages.ts"), "utf8");
    expect(pages).toContain(`${RETURN_WINDOW_DAYS} giorni dalla consegna`);
  });

  it("keeps the buyer's phone out of the email and escapes stored text", () => {
    const email = deliveryConfirmationEmail({ ...order, shippingAddress: { name: "<b>X</b>" }, items: [{ name: "<script>", quantity: 1 }] });
    expect(email.html).not.toContain("3331234567");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>X</b>");
  });

  it("offers the tracking link only while there is one to offer", () => {
    expect(deliveryConfirmationEmail(order).html).toContain("segui la spedizione");
    const untracked = deliveryConfirmationEmail({ ...order, carrier: null, trackingCode: null, trackingUrl: null });
    expect(untracked.html).not.toContain("segui la spedizione");
    expect(untracked.html).toContain("risulta consegnato");
  });
});

describe("deliver order form", () => {
  it("takes an optional note and a notify flag", () => {
    expect(deliverOrderSchema.safeParse({ orderId: "4", note: "", notify: true }).success).toBe(true);
    expect(deliverOrderSchema.parse({ orderId: "4", note: "  ", notify: false }).note).toBeNull();
    expect(deliverOrderSchema.safeParse({ orderId: "0", note: "", notify: true }).success).toBe(false);
  });
});

describe("deliver order migration", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261004100000_confirm_delivery_to_customers.sql"), "utf8");

  it("is for managers only and is safe to run twice", () => {
    expect(migration).toContain("GD_ORDER_MANAGER_REQUIRED");
    expect(migration).toMatch(/grant execute on function public\.complete_order\([^)]*\) to authenticated;/);
    expect(migration).toMatch(/revoke all on function public\.complete_order\([^)]*\) from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/grant execute on function public\.mark_order_delivery_notified\(bigint\) to authenticated;/);
    // A second confirmation keeps the first delivery date and adds no second status event.
    expect(migration).toContain("delivered_at = coalesce(delivered_at, now())");
    expect(migration).toContain("if current_status <> 'completed' then");
  });
});

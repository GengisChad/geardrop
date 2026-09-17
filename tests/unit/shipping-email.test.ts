import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shipOrderSchema } from "@/lib/admin/orders";
import { CARRIERS, carrierById, carrierByLabel, trackingLink } from "@/lib/orders/carriers";
import { shippingNotificationEmail } from "@/lib/orders/shipping-email";

const order = {
  orderNumber: "GD-FL3NHC8W",
  email: "cliente@example.com",
  carrier: "Poste Italiane",
  trackingCode: "RR123456789IT",
  trackingUrl: null,
  shippingAddress: { name: "mario rossi", address: "Via Roma 1", postalCode: "34148", city: "Trieste", province: "TS", country: "IT", phone: "3331234567" },
  items: [
    { name: "Glory Valkerion LF", quantity: 1 },
    { name: "Duo Shatter Horus + Hurricane Enlil", quantity: 1 },
  ],
};

describe("couriers", () => {
  it("builds each courier's tracking link from the code", () => {
    for (const carrier of CARRIERS.filter((item) => item.trackingUrl)) {
      const url = carrier.trackingUrl!("AB 12/3");
      expect(url.startsWith("https://"), carrier.id).toBe(true);
      expect(url).toContain("AB%2012%2F3");
    }
    expect(carrierById("altro")?.trackingUrl).toBeNull();
    expect(carrierByLabel("poste italiane")?.id).toBe("poste");
  });

  it("prefers a pasted link and has none without a code", () => {
    expect(trackingLink("Altro", "X1", "https://track.example/X1")).toBe("https://track.example/X1");
    expect(trackingLink("Poste Italiane", null)).toBeNull();
    expect(trackingLink("Poste Italiane", "RR1")).toContain("RR1");
  });
});

describe("shipping email", () => {
  it("tells the buyer what shipped, how to follow it and where it is going", () => {
    const email = shippingNotificationEmail(order);
    expect(email.to).toBe("cliente@example.com");
    expect(email.subject).toBe("Il tuo ordine GD-FL3NHC8W è stato spedito · GEAR//DROP");
    for (const part of ["Ciao Mario,", "Poste Italiane", "RR123456789IT", "Segui il pacco", "1 × Glory Valkerion LF", "Via Roma 1", "34148 Trieste (TS)", "infogeardrop@gmail.com"]) {
      expect(email.html).toContain(part);
    }
    expect(email.text).toContain("Segui il pacco: https://");
    expect(email.html).not.toContain("3331234567");
  });

  it("still reads well without courier details and escapes stored text", () => {
    const email = shippingNotificationEmail({ ...order, carrier: null, trackingCode: null, shippingAddress: { name: "<b>X</b>" }, items: [{ name: "<script>", quantity: 1 }] });
    expect(email.html).toContain("Il pacco è stato affidato al corriere.");
    expect(email.html).not.toContain("Segui il pacco");
    expect(email.html).not.toContain("<script>");
  });
});

describe("ship order form", () => {
  it("accepts a courier with or without a code and refuses non-HTTPS links", () => {
    expect(shipOrderSchema.safeParse({ orderId: "4", carrierId: "poste", code: "", url: "", notify: true }).success).toBe(true);
    expect(shipOrderSchema.safeParse({ orderId: "4", carrierId: "altro", code: "X", url: "http://a.example", notify: false }).success).toBe(false);
  });
});

describe("ship order migration", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260917120000_ship_orders_and_notify_customers.sql"), "utf8");

  it("is for managers only and records the shipping once", () => {
    expect(migration).toContain("GD_ORDER_MANAGER_REQUIRED");
    expect(migration).toMatch(/grant execute on function public\.ship_order\([^)]*\) to authenticated;/);
    expect(migration).toMatch(/revoke all on function public\.ship_order\([^)]*\) from public, anon, authenticated, service_role;/);
    expect(migration).toContain("if current_status <> 'shipped' then");
  });
});

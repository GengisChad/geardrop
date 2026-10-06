import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shippingEmailDue } from "@/lib/orders/shipping-notice";

/**
 * The owner's rule (2026-10-06): a tracking code entered in the panel reaches the buyer at once,
 * so nobody has to write in to ask where the parcel is.
 */

const poste = { carrier: "Poste Italiane", code: "018207900244", url: null };

describe("the shipping email", () => {
  it("goes the first time an order ships, code or no code", () => {
    expect(shippingEmailDue({ carrier: null, code: null, url: null, notifiedAt: null }, poste)).toBe(true);
    expect(shippingEmailDue({ carrier: null, code: null, url: null, notifiedAt: null }, { ...poste, code: null })).toBe(true);
  });

  it("goes again when the buyer holds a wrong carrier, code or link", () => {
    const sent = { ...poste, notifiedAt: "2026-10-05T12:48:58Z" };
    expect(shippingEmailDue(sent, { ...poste, code: "018207900245" })).toBe(true);
    expect(shippingEmailDue(sent, { ...poste, carrier: "SDA" })).toBe(true);
    expect(shippingEmailDue(sent, { ...poste, url: "https://example.com/track" })).toBe(true);
    // A code entered later on an order first notified without one.
    expect(shippingEmailDue({ ...poste, code: null, notifiedAt: "2026-10-05T12:48:58Z" }, poste)).toBe(true);
  });

  it("stays quiet only when the save repeats what the buyer already has", () => {
    const sent = { ...poste, notifiedAt: "2026-10-05T12:48:58Z" };
    expect(shippingEmailDue(sent, poste)).toBe(false);
    expect(shippingEmailDue(sent, { ...poste, code: ` ${poste.code} `, url: "" })).toBe(false);
  });
});

describe("the order page", () => {
  const card = readFileSync(join(process.cwd(), "src/components/admin/orders/order-actions.tsx"), "utf8");
  const actions = readFileSync(join(process.cwd(), "src/app/admin/actions/orders.ts"), "utf8");

  it("has one place to enter a tracking code, and it cannot skip the email", () => {
    // The old "Tracking" card saved a code without telling anyone.
    expect(card).not.toContain("setOrderTrackingAction");
    expect(actions).not.toContain('rpc("set_order_tracking"');
    expect(card).not.toMatch(/name="notify" type="checkbox"\/> Invia l’email al cliente/);
    expect(actions).not.toContain("Ordine segnato come spedito. Nessuna email inviata.");
  });

  it("decides the email from what the buyer was last told", () => {
    expect(actions).toMatch(/shippingEmailDue\(/);
    expect(actions).toContain("shipping_notified_at");
  });
});

import { describe, expect, it } from "vitest";
import { button, callout, dataTable, EMAIL_COLORS, EMAIL_EMBLEM, emailShell, itemList } from "@/lib/email/template";
import { customerOrderEmail } from "@/lib/orders/order-email";
import { shippingNotificationEmail } from "@/lib/orders/shipping-email";
import type { PaidCheckout } from "@/lib/orders/stripe-order";

const checkout: PaidCheckout = {
  sessionId: "cs_test",
  paymentIntentId: "pi_test",
  reference: "GD-TEST1",
  email: "cliente@example.com",
  phone: null,
  shipping: { name: "Mario Rossi", address: "Via Roma 1", postalCode: "34148", city: "Trieste", province: "TS", country: "IT" },
  notes: null,
  lines: [{ slug: "glory-valkerion-lf", name: "Glory Valkerion LF", quantity: 1, unitPriceCents: 3000 }],
  shippingCents: 490,
  discountCents: 0,
  couponCode: null,
  totalCents: 3490,
  createdAt: "2026-11-28T10:00:00.000Z",
};

describe("email template", () => {
  it("frames every email on the void ground with the emblem, the live wordmark and the seller", () => {
    const html = emailShell("Titolo", "<p>corpo</p>");
    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toContain(`background:${EMAIL_COLORS.void}`);
    expect(html).toContain(`src="https://geardropshop.it${EMAIL_EMBLEM}"`);
    // The wordmark is text, so the brand reads with images off.
    expect(html).toMatch(/GEAR<span style="color:#c6ff00">\/\/<\/span><span style="color:#bba6ff">DROP<\/span>/);
    expect(html).toContain("P.IVA 18464231002");
    expect(html).toContain('href="https://t.me/geardropshop"');
  });

  it("keeps the shop links out of internal emails", () => {
    const html = emailShell("Nuovo ordine", "", { footer: "internal" });
    expect(html).toContain("Email operativa di GEAR//DROP.");
    expect(html).not.toContain("t.me/geardropshop");
    expect(html).toContain("P.IVA 18464231002");
  });

  it("colours the rail, the sticker and the button by meaning: lime now, violet on its way", () => {
    const now = emailShell("x", button("Acquista ora", "https://geardropshop.it/", "now"), { tone: "now", kicker: "Di nuovo disponibile" });
    expect(now).toContain(`bgcolor="${EMAIL_COLORS.lime}"`);
    expect(now).not.toContain(`bgcolor="${EMAIL_COLORS.violet}"`);
    const incoming = emailShell("x", "", { tone: "incoming", kicker: "Pre-ordine" });
    expect(incoming).toContain(`bgcolor="${EMAIL_COLORS.violet}"`);
    expect(incoming).not.toContain(`bgcolor="${EMAIL_COLORS.lime}"`);
  });

  it("escapes stored text in the title, sticker, preheader and blocks", () => {
    const html = emailShell("<b>t</b>", [itemList([{ name: "<script>", quantity: 1 }]), dataTable([["<i>", "<u>"]]), callout("ok", "alert", "<h1>")].join(""), {
      kicker: "<k>",
      preheader: "<p>",
    });
    for (const raw of ["<b>t</b>", "<script>", "<i>", "<u>", "<k>", "<h1>ok"]) expect(html).not.toContain(raw);
    expect(html).toContain("&#60;script&#62;");
  });

  it("gives the inbox a preheader and colours an order by whether it waits for stock", () => {
    const confirmation = customerOrderEmail(checkout, { id: 1, orderNumber: "GD-TEST1" });
    expect(confirmation.html).toContain("Pagamento ricevuto per GD-TEST1");
    expect(confirmation.html).toContain(`bgcolor="${EMAIL_COLORS.lime}"`);
    const withPreorder = customerOrderEmail(checkout, { id: 1, orderNumber: "GD-TEST1", preorderQuantities: [1] });
    expect(withPreorder.html).toContain(`bgcolor="${EMAIL_COLORS.violet}"`);
    expect(withPreorder.html).toContain("Pre-ordine GD-TEST1");
    const shipped = shippingNotificationEmail({ orderNumber: "GD-TEST1", email: "c@example.com", carrier: "InPost", trackingCode: "X1", trackingUrl: null, shippingAddress: {}, items: [] });
    expect(shipped.html).toContain("Il pacco è partito con InPost");
  });
});

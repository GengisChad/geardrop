import { describe, expect, it } from "vitest";
import { refundStripeSchema } from "@/lib/admin/orders";
import { refundNotificationEmail } from "@/lib/orders/refund-email";

const order = {
  orderNumber: "GD-ML6E4UEE",
  email: "cliente@example.com",
  shippingAddress: { name: "mario rossi", address: "Via Roma 1", postalCode: "00100", city: "Roma", province: "RM" },
  amountCents: 2500,
  refundedCents: 2500,
  totalCents: 7500,
  reason: "il terzo Suppress Superion era già esaurito quando hai pagato",
};

describe("refund email", () => {
  it("tells the buyer how much comes back, why, and that the rest of the order stands", () => {
    const email = refundNotificationEmail(order);
    expect(email.to).toBe("cliente@example.com");
    expect(email.subject).toBe("Rimborso di 25,00 € per il tuo ordine GD-ML6E4UEE · GEAR//DROP");
    expect(email.text).toContain("Ciao Mario, abbiamo rimborsato 25,00 € sul tuo ordine GD-ML6E4UEE.");
    // The owner's words reach the buyer as written, with no label in front.
    expect(email.text).toContain("\n\nil terzo Suppress Superion era già esaurito quando hai pagato\n");
    expect(email.text).not.toContain("Motivo:");
    expect(email.text).toContain("Il resto dell'ordine resta confermato");
    expect(email.text).toContain("5-10 giorni lavorativi");
    expect(email.html).toContain("<strong>25,00 €</strong>");
  });

  it("says the order is refunded in full when nothing is left to pay for", () => {
    const email = refundNotificationEmail({ ...order, amountCents: 5000, refundedCents: 7500 });
    expect(email.text).toContain("L'ordine è rimborsato per intero.");
    expect(email.text).not.toContain("resta confermato");
  });

  it("escapes what the owner types before it reaches the email", () => {
    const email = refundNotificationEmail({ ...order, reason: "<b>errore</b> & scuse" });
    expect(email.html).toContain("&#60;b&#62;errore&#60;/b&#62; &#38; scuse");
    expect(email.html).not.toContain("<b>errore</b>");
  });

  it("emails the buyer only when the owner leaves the box ticked", () => {
    const base = { orderId: 7, amountCents: 2500, reason: "pezzo esaurito", confirmed: true, restoreStock: false, attempt: "3b241101-e2bb-4255-8caf-4136c566a962" };
    expect(refundStripeSchema.parse(base).notifyCustomer).toBe(false);
    expect(refundStripeSchema.parse({ ...base, notifyCustomer: true }).notifyCustomer).toBe(true);
  });
});

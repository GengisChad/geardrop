import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { messageCustomerSchema } from "@/lib/admin/orders";
import { customerMessageEmail } from "@/lib/orders/customer-message-email";
import { availabilityLine } from "@/lib/holo";
import { isPurchasable, stockHint, stockLabel, STOCK_LABEL } from "@/lib/labels";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productDescription } from "@/lib/seo";

const drop = PRODUCTS.find((product) => product.releasePreorder)!;
const shelfProduct = PRODUCTS.find((product) => product.stock === "disponibile" && !product.releasePreorder)!;

describe("a drop that has sold its pieces", () => {
  const soldOut = { ...drop, stock: "esaurito" as const, availableQuantity: 0 };

  it("still reads as a pre-order, and never as a dead product", () => {
    expect(stockLabel(soldOut)).toBe("Pre-ordine esaurito");
    expect(availabilityLine(soldOut)).toBe("Pre-ordine esaurito");
    expect(stockHint(soldOut)).toBe("Pre-ordini chiusi: ti avvisiamo appena riaprono");
  });

  it("cannot be bought while it waits to reopen", () => {
    expect(isPurchasable(soldOut.stock)).toBe(false);
  });

  it("tells Google the same thing the page says", () => {
    expect(productDescription(soldOut)).toContain("pre-ordine esaurito");
    expect(productDescription(soldOut)).not.toContain(", esaurito.");
  });

  it("promises the reopening in the notice, before and after sending it", () => {
    const form = readFileSync(join(process.cwd(), "src/components/product/restock-form.tsx"), "utf8");
    expect(form).toContain("Avvisami quando riaprono i pre-ordini di ${name}");
    // The confirmation cannot say "torna disponibile" to someone waiting for a pre-order.
    expect(form).toContain('releasePreorder ? "Ti avvisiamo appena riaprono i pre-ordini." : state.message');
  });

  it("leaves every other product its own word", () => {
    const plainSoldOut = { ...shelfProduct, stock: "esaurito" as const };
    expect(stockLabel(plainSoldOut)).toBe(STOCK_LABEL.esaurito);
    expect(availabilityLine(plainSoldOut)).toBe("Esaurito");
    expect(stockHint(plainSoldOut)).toBe("Attualmente non disponibile");
    expect(stockLabel(drop)).toBe("Pre-ordine");
    expect(stockHint(drop)).toContain("uscita Hasbro");
  });
});

describe("writing to the buyer of an order", () => {
  const message = {
    orderNumber: "GD-ML6E4UEE",
    email: "cliente@example.com",
    shippingAddress: { name: "mario rossi", address: "Via Roma 1" },
    subject: "Suppress Superion è tornato disponibile",
    message: "Sono arrivati altri pezzi.\nSe lo vuoi ancora, uno è tuo.",
  };

  it("writes in the shop's voice, keeps the line breaks and names the order", () => {
    const email = customerMessageEmail(message);
    expect(email.to).toBe("cliente@example.com");
    expect(email.subject).toBe("Suppress Superion è tornato disponibile · ordine GD-ML6E4UEE");
    expect(email.text).toContain("Ciao Mario,");
    expect(email.text).toContain("Sono arrivati altri pezzi.\nSe lo vuoi ancora, uno è tuo.");
    expect(email.text).toContain("GD-ML6E4UEE");
    expect(email.html).toContain("white-space:pre-line");
  });

  it("escapes what the owner types", () => {
    const email = customerMessageEmail({ ...message, message: "<b>ciao</b> & buone battaglie" });
    expect(email.html).toContain("&#60;b&#62;ciao&#60;/b&#62; &#38; buone battaglie");
    expect(email.html).not.toContain("<b>ciao</b>");
  });

  it("sends the same words to the same order only once", () => {
    const action = readFileSync(join(process.cwd(), "src/app/admin/actions/orders.ts"), "utf8");
    const block = action.slice(action.indexOf("export async function messageCustomerAction"));
    // The key is built from the order and the words, so a double click cannot write twice.
    expect(block).toContain("idempotencyKey: `gd-order-message-${order.order_number}-${fingerprint}`");
    expect(block).toContain('createHash("sha256")');
  });

  it("asks for a subject, a message and the confirmation", () => {
    const base = { orderId: 25, subject: "Superion", message: "Sono arrivati altri pezzi.", confirmed: true };
    expect(messageCustomerSchema.safeParse(base).success).toBe(true);
    expect(messageCustomerSchema.safeParse({ ...base, confirmed: false }).success).toBe(false);
    expect(messageCustomerSchema.safeParse({ ...base, message: "corto" }).success).toBe(false);
    expect(messageCustomerSchema.safeParse({ ...base, subject: "" }).success).toBe(false);
  });
});

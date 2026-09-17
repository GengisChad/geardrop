import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { Providers } from "@/components/providers";

describe("sold-out call to action", () => {
  it("leads to the real availability-notice form instead of promising a notice", () => {
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(
        <Providers>
          <AddToCartButton slug="glory-valkerion-lf" name="Glory Valkerion LF" stock="esaurito" compact={compact} />
        </Providers>,
      );
      expect(html).toContain('href="/prodotto/glory-valkerion-lf#restock-form"');
      expect(html).toContain('data-testid="notify-me"');
      expect(html).not.toContain("Ti avviseremo");
    }
  });
});

describe("delivery promise on a pre-order page", () => {
  it("shows the pre-order time instead of the in-stock one", async () => {
    const { TrustBarLight } = await import("@/components/home/trust");
    const { PREORDER_DELIVERY, STANDARD_DELIVERY } = await import("@/lib/labels");
    const preorder = renderToStaticMarkup(<TrustBarLight delivery={PREORDER_DELIVERY} />);
    expect(preorder).toContain(PREORDER_DELIVERY);
    expect(preorder).not.toContain(STANDARD_DELIVERY);
    expect(renderToStaticMarkup(<TrustBarLight />)).toContain(STANDARD_DELIVERY);
  });
});

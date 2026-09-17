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

import { beforeEach, describe, expect, it } from "vitest";
import { useCart, useCartPulse } from "@/lib/store/cart";

/** The pulse drives the motion that answers an add, so only a real add may move it. */
describe("cart pulse", () => {
  beforeEach(() => {
    useCart.setState({ lines: [] });
    useCartPulse.setState({ adds: 0 });
  });

  it("counts every add and every swap into a bundle", () => {
    useCart.getState().add("glory-valkerion-lf");
    expect(useCartPulse.getState().adds).toBe(1);
    useCart.getState().add("glory-valkerion-lf", 2);
    expect(useCartPulse.getState().adds).toBe(2);
    useCart.getState().swapIntoBundle("promo-attack", [{ slug: "glory-valkerion-lf", quantity: 1 }]);
    expect(useCartPulse.getState().adds).toBe(3);
  });

  it("stays still for removals, quantity changes, clearing and a restored cart", () => {
    useCart.setState({ lines: [{ slug: "glory-valkerion-lf" as never, quantity: 3 }] });
    useCart.getState().setQuantity("glory-valkerion-lf", 1);
    useCart.getState().remove("glory-valkerion-lf");
    useCart.getState().clear();
    useCart.getState().setHydrated();
    expect(useCartPulse.getState().adds).toBe(0);
  });
});

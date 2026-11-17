import { describe, expect, it, vi } from "vitest";
import { sharedRequest } from "@/lib/shared-request";

describe("sharedRequest", () => {
  it("sends one request for callers asking about the same cart at once", async () => {
    const request = vi.fn(() => Promise.resolve("quote"));
    const [first, second] = await Promise.all([sharedRequest("cart-a", request), sharedRequest("cart-a", request)]);
    expect(request).toHaveBeenCalledTimes(1);
    expect([first, second]).toEqual(["quote", "quote"]);
  });

  it("asks again once the answer is in, and keeps different carts apart", async () => {
    const request = vi.fn(() => Promise.resolve("quote"));
    await sharedRequest("cart-b", request);
    await sharedRequest("cart-b", request);
    await Promise.all([sharedRequest("cart-c", request), sharedRequest("cart-d", request)]);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("turns a failure into null and forgets it", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("offline")));
    expect(await sharedRequest("cart-e", failing)).toBeNull();
    const working = vi.fn(() => Promise.resolve("quote"));
    expect(await sharedRequest("cart-e", working)).toBe("quote");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { commerceProviderName, getCommerceProvider } from "@/lib/commerce/provider";

const original = process.env["COMMERCE_PROVIDER"];

afterEach(() => {
  if (original === undefined) delete process.env["COMMERCE_PROVIDER"];
  else process.env["COMMERCE_PROVIDER"] = original;
});

describe("provider selection", () => {
  it("defaults to the mock with no environment at all", async () => {
    delete process.env["COMMERCE_PROVIDER"];

    expect(commerceProviderName()).toBe("mock");
    await expect(getCommerceProvider().then((p) => p.name)).resolves.toBe("mock");
  });

  it("ignores an unknown value rather than failing the request", () => {
    process.env["COMMERCE_PROVIDER"] = "shopify";
    expect(commerceProviderName()).toBe("mock");
  });

  it("reads the variable per call, not once at import", () => {
    process.env["COMMERCE_PROVIDER"] = "supabase";
    expect(commerceProviderName()).toBe("supabase");

    process.env["COMMERCE_PROVIDER"] = "mock";
    expect(commerceProviderName()).toBe("mock");
  });

  it("returns a fresh provider per call so no client is captured across requests", async () => {
    delete process.env["COMMERCE_PROVIDER"];

    const [first, second] = await Promise.all([getCommerceProvider(), getCommerceProvider()]);
    expect(first).not.toBe(second);
  });

  it("still answers from the local catalogue offline", async () => {
    delete process.env["COMMERCE_PROVIDER"];

    const provider = await getCommerceProvider();
    const page = await provider.listProducts({ perPage: 3 });

    expect(page.items.length).toBe(3);
    expect(page.total).toBeGreaterThan(0);
  });
});

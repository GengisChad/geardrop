import { describe, expect, it } from "vitest";
import { domainCode, domainMessage, GENERIC_ERROR } from "@/lib/supabase/errors";

describe("domainMessage", () => {
  it("translates a known domain code", () => {
    expect(domainMessage("GD_INSUFFICIENT_STOCK")).toBe("Le quantità richieste superano la disponibilità.");
  });

  it("finds the code inside the wrapper PostgREST adds", () => {
    const raw = 'insert or update on table "orders" failed: GD_CHECKOUT_DISABLED';
    expect(domainMessage(raw)).toBe("Le vendite non sono ancora aperte. Torna a trovarci al prossimo drop.");
  });

  it("never leaks an unknown database error", () => {
    const raw = 'relation "public.coupons" does not exist at character 42';
    const message = domainMessage(raw);

    expect(message).toBe(GENERIC_ERROR);
    expect(message).not.toContain("coupons");
    expect(message).not.toContain("relation");
  });

  it("falls back for a missing message", () => {
    expect(domainMessage(null)).toBe(GENERIC_ERROR);
    expect(domainMessage(undefined)).toBe(GENERIC_ERROR);
    expect(domainMessage("")).toBe(GENERIC_ERROR);
  });
});

describe("domainCode", () => {
  it("returns the matched code or null", () => {
    expect(domainCode("boom GD_FORBIDDEN boom")).toBe("GD_FORBIDDEN");
    expect(domainCode("timeout")).toBeNull();
  });
});

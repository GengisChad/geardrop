import { describe, expect, it } from "vitest";
import {
  assertCheckoutIntakeOpen,
  assertCommerceMaintenanceOpen,
  CommerceWriteBlockedError,
  commerceWriteBlockedMessage,
  readCommerceSwitches,
} from "@/lib/commerce/write-guard";
import { fakeSettingsClient } from "../support/site-settings-client";

const open = { row: { maintenance_mode: false, accept_orders: true } } as const;
const productionToday = { row: { maintenance_mode: false, accept_orders: false } } as const;
const maintenance = { row: { maintenance_mode: true, accept_orders: true } } as const;

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof CommerceWriteBlockedError ? error.code : `unexpected:${String(error)}`;
  }
}

describe("readCommerceSwitches", () => {
  it("reads both switches from the singleton row with a timeout", async () => {
    const { client, calls } = fakeSettingsClient(open);
    expect(await readCommerceSwitches(client)).toEqual({ maintenanceMode: false, acceptOrders: true });
    expect(calls).toEqual(["select:maintenance_mode,accept_orders", "eq:singleton=true", "abortSignal:true"]);
  });

  it.each([
    ["a query error", { row: null, error: { message: "permission denied" } }],
    ["a missing row", { row: null }],
    ["a network failure or timeout", { reject: new Error("AbortError: signal timed out") }],
  ] as const)("fails closed on %s", async (_label, read) => {
    expect(await codeOf(readCommerceSwitches(fakeSettingsClient(read).client))).toBe("GD_COMMERCE_SWITCHES_UNAVAILABLE");
  });
});

describe("assertCommerceMaintenanceOpen", () => {
  it("blocks every commercial write while the shop is in maintenance", async () => {
    expect(await codeOf(assertCommerceMaintenanceOpen(fakeSettingsClient(maintenance).client))).toBe("GD_COMMERCE_MAINTENANCE");
  });

  it("lets refunds, shipping and notes through when only order intake is closed", async () => {
    expect(await codeOf(assertCommerceMaintenanceOpen(fakeSettingsClient(productionToday).client))).toBeNull();
  });

  it("refuses when the switches cannot be verified", async () => {
    expect(await codeOf(assertCommerceMaintenanceOpen(fakeSettingsClient({ reject: new Error("offline") }).client))).toBe(
      "GD_COMMERCE_SWITCHES_UNAVAILABLE",
    );
  });
});

describe("assertCheckoutIntakeOpen", () => {
  it("checks maintenance before order intake", async () => {
    const closedAndMaintenance = { row: { maintenance_mode: true, accept_orders: false } } as const;
    expect(
      await codeOf(assertCheckoutIntakeOpen(fakeSettingsClient(closedAndMaintenance).client, { requireAcceptOrders: true })),
    ).toBe("GD_COMMERCE_MAINTENANCE");
  });

  it("closes the database checkout while accept_orders is false", async () => {
    expect(await codeOf(assertCheckoutIntakeOpen(fakeSettingsClient(productionToday).client, { requireAcceptOrders: true }))).toBe(
      "GD_CHECKOUT_INTAKE_CLOSED",
    );
  });

  it("keeps the static-catalogue Stripe checkout selling with accept_orders false, as production runs today", async () => {
    expect(
      await codeOf(assertCheckoutIntakeOpen(fakeSettingsClient(productionToday).client, { requireAcceptOrders: false })),
    ).toBeNull();
  });

  it("opens when both switches are open", async () => {
    expect(await codeOf(assertCheckoutIntakeOpen(fakeSettingsClient(open).client, { requireAcceptOrders: true }))).toBeNull();
  });
});

describe("commerceWriteBlockedMessage", () => {
  it("speaks to the buyer and to the staff differently", () => {
    const blocked = new CommerceWriteBlockedError("GD_COMMERCE_MAINTENANCE");
    expect(commerceWriteBlockedMessage(blocked, "customer")).toMatch(/manutenzione/i);
    expect(commerceWriteBlockedMessage(blocked, "staff")).toMatch(/impostazioni/i);
  });

  it("covers every code and ignores foreign errors", () => {
    for (const code of ["GD_COMMERCE_MAINTENANCE", "GD_CHECKOUT_INTAKE_CLOSED", "GD_COMMERCE_SWITCHES_UNAVAILABLE"] as const) {
      expect(commerceWriteBlockedMessage(new CommerceWriteBlockedError(code), "customer")).toBeTruthy();
      expect(commerceWriteBlockedMessage(new CommerceWriteBlockedError(code), "staff")).toBeTruthy();
    }
    expect(commerceWriteBlockedMessage(new Error("GD_COMMERCE_MAINTENANCE"), "staff")).toBeNull();
    expect(commerceWriteBlockedMessage({ message: "boom" }, "customer")).toBeNull();
  });
});

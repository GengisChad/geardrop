import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { forecastUrgency, normalizeForecastWindow } from "@/lib/admin/forecast-repository";

const row = (overrides: Partial<Parameters<typeof forecastUrgency>[0]>) => ({
  stock_quantity: 20,
  unlimited_stock: false,
  daily_rate: 1,
  reorder_point: 14,
  suggested_reorder: 0,
  ...overrides,
});

describe("forecastUrgency", () => {
  it("ranks a selling product by how close it is to running out", () => {
    expect(forecastUrgency(row({ stock_quantity: 0 }))).toBe("esaurito");
    expect(forecastUrgency(row({ stock_quantity: 10 }))).toBe("sotto-scorta");
    expect(forecastUrgency(row({ suggested_reorder: 30 }))).toBe("da-riordinare");
    expect(forecastUrgency(row({}))).toBe("ok");
  });

  it("does not raise an alarm for products that do not sell or are made to order", () => {
    expect(forecastUrgency(row({ daily_rate: 0 }))).toBe("fermo");
    expect(forecastUrgency(row({ daily_rate: 0, stock_quantity: 0 }))).toBe("esaurito");
    expect(forecastUrgency(row({ unlimited_stock: true, stock_quantity: 0 }))).toBe("ok");
  });
});

describe("normalizeForecastWindow", () => {
  it("reads lead time and cover from the query, within bounds", () => {
    expect(normalizeForecastWindow({})).toEqual({ leadDays: 14, targetDays: 45 });
    expect(normalizeForecastWindow({ consegna: "21", copertura: "60" })).toEqual({ leadDays: 21, targetDays: 60 });
    expect(normalizeForecastWindow({ consegna: "-3", copertura: "9999" })).toEqual({ leadDays: 0, targetDays: 365 });
    expect(normalizeForecastWindow({ consegna: "abc" })).toEqual({ leadDays: 14, targetDays: 45 });
  });
});

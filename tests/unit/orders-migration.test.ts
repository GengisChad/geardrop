import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260718191246_add_order_lifecycle_operations.sql"), "utf8");

describe("transactional order lifecycle migration", () => {
  it("adds immutable notes, events, tracking, and refund preparation", () => {
    expect(sql).toContain("create table public.order_notes");
    expect(sql).toContain("create table public.order_status_events");
    for (const field of ["tracking_carrier", "tracking_code", "tracking_url", "refund_prepared_at", "refund_amount_cents", "refund_reason"]) expect(sql).toContain(field);
    expect(sql).toContain("GD_ORDER_HISTORY_IMMUTABLE");
  });
  it("exposes every fixed-search-path least-privilege operation", () => {
    for (const fn of ["create_order", "transition_order_status", "cancel_order_and_restore_stock", "set_order_tracking", "add_order_note", "prepare_order_refund"]) {
      expect(sql).toContain(`function public.${fn}`);
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
    expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(6);
  });
  it("rereads pricing and products, locks stock, and writes snapshots atomically", () => {
    expect(sql).toContain("calculate_cart_pricing");
    expect(sql).toContain("for update");
    expect(sql).toContain("product_name_snapshot");
    expect(sql).toContain("shipping_address_snapshot");
    expect(sql).toContain("order_reserved");
    expect(sql).not.toMatch(/p_(subtotal|discount|shipping|total)_cents/);
  });
  it("restores stock once and audits lifecycle changes", () => {
    expect(sql).toContain("order_cancelled");
    expect(sql).toContain("GD_ORDER_INVALID_TRANSITION");
    expect(sql).toContain("order.cancelled");
    expect(sql).toContain("order.refund_prepared");
    expect(sql).toContain("public.audit_events");
  });
});

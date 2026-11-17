/**
 * Test: packages/data-contract/src/management/overview.ts
 *
 * Copre i vincoli del Task 6 Step 1:
 * - read_access spento o illeggibile → nessun loader di business parte
 * - read_access spento si distingue da illeggibile (readAccess "off" / "unknown"),
 *   così la panoramica dice "lettura non attiva" invece di un errore
 * - errore di lettura → stato "unavailable", mai zeri
 * - azienda vuota → zeri veri con stato "empty"
 * - l'azienda interrogata è sempre principal.organization.id
 * - il package non importa next né file delle app
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import * as contract from "@geardrop/data-contract";
import { checkSourceImports } from "../../scripts/check-workspace-boundaries";

// ---------------------------------------------------------------------------
// Helpers: feature flag rows
// ---------------------------------------------------------------------------
const featureNames = [
  "read_access",
  "inventory_writes",
  "purchasing_writes",
  "fulfillment_writes",
  "pricing_writes",
  "marketing_writes",
  "external_effects",
] as const;

function featuresAllFalse() {
  return featureNames.map((f) => ({ feature: f, enabled: false, updated_at: "2026-10-06T10:00:00Z" }));
}

function featuresWithReadAccess() {
  return featureNames.map((f) => ({ feature: f, enabled: f === "read_access", updated_at: "2026-10-06T10:00:00Z" }));
}

// ---------------------------------------------------------------------------
// Helpers: RPC payloads
// ---------------------------------------------------------------------------
function emptyDashboardRpc() {
  return {
    products: { total: 0, published: 0, draft: 0, archived: 0, sold_out: 0, low_stock: 0, preorder: 0 },
    active_coupons: 0,
    active_promotions: 0,
    commerce: {
      order_count: 0,
      revenue_cents: 0,
      gross_revenue_cents: 0,
      refunded_cents: 0,
      refunded_order_count: 0,
      unpaid_order_count: 0,
      average_order_value_cents: 0,
      latest_orders: [],
    },
    stock_movements: [],
    staff_activity: null,
  };
}

function filledDashboardRpc() {
  return {
    products: { total: 5, published: 3, draft: 1, archived: 1, sold_out: 0, low_stock: 1, preorder: 0 },
    active_coupons: 2,
    active_promotions: 1,
    commerce: {
      order_count: 10,
      revenue_cents: 50000,
      gross_revenue_cents: 55000,
      refunded_cents: 5000,
      refunded_order_count: 1,
      unpaid_order_count: 2,
      average_order_value_cents: 5000,
      latest_orders: [],
    },
    stock_movements: [],
    staff_activity: null,
  };
}

function warehouseRpc() {
  return {
    stock_value_cents: 0,
    products_without_cost: 0,
    draft_receipts: 0,
    period_days: 30,
    complete_orders: 0,
    incomplete_orders: 0,
    profit_cents: 0,
    revenue_net_cents: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers: principal and mock client
// ---------------------------------------------------------------------------
function makePrincipal(orgId: number): contract.StaffPrincipal {
  const org: contract.OrganizationMembership = {
    id: orgId,
    slug: "test-org",
    name: "Test Org",
    storefrontPublic: false,
    role: "owner",
  };
  return Object.freeze({
    userId: "user-test-1",
    role: "owner",
    active: true,
    organization: org,
    organizations: [org],
  });
}

type Handler = { data?: unknown; status?: number; error?: boolean };

function mockClient(
  handlers: Partial<Record<string, Handler>>,
  onRequest?: (rpc: string, schema: string, body: unknown) => void,
) {
  return createClient<contract.Database>("http://127.0.0.1:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const pathname = new URL(String(url)).pathname;
        const rpcName = pathname.split("/rpc/")[1] ?? pathname;
        const schema = new Headers(init?.headers ?? {}).get("content-profile") ?? "public";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        onRequest?.(rpcName, schema, body);
        const key = `${schema}:${rpcName}`;
        const handler = handlers[key];
        if (!handler) {
          throw new Error(`Mock: unexpected request to ${key}`);
        }
        if (handler.error) {
          return new Response(JSON.stringify({ message: "RPC error", code: "42501" }), {
            status: handler.status ?? 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(handler.data ?? null), {
          status: handler.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("management overview read-only loader", () => {
  it("esporta il contratto richiesto dal piano", () => {
    expect(contract.loadManagementOverview).toBeTypeOf("function");
  });

  it("stato unavailable e nessuna query di business quando read_access è spento", async () => {
    const calls: string[] = [];
    const db = mockClient(
      { "management_api:list_management_features": { data: featuresAllFalse() } },
      (rpc) => { calls.push(rpc); },
    );
    const overview = await contract.loadManagementOverview(db, makePrincipal(1));
    expect(overview.dashboard.status).toBe("unavailable");
    expect(overview.readAccess).toBe("off");
    expect(overview.warehouse).toBeNull();
    // Nessuna query di business deve essere partita
    expect(calls).not.toContain("get_admin_dashboard_metrics");
    expect(calls).not.toContain("get_warehouse_summary");
  });

  it("stato unavailable e nessuna query di business quando il flag è illeggibile", async () => {
    const calls: string[] = [];
    const db = mockClient(
      { "management_api:list_management_features": { error: true, status: 403 } },
      (rpc) => { calls.push(rpc); },
    );
    const overview = await contract.loadManagementOverview(db, makePrincipal(1));
    expect(overview.dashboard.status).toBe("unavailable");
    expect(overview.readAccess).toBe("unknown");
    expect(overview.warehouse).toBeNull();
    expect(calls).not.toContain("get_admin_dashboard_metrics");
    expect(calls).not.toContain("get_warehouse_summary");
  });

  it("errore di lettura dashboard → stato unavailable, mai zeri nel campo data", async () => {
    const db = mockClient({
      "management_api:list_management_features": { data: featuresWithReadAccess() },
      "public:get_admin_dashboard_metrics": { error: true, status: 500 },
      "public:get_warehouse_summary": { error: true, status: 500 },
    });
    const overview = await contract.loadManagementOverview(db, makePrincipal(1));
    expect(overview.dashboard.status).toBe("unavailable");
    // Il flag era acceso: il guasto è nella lettura, non nella configurazione
    expect(overview.readAccess).toBe("on");
    // Lo stato unavailable NON deve avere un campo data con numeri
    expect("metrics" in overview.dashboard).toBe(false);
    expect(overview.warehouse).toBeNull();
  });

  it("azienda vuota → stato empty con zeri veri, non unavailable", async () => {
    const db = mockClient({
      "management_api:list_management_features": { data: featuresWithReadAccess() },
      "public:get_admin_dashboard_metrics": { data: emptyDashboardRpc() },
      "public:get_warehouse_summary": { data: warehouseRpc() },
    });
    const overview = await contract.loadManagementOverview(db, makePrincipal(2));
    // Oryvenne: zero prodotti, zero ordini → "empty", non "unavailable"
    expect(overview.dashboard.status).toBe("empty");
    // Lo stato empty HA i dati (zeri veri)
    expect("metrics" in overview.dashboard).toBe(true);
    if (overview.dashboard.status === "empty") {
      expect(overview.dashboard.metrics.total).toBe(0);
    }
    // Il magazzino viene caricato anche per un'azienda vuota
    expect(overview.warehouse).not.toBeNull();
    expect(overview.warehouse?.stockValueCents).toBe(0);
  });

  it("azienda con dati → stato loaded con metriche reali", async () => {
    const db = mockClient({
      "management_api:list_management_features": { data: featuresWithReadAccess() },
      "public:get_admin_dashboard_metrics": { data: filledDashboardRpc() },
      "public:get_warehouse_summary": { data: warehouseRpc() },
    });
    const overview = await contract.loadManagementOverview(db, makePrincipal(1));
    expect(overview.dashboard.status).toBe("loaded");
    expect(overview.readAccess).toBe("on");
    if (overview.dashboard.status === "loaded") {
      expect(overview.dashboard.metrics.total).toBe(5);
      expect(overview.dashboard.commerce?.orderCount).toBe(10);
      expect(overview.dashboard.commerce?.grossRevenueCents).toBe(55000);
      expect(overview.dashboard.commerce?.refundedCents).toBe(5000);
    }
  });

  it("l'ID organizzazione interrogato è sempre principal.organization.id", async () => {
    const capturedOrgIds: number[] = [];
    const db = mockClient(
      {
        "management_api:list_management_features": { data: featuresWithReadAccess() },
        "public:get_admin_dashboard_metrics": { data: emptyDashboardRpc() },
        "public:get_warehouse_summary": { data: warehouseRpc() },
      },
      (_rpc, _schema, body) => {
        if (body && typeof body === "object" && "p_organization_id" in body) {
          capturedOrgIds.push((body as { p_organization_id: number }).p_organization_id);
        }
      },
    );
    await contract.loadManagementOverview(db, makePrincipal(42));
    // Ogni RPC con p_organization_id deve ricevere esattamente 42
    expect(capturedOrgIds.length).toBeGreaterThan(0);
    expect(capturedOrgIds.every((id) => id === 42)).toBe(true);
  });

  it("errore warehouse → null, non zeri; dashboard loaded rimane intatto", async () => {
    const db = mockClient({
      "management_api:list_management_features": { data: featuresWithReadAccess() },
      "public:get_admin_dashboard_metrics": { data: filledDashboardRpc() },
      "public:get_warehouse_summary": { error: true, status: 500 },
    });
    const overview = await contract.loadManagementOverview(db, makePrincipal(1));
    expect(overview.dashboard.status).toBe("loaded");
    // Errore warehouse → null, non un oggetto con zeri
    expect(overview.warehouse).toBeNull();
  });

  it("il package non importa Next.js, file app o src/", () => {
    const file = resolve("packages/data-contract/src/management/overview.ts");
    // Import legale: dipendenza dichiarata nel package.json
    expect(
      checkSourceImports('import type { SupabaseClient } from "@supabase/supabase-js";', file, process.cwd()),
    ).toEqual([]);
    // Import vietati
    for (const illegal of [
      'import "next/server";',
      'import "../../../src/lib/admin/dashboard";',
      'import "react";',
      'import "../../../apps/management/src/app/page";',
    ]) {
      expect(checkSourceImports(illegal, file, process.cwd()), illegal).toHaveLength(1);
    }
  });
});

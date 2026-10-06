import { describe, expect, it } from "vitest";
import {
  COUNTED_TABLES,
  countDifferences,
  localMigrationVersions,
  pendingMigrations,
  safeHost,
} from "../../scripts/rehearse-production-upgrade";

describe("rehearsal helpers", () => {
  it("never leaks the password of a connection string", () => {
    expect(safeHost("postgresql://postgres:sup3r-s3cret@db.abcdef.supabase.co:5432/postgres")).toBe("db.abcdef.supabase.co:5432");
    expect(safeHost("non una url")).toBe("indirizzo non leggibile");
  });

  it("lists the migrations production is missing, in order", () => {
    const local = localMigrationVersions([
      "20261006100000_add_organizations.sql",
      "20260717185534_assert_dedicated_project.sql",
      "note.md",
      "20261006160000_add_inventory_costs.sql",
    ]);
    expect(local).toEqual(["20260717185534", "20261006100000", "20261006160000"]);
    expect(pendingMigrations(["20260717185534"], local)).toEqual(["20261006100000", "20261006160000"]);
    expect(pendingMigrations(local, local)).toEqual([]);
  });

  it("reports any table whose row count changed", () => {
    expect(countDifferences({ orders: 12, products: 21 }, { orders: 12, products: 21 })).toEqual([]);
    expect(countDifferences({ orders: 12 }, { orders: 11 })).toEqual(["orders: 12 → 11"]);
    expect(countDifferences({ orders: 12 }, { orders: 12, products: 3 })).toEqual(["products: 0 → 3"]);
  });

  it("counts the tables that carry the shop's history", () => {
    for (const table of ["orders", "order_items", "inventory_movements", "customer_profiles", "audit_events"]) {
      expect(COUNTED_TABLES).toContain(table);
    }
  });
});

describe("redact", () => {
  it("removes the password from anything the tools print back", async () => {
    const { redact } = await import("../../scripts/rehearse-production-upgrade");
    expect(redact('Command failed: pg_dump "postgresql://postgres.abc:Sup3r@Secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"'))
      .toBe('Command failed: pg_dump "postgresql://postgres.abc:***@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"');
    expect(redact("postgres://user:pw@host/db e ancora postgresql://u2:pw2@host2/db"))
      .toBe("postgres://user:***@host/db e ancora postgresql://u2:***@host2/db");
    expect(redact("nessuna connessione qui")).toBe("nessuna connessione qui");
  });
});

describe("filterDataDump", () => {
  it("keeps the shop's data and the users the orders point at", async () => {
    const { filterDataDump, isRestorableTable } = await import("../../scripts/rehearse-production-upgrade");
    expect(isRestorableTable("public", "orders")).toBe(true);
    expect(isRestorableTable("private", "preorder_catalog_campaigns")).toBe(true);
    expect(isRestorableTable("auth", "users")).toBe(true);
    expect(isRestorableTable("auth", "mfa_recovery_code_sets")).toBe(false);
    expect(isRestorableTable("storage", "objects")).toBe(false);
    expect(isRestorableTable("storage", "s3_multipart_uploads")).toBe(false);

    const dump = [
      "SET session_replication_role = replica;",
      'COPY "public"."orders" ("id") FROM stdin;',
      "1",
      "\\.",
      'COPY "auth"."mfa_recovery_code_sets" ("id") FROM stdin;',
      "segreto-da-non-ripristinare",
      "\\.",
      'COPY "auth"."users" ("id") FROM stdin;',
      "uuid",
      "\\.",
      "",
    ].join("\n");
    const filtered = filterDataDump(dump);
    expect(filtered).toContain('COPY "public"."orders"');
    expect(filtered).toContain('COPY "auth"."users"');
    expect(filtered).not.toContain("mfa_recovery_code_sets");
    expect(filtered).not.toContain("segreto-da-non-ripristinare");
    expect(filtered).toContain("SET session_replication_role = replica;");
  });
});

describe("storagePoliciesToRecreate", () => {
  it("finds the storage policies the pending migrations expect to exist", async () => {
    const { storagePoliciesToRecreate } = await import("../../scripts/rehearse-production-upgrade");
    expect(storagePoliciesToRecreate([
      'drop policy "product_images_content_staff_insert" on storage.objects;\ncreate policy "x" on public.products;',
      'drop policy if exists "product_images_manager_delete" on storage.objects;',
      'drop policy "product_images_content_staff_insert" on storage.objects;',
    ])).toEqual(["product_images_content_staff_insert", "product_images_manager_delete"]);
    expect(storagePoliciesToRecreate(["drop policy \"orders_manager_read\" on public.orders;"])).toEqual([]);
  });
});

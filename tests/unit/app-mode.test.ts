import { describe, expect, it } from "vitest";
import * as deployment from "@/lib/app-mode";

const managementEnv = {
  NEXT_PUBLIC_APP_SURFACE: "management",
  MANAGEMENT_MODE: "read_only",
  MANAGEMENT_ORIGIN: "https://management.example",
  STOREFRONT_ORIGIN: "https://shop.example",
  NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "project-abc",
};

describe("deployment contract", () => {
  it("keeps the existing admin component's surface helper compatible", () => {
    expect(deployment.isGestionaleOnly(managementEnv)).toBe(true);
    expect(deployment.isGestionaleOnly({})).toBe(false);
  });

  it.each([{}, { NEXT_PUBLIC_APP_SURFACE: "storefront" }])("keeps the storefront as default or explicit surface", (env) => {
    expect(deployment.readDeploymentContract(env)).toEqual({
      surface: "storefront",
      managementMode: "read_only",
      managementOrigin: null,
      storefrontOrigin: "https://geardropshop.it",
      expectedSupabaseProjectRef: null,
      legacyAdminMode: "enabled",
    });
  });

  it.each(["read_only", "active"])("accepts management mode %s", (managementMode) => {
    expect(deployment.readDeploymentContract({ ...managementEnv, MANAGEMENT_MODE: managementMode }).managementMode).toBe(managementMode);
  });

  it.each([
    [{ NEXT_PUBLIC_APP_SURFACE: "internal" }, "GD_APP_SURFACE_INVALID"],
    [{ NEXT_PUBLIC_APP_SURFACE: "" }, "GD_APP_SURFACE_INVALID"],
    [{ NEXT_PUBLIC_APP_SURFACE: "  " }, "GD_APP_SURFACE_INVALID"],
    [{ ...managementEnv, MANAGEMENT_MODE: "disabled" }, "GD_MANAGEMENT_MODE_INVALID"],
    [{ ...managementEnv, MANAGEMENT_ORIGIN: "" }, "GD_MANAGEMENT_ORIGIN_REQUIRED"],
    [{ ...managementEnv, NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "" }, "GD_MANAGEMENT_PROJECT_REF_REQUIRED"],
    [{ ...managementEnv, NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "foo.bar" }, "GD_MANAGEMENT_PROJECT_REF_REQUIRED"],
  ])("rejects invalid deployment input with %s", (env, error) => {
    expect(() => deployment.readDeploymentContract(env)).toThrow(error);
  });

  it("rejects an unknown legacy admin mode", () => {
    expect(() => deployment.readDeploymentContract({ LEGACY_ADMIN_MODE: "unknown" })).toThrow();
  });

  it("keeps /admin in the storefront until redirect is explicitly selected", () => {
    const enabled = deployment.readDeploymentContract({ LEGACY_ADMIN_MODE: "enabled" });
    expect(deployment.classifyRequest("/admin/ordini", "GET", enabled)).toEqual({ kind: "allow" });
    const redirect = deployment.readDeploymentContract({ LEGACY_ADMIN_MODE: "redirect", MANAGEMENT_ORIGIN: "https://management.example" });
    expect(deployment.classifyRequest("/admin/ordini", "GET", redirect)).toEqual({
      kind: "redirect", destination: "https://management.example/",
    });
  });

  it("requires a management origin for the future legacy redirect", () => {
    expect(() => deployment.readDeploymentContract({ LEGACY_ADMIN_MODE: "redirect" })).toThrow("GD_MANAGEMENT_ORIGIN_REQUIRED");
  });
});

describe("management Supabase target", () => {
  const contract = () => deployment.readDeploymentContract(managementEnv);

  it("accepts only the configured remote project ref", () => {
    expect(() => deployment.assertManagementSupabaseTarget(contract(), "https://project-abc.supabase.co", "production")).not.toThrow();
    expect(() => deployment.assertManagementSupabaseTarget(contract(), "https://other.supabase.co?token=hidden", "production"))
      .toThrow("GD_MANAGEMENT_PROJECT_MISMATCH");
  });

  it("allows local only on loopback and outside production", () => {
    const local = deployment.readDeploymentContract({ ...managementEnv, NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "local" });
    expect(() => deployment.assertManagementSupabaseTarget(local, "http://127.0.0.1:54321", "development")).not.toThrow();
    expect(() => deployment.assertManagementSupabaseTarget(local, "http://127.0.0.2:54321", "development")).not.toThrow();
    expect(() => deployment.assertManagementSupabaseTarget(local, "http://localhost:54321", "test")).not.toThrow();
    expect(() => deployment.assertManagementSupabaseTarget(local, "https://project-abc.supabase.co", "development"))
      .toThrow("GD_MANAGEMENT_REMOTE_REQUIRED");
    expect(() => deployment.assertManagementSupabaseTarget(local, "https://127.evil.example", "development"))
      .toThrow("GD_MANAGEMENT_REMOTE_REQUIRED");
    expect(() => deployment.assertManagementSupabaseTarget(local, "http://127.0.0.1:54321", "production"))
      .toThrow("GD_MANAGEMENT_REMOTE_REQUIRED");
  });

  it("rejects loopback for a remote project even when its hostname contains the ref", () => {
    expect(() => deployment.assertManagementSupabaseTarget(contract(), "http://project-abc.localhost:54321", "development"))
      .toThrow("GD_MANAGEMENT_PROJECT_MISMATCH");
  });
});

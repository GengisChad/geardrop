import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type ManagementFeature = Database["public"]["Enums"]["management_feature"];
export type ManagementFeatures = Readonly<Record<ManagementFeature, boolean>>;
export type ManagementReadAccessInput = Database["management_api"]["Functions"]["set_management_read_access"]["Args"];

const featureNames = ["read_access", "inventory_writes", "purchasing_writes", "fulfillment_writes", "pricing_writes", "marketing_writes", "external_effects"] as const satisfies readonly ManagementFeature[];

export class ManagementFeatureUnavailableError extends Error {
  constructor() {
    super("GD_MANAGEMENT_FEATURE_UNAVAILABLE");
    this.name = "ManagementFeatureUnavailableError";
  }
}

/** An incomplete or untrusted response never becomes an authorization decision. */
export async function loadManagementFeatures(client: SupabaseClient<Database>, organizationId: number): Promise<ManagementFeatures> {
  try {
    const { data, error } = await client.schema("management_api").rpc("list_management_features", { p_organization_id: organizationId });
    if (error || !Array.isArray(data) || data.length !== featureNames.length) throw new ManagementFeatureUnavailableError();
    const features: Partial<Record<ManagementFeature, boolean>> = {};
    for (const row of data) {
      if (!row || !featureNames.includes(row.feature) || typeof row.enabled !== "boolean" || Object.hasOwn(features, row.feature)) throw new ManagementFeatureUnavailableError();
      features[row.feature] = row.enabled;
    }
    if (!featureNames.every(feature => Object.hasOwn(features, feature))) throw new ManagementFeatureUnavailableError();
    return Object.freeze(features as Record<ManagementFeature, boolean>);
  } catch {
    throw new ManagementFeatureUnavailableError();
  }
}

export function requireManagementFeature(features: ManagementFeatures, feature: ManagementFeature): void {
  if (!Object.hasOwn(features, feature) || features[feature] !== true) throw new Error("GD_MANAGEMENT_FEATURE_DISABLED");
}

/** This control-plane action cannot name or mutate any of the six module flags. */
export async function setManagementReadAccess(client: SupabaseClient<Database>, input: ManagementReadAccessInput) {
  try {
    const { data, error } = await client.schema("management_api").rpc("set_management_read_access", {
      p_organization_id: input.p_organization_id,
      p_enabled: input.p_enabled,
      p_expected_updated_at: input.p_expected_updated_at,
      p_reason: input.p_reason,
    });
    if (error || !data || data.feature !== "read_access" || data.organization_id !== input.p_organization_id || data.enabled !== input.p_enabled) throw new ManagementFeatureUnavailableError();
    return data;
  } catch {
    throw new ManagementFeatureUnavailableError();
  }
}

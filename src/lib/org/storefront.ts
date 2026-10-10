import "server-only";

import { createSupabasePublicClient } from "@/lib/supabase/public";

/** The company whose public shop this deployment serves, unless the environment names another. */
export const DEFAULT_STOREFRONT_ORGANIZATION = "geardrop";

type Env = Readonly<Record<string, string | undefined>>;

export function storefrontOrganizationSlug(env: Env = process.env): string {
  return env["NEXT_PUBLIC_STOREFRONT_ORGANIZATION"]?.trim() || DEFAULT_STOREFRONT_ORGANIZATION;
}

let cached: { readonly slug: string; readonly id: Promise<number> } | undefined;

/**
 * The id of the shop's company, read once per process: company ids never change. It fails
 * closed: a company without a public shop, or a lookup error, stops the storefront query that
 * asked instead of serving another company's rows.
 */
export function storefrontOrganizationId(env: Env = process.env): Promise<number> {
  const slug = storefrontOrganizationSlug(env);
  if (cached?.slug === slug) return cached.id;
  const id = (async () => {
    const { data, error } = await createSupabasePublicClient()
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .eq("storefront_public", true)
      .maybeSingle();
    if (error || !data) throw new Error(`GD_STOREFRONT_ORGANIZATION_UNAVAILABLE:${slug}`);
    return data.id;
  })();
  cached = { slug, id };
  // A failed lookup is not remembered: the next request tries again.
  id.catch(() => {
    if (cached?.id === id) cached = undefined;
  });
  return id;
}

/** Test seam: forget the remembered id. */
export function resetStorefrontOrganizationCache(): void {
  cached = undefined;
}

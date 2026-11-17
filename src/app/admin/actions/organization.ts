"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadOrganizationMemberships, requireUser } from "@/lib/auth/guards";
import { ORGANIZATION_COOKIE } from "@/lib/org/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Switches the admin to another company the person works for. The cookie only records the
 * choice: every query and RPC checks the membership again, so a forged cookie changes nothing.
 * The overview is the landing page, because the page left behind may show a record of the
 * other company.
 */
export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const requested = formData.get("organization");
  const slug = typeof requested === "string" ? requested.trim() : "";

  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const memberships = await loadOrganizationMemberships(client, user.id);
  if (!memberships.some((membership) => membership.slug === slug)) {
    redirect("/admin");
  }

  (await cookies()).set(ORGANIZATION_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { appRoute } from "@/lib/routes";

export type StaffRole = "owner" | "admin" | "editor";
export type SessionUser = { readonly id: string; readonly email: string };

/** Role ranking used by the guards: an owner satisfies every admin-level requirement. */
const RANK: Record<StaffRole, number> = { editor: 1, admin: 2, owner: 3 };

/**
 * The signed-in user, verified against the Auth server (`getUser`), never decoded from a
 * cookie we happen to hold. Returns null when nobody is signed in or when Supabase is not
 * configured at all, so account/admin routes degrade to "please sign in" instead of
 * crashing on a fresh clone.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? "" };
}

export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(appRoute(`/auth/login?redirect=${encodeURIComponent(returnTo)}`));
  return user;
}

/**
 * The caller's active staff role, read from `staff_profiles` — the same table the RLS
 * policies read. Authorization never looks at `user_metadata`, which the user can edit.
 */
export async function getStaffRole(): Promise<StaffRole | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data || !data.active) return null;
  return data.role as StaffRole;
}

export type StaffSession = { readonly user: SessionUser; readonly role: StaffRole };

/**
 * Guard for the back-office. Anonymous visitors go to the login page; signed-in customers
 * get a 404 from the caller rather than a "forbidden" that would confirm /admin exists.
 */
export async function getStaffSession(minimum: StaffRole = "editor"): Promise<StaffSession | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const role = await getStaffRole();
  if (!role || RANK[role] < RANK[minimum]) return null;

  return { user, role };
}

export function hasAtLeast(role: StaffRole, minimum: StaffRole): boolean {
  return RANK[role] >= RANK[minimum];
}

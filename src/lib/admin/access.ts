import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import {
  AuthenticationRequiredError,
  requireStaffRole,
  requireUser,
} from "@/lib/auth/guards";
import { STAFF_ROLES, StaffAuthorizationError, type StaffPrincipal } from "@/lib/auth/roles";
import type { Database } from "@/lib/supabase/database.types";

export async function requireAdminAccess(
  client: SupabaseClient<Database>,
): Promise<StaffPrincipal> {
  try {
    await requireUser(client);
    return await requireStaffRole(client, STAFF_ROLES);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError || error instanceof StaffAuthorizationError) {
      redirect("/admin/login");
    }
    throw error;
  }
}

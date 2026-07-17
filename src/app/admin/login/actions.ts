"use server";

import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = {
  readonly error: string | null;
};

const SAFE_LOGIN_ERROR = "Credenziali non valide o accesso staff non autorizzato.";

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || !password) {
    return { error: "Inserisci email e password." };
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: SAFE_LOGIN_ERROR };
  }

  try {
    await requireUser(client);
    await requireStaffRole(client, STAFF_ROLES);
  } catch {
    await client.auth.signOut();
    return { error: SAFE_LOGIN_ERROR };
  }

  redirect("/admin");
}

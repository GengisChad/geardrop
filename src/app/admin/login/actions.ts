"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = {
  readonly error: string | null;
};

const SAFE_LOGIN_ERROR = "Credenziali non valide o accesso staff non autorizzato.";
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(1024),
});

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const parsed = loginSchema.safeParse({ email: emailValue, password: passwordValue });
  if (!parsed.success) {
    return { error: "Inserisci email e password." };
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: SAFE_LOGIN_ERROR };
  }

  try {
    await requireUser(client);
    await requireStaffRole(client, STAFF_ROLES);
    const lifecycle = await client.rpc("record_staff_login");
    if (lifecycle.error) throw lifecycle.error;
  } catch {
    await client.auth.signOut();
    return { error: SAFE_LOGIN_ERROR };
  }

  redirect("/admin");
}

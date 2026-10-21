"use server";

import { z } from "zod";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountActionState = { readonly ok: boolean; readonly message: string };

const passwordSchema = z.object({
  password: z.string().min(10).max(128),
  confirmation: z.string(),
}).refine((value) => value.password === value.confirmation, { path: ["confirmation"], message: "Le password non coincidono." });

/**
 * A partner changes their own password, from inside their session. Accounts are created with a
 * temporary password by an owner: this is where it becomes personal.
 */
export async function changePasswordAction(_previous: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path[0] === "confirmation");
    return { ok: false, message: mismatch ? "Le due password non coincidono." : "La password deve avere almeno 10 caratteri." };
  }
  try {
    const client = await createSupabaseServerClient();
    await requireUser(client);
    await requireStaffRole(client, STAFF_ROLES);
    const { error } = await client.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return {
        ok: false,
        message: /same|different/i.test(error.message)
          ? "La nuova password deve essere diversa da quella attuale."
          : /weak|pwned|leaked/i.test(error.message)
            ? "Password troppo debole o già comparsa in una violazione: scegline un'altra."
            : "Password non aggiornata. Riprova.",
      };
    }
    return { ok: true, message: "Password aggiornata. Usala dal prossimo accesso, su ogni dispositivo." };
  } catch {
    return { ok: false, message: "Sessione scaduta: accedi di nuovo e riprova." };
  }
}

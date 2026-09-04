"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { firstIssue, profileSchema, type AuthFormState } from "@/lib/auth/schemas";

/**
 * Saves the customer's own profile row. The write is scoped to `auth.uid()` by RLS, so a
 * forged user_id in the payload cannot touch someone else's profile — the id is not even
 * accepted from the client.
 */
export async function updateProfileAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sessione scaduta. Accedi di nuovo." };

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("customer_profiles").upsert({
    user_id: user.id,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    phone: parsed.data.phone?.trim() ? parsed.data.phone.trim() : null,
  });

  if (error) return { error: "Non è stato possibile salvare i dati. Riprova." };

  revalidatePath("/account");
  return { notice: "Dati aggiornati." };
}

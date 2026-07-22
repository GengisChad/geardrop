"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthFormState } from "@/lib/auth/customer-schemas";
import { authRedirectUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Explicit, human-initiated verification.
 *
 * The email link used to point straight at GoTrue's /verify, which consumes the one-time
 * token on GET — and the first GET is never the human's: the log showed /verify hit 24
 * seconds after signup by the mailbox's link scanner, so every real click landed on an
 * already-burned token. The email now carries only token_hash to an interstitial page,
 * and nothing is consumed until the visitor presses the button that submits here.
 */

const confirmSchema = z.object({
  tokenHash: z.string().trim().min(16).max(256),
});

const CONFIRM_ERROR =
  "Link non valido o già utilizzato. Se hai già confermato, accedi; altrimenti richiedi una nuova email.";

async function verifyTokenHash(
  tokenHash: string,
  type: "email" | "recovery",
): Promise<AuthFormState | never> {
  const client = await createSupabaseServerClient();
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    // Never log or echo the token. Codes only: expired, already used, malformed all end
    // in the same neutral message — the distinction matters to us, not to a probe.
    console.warn(`[auth] verifyOtp ${type} failed: ${error.status ?? "?"} ${error.code ?? "unknown"}`);
    return { error: CONFIRM_ERROR, notice: null };
  }

  redirect((type === "recovery" ? "/nuova-password" : "/account") as Route);
}

export async function confirmSignupAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = confirmSchema.safeParse({ tokenHash: formData.get("tokenHash") });
  if (!parsed.success) return { error: CONFIRM_ERROR, notice: null };

  return verifyTokenHash(parsed.data.tokenHash, "email");
}

export async function confirmRecoveryAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = confirmSchema.safeParse({ tokenHash: formData.get("tokenHash") });
  if (!parsed.success) return { error: CONFIRM_ERROR, notice: null };

  return verifyTokenHash(parsed.data.tokenHash, "recovery");
}

/**
 * A real resend, through auth.resend — not another signUp, which GoTrue answers with a
 * silent 200 and the SMTP frequency cap then swallows. The response never says whether
 * the address is registered; only the rate limit is named, because retrying immediately
 * would fail again anyway.
 */
export async function resendConfirmationAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().pipe(z.email()) })
    .safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: "Inserisci un indirizzo email valido.", notice: null };
  }

  const client = await createSupabaseServerClient();
  const headerList = await headers();
  const origin = headerList.get("origin");

  const { error } = await client.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: authRedirectUrl(origin, "/conferma-email") },
  });

  if (error) {
    console.warn(`[auth] resend failed: ${error.status ?? "?"} ${error.code ?? "unknown"}`);

    if (error.status === 429) {
      return { error: "Troppe richieste. Attendi qualche minuto e riprova.", notice: null };
    }
  }

  // Same message for sent, unknown address and SMTP hiccup: no account enumeration.
  return {
    error: null,
    notice: "Se l'indirizzo è registrato e non ancora confermato, riceverai una nuova email a breve.",
  };
}

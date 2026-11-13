"use server";

import { z } from "zod";
import { sendEmail } from "@/lib/email/resend";
import { newsletterConfirmEmail } from "@/lib/newsletter/confirm-email";
import { NEWSLETTER_CONSENT_TEXT, isNewsletterToken } from "@/lib/newsletter/newsletter";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";

export type NewsletterState = {
  readonly ok: boolean;
  readonly message: string;
};

const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Controlla l'indirizzo email.")
    .max(320, "Controlla l'indirizzo email.")
    .email("Controlla l'indirizzo email."),
});

const UNAVAILABLE: NewsletterState = { ok: false, message: "Iscrizione non disponibile in questo momento. Riprova più tardi." };

function databaseReady(): boolean {
  return Boolean(process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim() && process.env["SUPABASE_SECRET_KEY"]?.trim());
}

/**
 * The banner's form. The same answer whether the address is new, pending or already in, so the
 * form never tells a stranger who is on the list. Only a new or due signup gets the email.
 */
export async function subscribeNewsletterAction(_previous: NewsletterState, formData: FormData): Promise<NewsletterState> {
  // A field people never see: a bot that fills it gets the usual answer and nothing is stored.
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { ok: true, message: "Controlla la tua email e conferma l'iscrizione." };
  }

  const parsed = signupSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Controlla l'indirizzo email." };
  }
  if (!databaseReady()) return UNAVAILABLE;

  try {
    const client = createPrivilegedSupabaseClient();
    const { data: token, error } = await client.rpc("newsletter_signup", {
      p_email: parsed.data.email,
      p_source: "home",
      p_consent: NEWSLETTER_CONSENT_TEXT,
    });
    if (error) {
      if (error.message.includes("GD_NEWSLETTER_INVALID_EMAIL")) return { ok: false, message: "Controlla l'indirizzo email." };
      return UNAVAILABLE;
    }
    if (token) {
      const sent = await sendEmail(newsletterConfirmEmail({ to: parsed.data.email, token }));
      if (!sent.ok) console.error("newsletter confirmation email not sent", sent.reason, sent.ok ? "" : sent.detail);
    }
    return { ok: true, message: "Controlla la tua email e conferma l'iscrizione." };
  } catch (error) {
    console.error("newsletter signup failed", error);
    return UNAVAILABLE;
  }
}

async function answerToken(
  rpc: "newsletter_confirm" | "newsletter_unsubscribe",
  formData: FormData,
  answers: Record<"done" | "already" | "unknown", NewsletterState>,
): Promise<NewsletterState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!isNewsletterToken(token)) return answers.unknown;
  if (!databaseReady()) return UNAVAILABLE;
  try {
    const client = createPrivilegedSupabaseClient();
    const { data, error } = await client.rpc(rpc, { p_token: token });
    if (error) return UNAVAILABLE;
    return data === "done" || data === "already" ? answers[data] : answers.unknown;
  } catch (error) {
    console.error(`${rpc} failed`, error);
    return UNAVAILABLE;
  }
}

export async function confirmNewsletterAction(_previous: NewsletterState, formData: FormData): Promise<NewsletterState> {
  return answerToken("newsletter_confirm", formData, {
    done: { ok: true, message: "Iscrizione confermata. Ti scriviamo al prossimo drop." },
    already: { ok: true, message: "L'iscrizione era già confermata. Ti scriviamo al prossimo drop." },
    unknown: { ok: false, message: "Questo link non è più valido. Iscriviti di nuovo dalla home." },
  });
}

export async function unsubscribeNewsletterAction(_previous: NewsletterState, formData: FormData): Promise<NewsletterState> {
  return answerToken("newsletter_unsubscribe", formData, {
    done: { ok: true, message: "Fatto: non riceverai più le nostre email sulle novità." },
    already: { ok: true, message: "Eri già cancellato: non riceverai più le nostre email sulle novità." },
    unknown: { ok: false, message: "Questo link non è valido. Scrivici a infogeardrop@gmail.com e ti cancelliamo noi." },
  });
}

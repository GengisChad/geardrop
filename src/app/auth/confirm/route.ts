import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { appRoute } from "@/lib/routes";

/**
 * Landing point for Supabase email links (signup confirmation and password recovery).
 * It exchanges the one-time token for a session cookie and then forwards the visitor.
 *
 * `next` is clamped to a same-site path so a crafted confirmation link cannot bounce
 * someone to another origin carrying a fresh session.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const requested = params.get("next") ?? "/account";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/account";

  if (isSupabaseConfigured() && tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(appRoute(next));
  }

  redirect("/auth/login?errore=link");
}

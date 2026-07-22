import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where every Supabase email link lands: confirmation, recovery and email change.
 *
 * Supabase sends either a PKCE `code` or a `token_hash` + `type` pair depending on the
 * template, so both are handled. On success the session cookies are written and the
 * visitor continues to `next`; on failure they reach the login page with a flag rather
 * than a raw Supabase error, because an expired link is a normal thing to hit.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/login?errore=link", origin));
  }

  const client = await createSupabaseServerClient();

  const { error } = code
    ? await client.auth.exchangeCodeForSession(code)
    : await client.auth.verifyOtp({
        type: (type ?? "email") as "email" | "recovery" | "invite" | "email_change",
        token_hash: tokenHash as string,
      });

  if (error) {
    return NextResponse.redirect(new URL("/login?errore=link", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}

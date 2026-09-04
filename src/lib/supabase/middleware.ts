import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/** Route prefixes that require a signed-in user. Everything else stays anonymous. */
const PROTECTED_PREFIXES = ["/account", "/admin"] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Auth cookies on every matched request and gates the protected prefixes.
 *
 * The response object must be the one the cookie writer wrote into — rebuilding it later
 * would drop the refreshed tokens and silently log people out. Only `/account` and
 * `/admin` redirect; anonymous browsing of the shop is untouched. Staff *role* checks are
 * not done here: the proxy only proves someone is signed in, and `/admin` re-checks the
 * role against `staff_profiles` on the server before rendering or mutating anything.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Mock mode (no Supabase configured): nothing to refresh, nothing to protect.
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && isProtected(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.search = `?redirect=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

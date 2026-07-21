import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { hasPublicSupabaseEnv, readPublicSupabaseEnv } from "./env";

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // The mock storefront ships without a Supabase project. /account and /auth sit on the
  // matcher because they need a session refresh when one exists, but demanding the
  // environment here would turn a mock deployment's account page into a 500.
  if (!hasPublicSupabaseEnv()) return response;

  const { url, publishableKey } = readPublicSupabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
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

  await supabase.auth.getClaims();

  return response;
}

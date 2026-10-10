import { createServerClient } from "@supabase/ssr";
import type { Database } from "@geardrop/data-contract";
import { NextResponse, type NextRequest } from "next/server";
import { readManagementSupabaseEnv } from "./env";

const invalidSessionCodes = new Set([
  "refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired",
]);

export async function updateManagementSession(request: NextRequest): Promise<NextResponse> {
  const { url, publishableKey } = readManagementSupabaseEnv();
  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        const previous = response.cookies.getAll();
        response = NextResponse.next({ request });
        for (const cookie of previous) response.cookies.set(cookie);
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  const { error } = await client.auth.getUser();
  // Terminal session errors are anonymous: preserve the SDK's cleanup cookies so
  // the browser can sign in again. This refresh helper never grants authorization.
  const invalidSession = error?.name === "AuthSessionMissingError" ||
    (error?.name === "AuthApiError" && invalidSessionCodes.has(error.code ?? ""));
  if (error && !invalidSession) throw new Error("GD_MANAGEMENT_SESSION_UNAVAILABLE");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

import { createServerClient } from "@supabase/ssr";
import type { Database } from "@geardrop/data-contract";
import { NextResponse, type NextRequest } from "next/server";
import { readManagementSupabaseEnv } from "./env";

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
  // Anonymous requests can reach the foundation/login; no authorization is granted here.
  if (error && error.name !== "AuthSessionMissingError") throw new Error("GD_MANAGEMENT_SESSION_UNAVAILABLE");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

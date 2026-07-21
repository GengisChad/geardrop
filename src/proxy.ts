import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  // Customer routes need the same cookie refresh as the staff ones, otherwise an expiring
  // session silently drops the visitor out of /account mid-visit.
  matcher: ["/admin/:path*", "/account/:path*", "/auth/:path*", "/api/preview"],
};

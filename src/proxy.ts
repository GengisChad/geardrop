import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 proxy (formerly middleware). It only keeps the Supabase Auth cookies fresh
 * and redirects anonymous visitors away from /account and /admin — see
 * src/lib/supabase/middleware.ts.
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files: session refresh has to run on
     * document requests, not on /_next/static or /products/*.webp.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff2?)$).*)",
  ],
};

import { NextResponse, type NextRequest } from "next/server";
import { classifyRequest, readDeploymentContract } from "@/lib/app-mode";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  const contract = readDeploymentContract();
  const disposition = classifyRequest(request.nextUrl.pathname, request.method, contract);

  if (disposition.kind === "not_found") return new NextResponse(null, { status: 404 });
  if (disposition.kind === "redirect") {
    const destination = new URL(disposition.destination);
    if (destination.origin === contract.storefrontOrigin) destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 307);
  }

  const pathname = request.nextUrl.pathname;
  const refresh = contract.surface === "management"
    ? disposition.kind === "rewrite" || pathname === "/auth/callback"
    : pathname === "/admin" || pathname.startsWith("/admin/") ||
      pathname === "/account" || pathname.startsWith("/account/") ||
      pathname === "/auth" || pathname.startsWith("/auth/") || pathname === "/api/preview";
  return refresh ? refreshSupabaseSession(request) : NextResponse.next({ request });
}

export const config = {
  // Classification must run before the session refresh for every management request.
  matcher: ["/:path*"],
};

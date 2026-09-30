import { assertManagementApplicationSurface, classifyManagementRequest, isManagementApplicationRoute } from "@geardrop/runtime-contract";
import { NextResponse, type NextRequest } from "next/server";
import { updateManagementSession } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const contract = assertManagementApplicationSurface();
  const disposition = classifyManagementRequest(request.nextUrl.pathname, request.method, contract);
  if (disposition.kind === "not_found") return new NextResponse(null, { status: 404 });
  if (disposition.kind === "redirect") {
    const destination = new URL(disposition.destination);
    if (destination.origin === contract.storefrontOrigin) destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 307);
  }
  return isManagementApplicationRoute(request.nextUrl.pathname)
    ? updateManagementSession(request) : NextResponse.next({ request });
}

export const config = { matcher: ["/:path*"] };

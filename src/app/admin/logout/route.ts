import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();

  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}

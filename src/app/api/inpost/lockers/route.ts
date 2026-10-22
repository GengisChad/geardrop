import { type NextRequest, NextResponse } from "next/server";
import { createInpostClient, inpostConfig, type LockerQuery } from "@/lib/shipping/inpost";

/**
 * GET /api/inpost/lockers?cap=00185 | ?citta=Roma | ?lat=41.9&lng=12.5
 *
 * The Locker search behind the checkout and the cart: the buyer picks a real InPost Locker, so the
 * order carries the id the label is made out to (owner, 2026-10-23). The shop's InPost credentials
 * stay on the server; the answer is public data (Locker addresses), cached by the CDN per query.
 */

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

function queryOf(params: URLSearchParams): LockerQuery | null {
  const cap = params.get("cap")?.trim();
  if (cap) return /^\d{5}$/.test(cap) ? { postalCode: cap } : null;
  const city = params.get("citta")?.trim().slice(0, 60);
  if (city) return city.length >= 2 ? { city } : null;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lng"));
  // Italy and a margin around it: anything else is not a buyer of this shop looking for a Locker.
  if (latitude >= 35 && latitude <= 48 && longitude >= 6 && longitude <= 19) return { latitude, longitude };
  return null;
}

export async function GET(request: NextRequest) {
  const query = queryOf(request.nextUrl.searchParams);
  if (!query) return NextResponse.json({ lockers: [], error: "Scrivi un CAP di 5 cifre o il nome della città." }, { status: 400 });

  const config = inpostConfig();
  if (!config) return NextResponse.json({ lockers: [], error: "La ricerca dei Locker non è disponibile." }, { status: 503 });

  try {
    const lockers = await createInpostClient(config).searchLockers(query);
    return NextResponse.json({ lockers }, { headers: { "Cache-Control": CACHE } });
  } catch (error) {
    console.error("[inpost-lockers]", error instanceof Error ? error.message : error);
    return NextResponse.json({ lockers: [], error: "La ricerca dei Locker non risponde. Riprova tra poco." }, { status: 502 });
  }
}

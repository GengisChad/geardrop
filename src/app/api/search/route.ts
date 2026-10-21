import { type NextRequest, NextResponse } from "next/server";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { cutoutSrc } from "@/data/assets";
import { availabilityLine } from "@/lib/holo";
import { formatPrice } from "@/lib/format";

/**
 * GET /api/search?q=<term>
 *
 * Instant-search endpoint for the header combobox. Delegates to the commerce provider so
 * availability is always live and ranking is the same as /ricerca. Results are intentionally
 * shallow (6 items) to keep the panel compact; the shopper follows "Vedi tutti" for more.
 *
 * No PII in the response. Query strings are not logged — the provider uses its own cache tags.
 *
 * Owner decided on server-side results for live availability (2026-10-12).
 */

// Trim and clamp the query; return null when it is too short to be useful.
function validatedQuery(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 60);
  return trimmed.length >= 2 ? trimmed : null;
}

const EMPTY = { items: [], total: 0 } as const;
const CACHE = "s-maxage=60, stale-while-revalidate=120";

export async function GET(request: NextRequest) {
  const q = validatedQuery(request.nextUrl.searchParams.get("q"));

  if (!q) {
    return NextResponse.json(EMPTY, { headers: { "Cache-Control": CACHE } });
  }

  const commerce = await getCommerceProvider();
  const result = await commerce.listProducts({ search: q, perPage: 6 });

  const items = result.items.map((product) => {
    const image = product.images[0];
    // Prefer the transparent cut-out; the dark panel makes a white tile look wrong.
    const imageSrc = image ? (cutoutSrc(image.src) ?? image.src) : null;

    return {
      slug: product.slug,
      name: product.name,
      price: formatPrice(product.price),
      ...(product.compareAtPrice ? { compareAt: formatPrice(product.compareAtPrice) } : {}),
      stock: product.stock,
      availability: availabilityLine(product),
      image: image && imageSrc ? { src: imageSrc, alt: image.alt } : null,
    };
  });

  return NextResponse.json(
    { items, total: result.total },
    { headers: { "Cache-Control": CACHE } },
  );
}

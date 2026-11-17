import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Wordmark } from "@/components/layout/logo";
import { Gallery } from "@/components/product/gallery";
import { RestockConfirmation } from "@/components/product/restock-form";
import { PromoBadge } from "@/components/ui/badge";
import { Providers } from "@/components/providers";

describe("X-Rail touches", () => {
  it("promo stickers land on the card's scroll timeline", () => {
    expect(renderToStaticMarkup(<PromoBadge tag="novita" />)).toContain("gd-sticker-land");
  });

  it("the header emblem relaunches on the cart pulse; the footer's stays still", () => {
    expect(renderToStaticMarkup(<Wordmark />)).toContain('data-launches="0"');
    expect(renderToStaticMarkup(<Wordmark spin={false} />)).not.toContain("data-launches");
  });

  it("the restock confirmation stamps an 'Avviso attivo' sticker over the unchanged sentence", () => {
    const html = renderToStaticMarkup(<RestockConfirmation message="Ti avvisiamo appena torna disponibile." />);
    expect(html).toContain("Avviso attivo");
    expect(html).toContain("gd-slap");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("Ti avvisiamo appena torna disponibile.");
    expect(html).toContain('role="status"');
  });

  it("the ratchet number slides in once behind a still packshot", () => {
    const html = renderToStaticMarkup(
      <Providers>
        <Gallery images={[{ src: "/products/soar-phoenix-9-60gf.webp", alt: "Soar Phoenix", width: 1200, height: 1200 }]} slug="soar-phoenix-9-60gf" name="Soar Phoenix 9-60GF" mark="9-60" />
      </Providers>,
    );
    const watermark = html.slice(html.indexOf("gd-watermark"), html.indexOf(">9-60<"));
    expect(watermark).toContain("gd-mark-in");
    expect(watermark).toContain("motion-reduce:animate-none");
  });
});

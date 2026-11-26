import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";
import { RELEASE_DELIVERY } from "@/lib/labels";
import { channelPostUrl, readTelegramConfig } from "@/lib/telegram/api";
import { asDraft, draftKeyboard, metaPost, parseDraftAction, postKeyboard, productPost, shopLink, videoPost, type TelegramPost } from "@/lib/telegram/messages";

const find = (slug: string): Product => {
  const product = [...PRODUCTS, ...BUNDLES].find((candidate) => candidate.slug === slug);
  if (!product) throw new Error(`fixture ${slug} left the catalogue`);
  return product;
};
/** A catalogue entry at a known price and availability, with no struck-through price unless given. */
function at(slug: string, amount: number, stock: Product["stock"] = "disponibile", compareAt?: number): Product {
  const base: { -readonly [Key in keyof Product]?: Product[Key] } = { ...find(slug), price: { amount, currency: "EUR" }, stock };
  delete base.compareAtPrice;
  if (compareAt !== undefined) base.compareAtPrice = { amount: compareAt, currency: "EUR" };
  return base as Product;
}

const PHOENIX = "soar-phoenix-9-60gf-solo-trottola";
function written(result: ReturnType<typeof productPost>): TelegramPost {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.post;
}

describe("product posts", () => {
  it("announces an arrival with the shop's own price, availability, photo and page", () => {
    const post = written(productPost({ kind: "new_product", slugs: [PHOENIX] }, [at(PHOENIX, 1690)]));
    expect(post.text).toBe("NUOVO ARRIVO //\n<b>Soar Phoenix 9-60GF solo trottola</b>\n<b>€16,90</b> · Disponibile");
    expect(post.photoUrl).toBe("https://geardropshop.it/products/soar-phoenix-9-60gf-solo-trottola.webp");
    expect(post.link).toEqual({
      label: "Vedi nello shop",
      url: "https://geardropshop.it/prodotto/soar-phoenix-9-60gf-solo-trottola?utm_source=telegram&utm_medium=social&utm_campaign=news",
    });
  });

  it("writes a return with the price of the moment it is published, not of the moment it was found", () => {
    const post = written(productPost({ kind: "back_in_stock", slugs: [PHOENIX] }, [at(PHOENIX, 1790)]));
    expect(post.text).toBe("DI NUOVO DISPONIBILE //\n<b>Soar Phoenix 9-60GF solo trottola</b>\n<b>€17,90</b> · Disponibile");
  });

  it("shows the struck-through price the product card shows", () => {
    const post = written(productPost({ kind: "new_product", slugs: ["buster-dran-5-70db"] }, [at("buster-dran-5-70db", 890, "disponibile", 999)]));
    expect(post.text).toContain("<b>€8,90</b> invece di <s>€9,99</s> (-11%) · Disponibile");
  });

  it("says how long a pre-order takes, in the product page's words", () => {
    const post = written(productPost({ kind: "new_product", slugs: ["cobalt-drake-4-60f"] }, [at("cobalt-drake-4-60f", 2000, "pre-ordine")]));
    expect(post.text.split("\n")).toEqual(["NUOVO IN PRE-ORDINE //", "<b>Cobalt Drake 4-60F</b>", "<b>€20,00</b> · Pre-ordine", RELEASE_DELIVERY]);
    const reopened = written(productPost({ kind: "back_in_stock", slugs: ["cobalt-drake-4-60f"] }, [at("cobalt-drake-4-60f", 2000, "pre-ordine")]));
    expect(reopened.text.startsWith("PRE-ORDINI RIAPERTI //")).toBe(true);
  });

  it("calls a new bundle what the shop calls it", () => {
    const kit = written(productPost({ kind: "new_product", slugs: ["deck-da-torneo"] }, [at("deck-da-torneo", 5990, "disponibile", 7779)]));
    expect(kit.text.startsWith("NUOVO KIT //\n<b>Deck da Torneo</b>\n<b>€59,90</b> invece di <s>€77,79</s> (-23%)")).toBe(true);
    const duo = written(productPost({ kind: "new_product", slugs: ["duo-luster-enlil"] }, [at("duo-luster-enlil", 4200)]));
    expect(duo.text.startsWith("NUOVO DUO //")).toBe(true);
  });

  it("puts the colours of one item in one post, leaving out the ones that are sold out", () => {
    const catalogue = [at("porta-deck-giallo", 1800), at("porta-deck-verde-lime", 1800), at("porta-deck-azzurro", 1800, "esaurito")];
    const post = written(productPost({ kind: "new_product", slugs: ["porta-deck-giallo", "porta-deck-verde-lime", "porta-deck-azzurro"] }, catalogue));
    expect(post.text).toBe("NUOVO ARRIVO //\n<b>Porta Deck</b>\nColori: Giallo, Verde lime\n<b>€18,00</b> · Disponibile");
    expect(post.link.url).toContain("/prodotto/porta-deck-giallo?");
  });

  it("announces a lower price against the price before it", () => {
    const post = written(productPost({ kind: "price_drop", slugs: [PHOENIX], price: 1690, previousPrice: 2190 }, [at(PHOENIX, 1690)]));
    expect(post.text).toBe("PREZZO RIBASSATO //\n<b>Soar Phoenix 9-60GF solo trottola</b>\n<b>€16,90</b> invece di <s>€21,90</s> (-23%) · Disponibile");
  });

  it("never claims to be cheaper than anyone else", () => {
    const post = written(productPost({ kind: "price_drop", slugs: [PHOENIX], price: 1690, previousPrice: 2190 }, [at(PHOENIX, 1690)]));
    expect(post.text).not.toMatch(/più bass|miglior prezzo|imbattibil/i);
  });

  it("escapes a product name before it reaches Telegram's HTML", () => {
    const post = written(productPost({ kind: "new_product", slugs: [PHOENIX] }, [{ ...at(PHOENIX, 1690), name: "Phoenix <b>&</b> Wing" }]));
    expect(post.text).toContain("<b>Phoenix &lt;b&gt;&amp;&lt;/b&gt; Wing</b>");
  });
});

describe("a draft that stopped being true", () => {
  it("is refused when the piece sold out again", () => {
    expect(productPost({ kind: "back_in_stock", slugs: [PHOENIX] }, [at(PHOENIX, 1690, "esaurito")])).toEqual({
      ok: false,
      reason: "Soar Phoenix 9-60GF solo trottola è di nuovo esaurito",
    });
  });

  it("is refused when the price went back up", () => {
    const result = productPost({ kind: "price_drop", slugs: [PHOENIX], price: 1690, previousPrice: 2190 }, [at(PHOENIX, 2190)]);
    expect(result).toEqual({ ok: false, reason: "il prezzo di Soar Phoenix 9-60GF solo trottola è risalito" });
  });

  it("is refused when the product left the catalogue", () => {
    expect(productPost({ kind: "new_product", slugs: ["non-esiste"] }, [at(PHOENIX, 1690)])).toEqual({ ok: false, reason: "il prodotto non è più a catalogo" });
  });

  it("follows the price further down", () => {
    const post = written(productPost({ kind: "price_drop", slugs: [PHOENIX], price: 1690, previousPrice: 2190 }, [at(PHOENIX, 1590)]));
    expect(post.text).toContain("<b>€15,90</b> invece di <s>€21,90</s> (-27%)");
  });
});

describe("tier list and video posts", () => {
  it("names the month, the title and the first three blades, and no source", () => {
    const post = metaPost({ month: "2026-11", title: "Il meta di novembre", topBlades: ["Shark Scale", "Aero Pegasus", "Knight Shield V2", "Cobalt Dragoon"] });
    expect(post.text).toBe("META // novembre 2026\n<b>Il meta di novembre</b>\nTop blade: 1. Shark Scale · 2. Aero Pegasus · 3. Knight Shield V2");
    expect(post.link).toEqual({ label: "Apri la tier list", url: "https://geardropshop.it/meta/2026-11?utm_source=telegram&utm_medium=social&utm_campaign=news" });
    expect(post.photoUrl).toBeUndefined();
  });

  it("links a new upload", () => {
    const post = videoPost({ title: "Knight Shield V2 <test>", url: "https://www.youtube.com/watch?v=ugcBV-vcyuQ" });
    expect(post.text).toBe("NUOVO VIDEO // @GengisChad\n<b>Knight Shield V2 &lt;test&gt;</b>");
    expect(post.link).toEqual({ label: "Guarda su YouTube", url: "https://www.youtube.com/watch?v=ugcBV-vcyuQ" });
  });
});

describe("drafts and their buttons", () => {
  const post = videoPost({ title: "Video", url: "https://www.youtube.com/watch?v=ugcBV-vcyuQ" });

  it("marks a draft as a draft and says where it would go", () => {
    expect(asDraft(post, "@geardropnews").text).toBe(`<i>Bozza per @geardropnews: esce solo se tocchi Pubblica.</i>\n\n${post.text}`);
  });

  it("gives the draft the two answers above the channel's own button", () => {
    expect(draftKeyboard(12, post)).toEqual([
      [
        { text: "Pubblica", callback_data: "gd:p:12" },
        { text: "Scarta", callback_data: "gd:x:12" },
      ],
      [{ text: "Guarda su YouTube", url: "https://www.youtube.com/watch?v=ugcBV-vcyuQ" }],
    ]);
    expect(postKeyboard(post)).toEqual([[{ text: "Guarda su YouTube", url: "https://www.youtube.com/watch?v=ugcBV-vcyuQ" }]]);
  });

  it("reads back only its own buttons", () => {
    expect(parseDraftAction("gd:p:12")).toEqual({ action: "publish", draftId: 12 });
    expect(parseDraftAction("gd:x:7")).toEqual({ action: "discard", draftId: 7 });
    expect(parseDraftAction("gd:p:12; drop table")).toBeNull();
    expect(parseDraftAction("publish:12")).toBeNull();
    expect(parseDraftAction(undefined)).toBeNull();
  });

  it("tags shop links so an order from the channel says so", () => {
    expect(shopLink("/meta")).toBe("https://geardropshop.it/meta?utm_source=telegram&utm_medium=social&utm_campaign=news");
  });
});

describe("the bot's settings", () => {
  // Built here rather than written out, so nothing in the repository has the shape of a real token.
  const token = `${"1".repeat(10)}:${"x".repeat(35)}`;

  it("is off until the token and the owner's chat are both there", () => {
    expect(readTelegramConfig({})).toBeNull();
    expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: token })).toBeNull();
    expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: "non-un-token", TELEGRAM_OWNER_CHAT_ID: "123456789" })).toBeNull();
  });

  it("rehearses in the owner's chat while there is no channel", () => {
    expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_OWNER_CHAT_ID: " 123456789 " })).toEqual({
      token,
      ownerChatId: "123456789",
      channelId: null,
      webhookSecret: null,
    });
  });

  it("takes a public channel by name or a private one by id", () => {
    const base = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_OWNER_CHAT_ID: "123456789" };
    expect(readTelegramConfig({ ...base, TELEGRAM_CHANNEL_ID: "@geardropnews" })?.channelId).toBe("@geardropnews");
    expect(readTelegramConfig({ ...base, TELEGRAM_CHANNEL_ID: "-1001234567890" })?.channelId).toBe("-1001234567890");
    expect(readTelegramConfig({ ...base, TELEGRAM_CHANNEL_ID: "https://t.me/geardropnews" })?.channelId).toBeNull();
    expect(channelPostUrl("@geardropnews", 42)).toBe("https://t.me/geardropnews/42");
    expect(channelPostUrl("-1001234567890", 42)).toBeNull();
    expect(channelPostUrl(null, 42)).toBeNull();
  });
});

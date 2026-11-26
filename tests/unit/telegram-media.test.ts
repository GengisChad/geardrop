import { afterEach, describe, expect, it, vi } from "vitest";
import { productClips } from "@/data/assets";
import { PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";
import { createTelegramGateway } from "@/lib/telegram/api";
import { asDraft, channelPreorderPost, productPost, type TelegramPost } from "@/lib/telegram/messages";

/**
 * What goes out with a post: the product's clip when the shop made one (scripts/clips), and its
 * packshot. A clip shows no price and no availability; the caption under it carries them.
 */

const withClip = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;
const withoutClip = PRODUCTS.find((product) => !productClips[product.slug] && !product.bundleOf && !product.variant && product.images.length > 0)!;
const onSale = (product: Product): Product => ({ ...product, stock: "disponibile", availableQuantity: 5 });

function postOf(product: Product): TelegramPost {
  const result = productPost({ kind: "new_product", slugs: [product.slug] }, [onSale(product)]);
  if (!result.ok) throw new Error(result.reason);
  return result.post;
}

describe("what a post shows", () => {
  it("is the product's clip when it has one, with the packshot behind it", () => {
    const post = postOf(withClip);
    expect(post.videoUrl).toBe("https://geardropshop.it/video/products/glory-valkerion-lf.mp4");
    expect(post.photoUrl).toMatch(/^https:\/\/geardropshop\.it\//);
    // The price and the availability are the caption's, read from the shop.
    expect(post.text).toContain("Disponibile");
  });

  it("is the packshot alone for a product without a clip", () => {
    const post = postOf(withoutClip);
    expect(post.videoUrl).toBeUndefined();
    expect(post.photoUrl).toMatch(/^https:\/\/geardropshop\.it\//);
  });

  it("is the same for a pre-order taken on Telegram only, and for its draft", () => {
    const hidden: Product = { ...withClip, stock: "pre-ordine", availableQuantity: 20, channelOnly: true };
    const result = channelPreorderPost({ slugs: [hidden.slug] }, [hidden], "GearDropNewsBot", "stripe");
    if (!result.ok) throw new Error(result.reason);
    expect(result.post.videoUrl).toBe("https://geardropshop.it/video/products/glory-valkerion-lf.mp4");
    expect(asDraft(result.post, "@geardropshop").videoUrl).toBe(result.post.videoUrl);
  });
});

describe("sending a post to Telegram", () => {
  // Built here rather than written out, so nothing in the repository has the shape of a real token.
  const token = `${"1".repeat(10)}:${"x".repeat(35)}`;
  const post: TelegramPost = {
    text: "NUOVO ARRIVO //\n<b>Glory Valkerion LF</b>",
    videoUrl: "https://geardropshop.it/video/products/glory-valkerion-lf.mp4",
    photoUrl: "https://geardropshop.it/products/glory-valkerion-lf.webp",
    link: { label: "Vedi nello shop", url: "https://geardropshop.it/prodotto/glory-valkerion-lf" },
  };

  /** A Telegram that refuses the methods named in `refused`. */
  function telegram(refused: readonly string[] = []) {
    const calls: { readonly method: string; readonly body: Record<string, unknown> }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const method = String(url).split("/").at(-1)!;
      calls.push({ method, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return refused.includes(method)
        ? new Response(JSON.stringify({ ok: false, description: "Bad Request: failed to get HTTP URL content" }), { status: 400 })
        : new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    }) as typeof fetch;
    const gateway = createTelegramGateway({ token, ownerChatId: "111222333", channelId: "@geardropshop", webhookSecret: null }, fetcher);
    return { calls, gateway };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the clip, with the words as its caption and the button under it", async () => {
    const { calls, gateway } = telegram();
    const keyboard = [[{ text: "Vedi nello shop", url: post.link.url }]];
    expect(await gateway.sendPost("@geardropshop", post, keyboard)).toBe(42);
    expect(calls.map((call) => call.method)).toEqual(["sendVideo"]);
    expect(calls[0]!.body).toMatchObject({
      chat_id: "@geardropshop",
      video: post.videoUrl,
      caption: post.text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  });

  it("sends the packshot when Telegram cannot take the clip, and the words alone when it takes neither", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const noVideo = telegram(["sendVideo"]);
    expect(await noVideo.gateway.sendPost("@geardropshop", post, [])).toBe(42);
    expect(noVideo.calls.map((call) => call.method)).toEqual(["sendVideo", "sendPhoto"]);

    const noMedia = telegram(["sendVideo", "sendPhoto"]);
    expect(await noMedia.gateway.sendPost("@geardropshop", post, [])).toBe(42);
    expect(noMedia.calls.map((call) => call.method)).toEqual(["sendVideo", "sendPhoto", "sendMessage"]);
    expect(noMedia.calls[2]!.body).toMatchObject({ text: post.text });
  });

  it("never asks for a clip the post does not have", async () => {
    const { calls, gateway } = telegram();
    const still: TelegramPost = { text: post.text, photoUrl: post.photoUrl!, link: post.link };
    await gateway.sendPost("@geardropshop", still, []);
    expect(calls.map((call) => call.method)).toEqual(["sendPhoto"]);
  });
});

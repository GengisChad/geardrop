/**
 * «Che bey compro?» (owner, 2026-11-27): three questions, one build to buy now from the month's
 * tier list, the cart filled with one tap. The answers live in the buttons: nothing is kept.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";
import type { TelegramGateway } from "@/lib/telegram/api";
import { advisorQuestion, advisorResult, parseAdvisorAction, pickBuild, type AdvisorMeta } from "@/lib/telegram/bey-advisor";
import { handleUpdate, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import type { InlineKeyboard } from "@/lib/telegram/messages";
import { cartLinkPieces } from "@/lib/telegram/preorder-rules";

const piece = (slug: string, overrides: Partial<Product> = {}): Product => ({ ...PRODUCTS.find((product) => product.slug === slug)!, stock: "disponibile", availableQuantity: 5, ...overrides });

const wizard = piece("wand-wizard-1-60r", { bladeType: "stamina" });
const hammer = piece("hammer-incendio-3-70h");
const glory = piece("glory-valkerion-lf", { bladeType: "attacco" });
const cobalt = piece("cobalt-dragoon-2-60c", { bladeType: "attacco" });
const launcherCheap = { ...piece("glory-valkerion-lf"), slug: "lanciatore-corda", name: "Lanciatore a corda", category: "lanciatori" as const, price: { amount: 1299, currency: "EUR" as const } };
const catalogue = [wizard, hammer, glory, cobalt, launcherCheap];

const meta: AdvisorMeta = {
  month: "2026-11",
  rankings: [
    { tierType: "blade", rank: 1, pieceName: "Shark Scale", productSlug: null, archetype: "3-60 Narrow" },
    { tierType: "blade", rank: 2, pieceName: "Wizard Rod", productSlug: "wand-wizard-1-60r", archetype: "1-60 Hexa" },
    { tierType: "blade", rank: 3, pieceName: "Glory Valkyrie", productSlug: "glory-valkerion-lf", archetype: "Kick" },
    { tierType: "blade", rank: 6, pieceName: "Cobalt Dragoon", productSlug: "cobalt-dragoon-2-60c", archetype: "9-60 Elevate" },
    { tierType: "bit", rank: 1, pieceName: "Hexa", productSlug: "hammer-incendio-3-70h", archetype: "47,5% dei deck" },
  ],
};

describe("the three questions", () => {
  it("asks how you play, then the budget, then the launcher, carrying the answers in the buttons", () => {
    expect(advisorQuestion({})!.text).toContain("1 di 3\nCome vuoi giocare?");
    const second = advisorQuestion(parseAdvisorAction("gd:b:a")!)!;
    expect(second.keyboard[0]!.map((button) => ("callback_data" in button ? button.callback_data : ""))).toEqual(["gd:b:a1", "gd:b:a2", "gd:b:a3"]);
    const third = advisorQuestion(parseAdvisorAction("gd:b:a2")!)!;
    expect(third.keyboard[0]!.map((button) => ("callback_data" in button ? button.callback_data : ""))).toEqual(["gd:b:a2y", "gd:b:a2n"]);
    expect(advisorQuestion(parseAdvisorAction("gd:b:a2n")!)).toBeNull();
  });

  it("reads only its own buttons, each under Telegram's 64 bytes", () => {
    expect(parseAdvisorAction("gd:b:")).toEqual({});
    expect(parseAdvisorAction("gd:b:s3y")).toEqual({ style: "s", budget: "3", needsLauncher: false });
    expect(parseAdvisorAction("gd:b:z")).toBeNull();
    expect(parseAdvisorAction("gd:o:1:paid")).toBeNull();
  });
});

describe("the build", () => {
  it("takes the best-placed blade the shop sells for the style, and the piece its podium combo needs", () => {
    const build = pickBuild({ style: "s", budget: "2", needsLauncher: false }, catalogue, meta)!;
    expect(build.main.slug).toBe("wand-wizard-1-60r");
    expect(build.parts).toEqual([{ product: hammer, piece: "Hexa" }]);
    expect(build.totalCents).toBe(wizard.price.amount + hammer.price.amount);
  });

  it("skips a blade the shop does not sell, and one sold out", () => {
    expect(pickBuild({ style: "x", budget: "3", needsLauncher: false }, catalogue, meta)!.main.slug).toBe("wand-wizard-1-60r");
    const soldOut = catalogue.map((product) => (product.slug === wizard.slug ? { ...product, stock: "esaurito" as const, availableQuantity: 0 } : product));
    expect(pickBuild({ style: "x", budget: "3", needsLauncher: false }, soldOut, meta)!.main.slug).toBe("glory-valkerion-lf");
  });

  it("keeps the whole build within the budget, launcher included", () => {
    const tight = pickBuild({ style: "a", budget: "1", needsLauncher: true }, catalogue, meta);
    // Glory 19,99 + launcher 12,99 is over 25 €; nothing fits.
    expect(tight).toBeNull();
    const roomy = pickBuild({ style: "a", budget: "2", needsLauncher: true }, catalogue, meta)!;
    expect(roomy.main.slug).toBe("glory-valkerion-lf");
    expect(roomy.launcher?.slug).toBe("lanciatore-corda");
    expect(roomy.totalCents).toBeLessThanOrEqual(5000);
  });

  it("never sells a piece kept off the shop", () => {
    const hidden = catalogue.map((product) => (product.slug === hammer.slug ? { ...product, channelOnly: true as const } : product));
    expect(pickBuild({ style: "s", budget: "3", needsLauncher: false }, hidden, meta)!.parts).toEqual([]);
  });
});

describe("the answer", () => {
  it("names the build, the podium place and the combo, never the source, and fills the cart in one tap", () => {
    const { text, keyboard } = advisorResult({ style: "s", budget: "2", needsLauncher: false }, catalogue, meta);
    expect(text).toContain("<b>LA MIA SCELTA //</b>");
    expect(text).toContain("La sua lama è la n. 2 sui podi di novembre, quasi sempre montata 1-60 Hexa.");
    expect(text).toContain(`+ <b>${hammer.name}</b>`);
    expect(text).toContain("per Hexa");
    expect(text).not.toMatch(/beycrate|beywatch|wbo|fonte/i);
    expect(keyboard[0]).toEqual([{ text: "Metti tutto nel carrello", url: expect.stringContaining("/carrello?aggiungi=wand-wizard-1-60r%2Chammer-incendio-3-70h") }]);
    expect(keyboard[1]).toEqual([{ text: "Rifai le domande", callback_data: "gd:b:" }]);
  });

  it("says so when nothing fits, with a way to try again", () => {
    const { text, keyboard } = advisorResult({ style: "d", budget: "1", needsLauncher: false }, catalogue, meta);
    expect(text).toContain("oggi non ho un pezzo da podio disponibile");
    expect(keyboard[0]).toEqual([{ text: "Rifai le domande", callback_data: "gd:b:" }]);
  });

  it("puts every piece of the link in the cart, one each", () => {
    expect(cartLinkPieces("?aggiungi=wand-wizard-1-60r,hammer-incendio-3-70h&utm_source=telegram")).toEqual([
      { slug: "wand-wizard-1-60r", quantity: 1 },
      { slug: "hammer-incendio-3-70h", quantity: 1 },
    ]);
    expect(cartLinkPieces("?aggiungi=glory-valkerion-lf&q=2")).toEqual([{ slug: "glory-valkerion-lf", quantity: 2 }]);
    expect(cartLinkPieces("?aggiungi=a,<script>,a")).toEqual([{ slug: "a", quantity: 1 }]);
  });
});

describe("in the bot", () => {
  function world() {
    const sent: { chatId: string; text: string; keyboard?: InlineKeyboard | undefined }[] = [];
    const telegram: TelegramGateway = {
      sendPost: async () => 1,
      sendText: async (chatId, text, keyboard) => {
        sent.push({ chatId, text, keyboard });
        return 1;
      },
      setKeyboard: async () => true,
      deleteMessage: async () => true,
      answerInline: async () => true,
      answerCallback: async () => {},
    };
    const writes: unknown[] = [];
    const store: NewsStore = {
      readMemory: async () => new Map(),
      writeMemory: async (entries) => {
        writes.push(entries);
      },
      addDrafts: async () => 0,
      unsentDrafts: async () => [],
      claimSending: async () => false,
      markSent: async () => {},
      forgetSent: async () => 0,
      claimDecision: async () => null,
      finish: async () => {},
    };
    const deps: NewsDeps = {
      store,
      telegram,
      ownerChatId: "111222333",
      channelId: "@geardropshop",
      now: () => new Date("2026-11-27T10:00:00.000Z"),
      loadProducts: async () => catalogue,
      loadMetaMonths: async () => [],
      loadMeta: async () => null,
      loadRankings: async () => meta,
    };
    const write = (text: string) => handleUpdate({ message: { chat: { id: 444555666, type: "private" }, from: { id: 444555666 }, text } }, deps);
    const tap = (data: string) => handleUpdate({ callback_query: { id: "cb", from: { id: 444555666 }, data } }, deps);
    return { sent, writes, write, tap };
  }

  it("walks anyone from /bey to a full cart, and keeps nothing", async () => {
    const { sent, writes, write, tap } = world();
    expect(await write("/bey")).toBe("advisor");
    expect(sent.at(-1)!.text).toContain("Come vuoi giocare?");
    await tap("gd:b:s");
    await tap("gd:b:s2");
    expect(await tap("gd:b:s2y")).toBe("advisor");
    expect(sent.at(-1)!.chatId).toBe("444555666");
    expect(sent.at(-1)!.text).toContain("LA MIA SCELTA");
    expect(writes).toEqual([]);
  });

  it("starts from a link too, and tells a stranger about it", async () => {
    const { sent, write } = world();
    expect(await write("/start bey")).toBe("advisor");
    await write("/start");
    expect(sent.at(-1)!.text).toBe("Le news di GEAR//DROP escono sul canale @geardropshop.\nNon sai cosa comprare? Scrivi /bey.");
  });
});

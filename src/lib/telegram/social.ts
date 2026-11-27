import { z } from "zod";
import type { NewsEvent, SocialPayload } from "./news";

/**
 * What `pnpm telegram social` asks of the site: a picture or clip Telegram already holds (uploaded to
 * the owner's chat by the script), the product it sells or the shop page it shows, and the words that
 * went with it on Instagram. Everything else in the post is written from the shop when it goes out.
 *
 * Only shapes are checked here; whether the product exists is the route's question, against the
 * catalogue the shop serves.
 */

const SLUG = /^[a-z0-9-]{1,80}$/;
/** A page of the shop: a path, with an optional simple query ("/negozio?sort=novita"). */
const PATH = /^\/[a-z0-9\-/]{0,120}(\?[a-z0-9=&\-]{0,120})?$/;
const FILE_ID = /^[A-Za-z0-9_-]{10,250}$/;
const UNIQUE_ID = /^[A-Za-z0-9_-]{6,64}$/;
/** A Telegram caption holds 1024 characters; the shop's lines and the draft's header need the rest. */
export const SOCIAL_NOTE_MAX = 400;

const request = z.object({
  slug: z.string().regex(SLUG).nullish(),
  path: z.string().regex(PATH).nullish(),
  note: z.string().max(2000).nullish(),
  media: z.object({
    type: z.enum(["photo", "video"]),
    fileId: z.string().regex(FILE_ID),
    uniqueId: z.string().regex(UNIQUE_ID),
  }),
});

export type SocialRequest = { readonly ok: true; readonly event: NewsEvent & { readonly payload: SocialPayload } } | { readonly ok: false; readonly reason: string };

export function parseSocialRequest(body: unknown): SocialRequest {
  const parsed = request.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "richiesta non valida" };
  const { slug, path, media } = parsed.data;
  const note = parsed.data.note?.trim() || null;
  if (note && note.length > SOCIAL_NOTE_MAX) return { ok: false, reason: `il testo supera i ${SOCIAL_NOTE_MAX} caratteri` };
  if (!slug && !note) return { ok: false, reason: "senza prodotto serve un testo" };
  const payload: SocialPayload = { kind: "social_post", slug: slug ?? null, path: slug ? null : (path ?? null), note, media };
  // The same picture sent twice for the same product is one draft.
  return { ok: true, event: { eventKey: `social:${media.uniqueId}:${slug ?? path ?? "shop"}`, payload } };
}

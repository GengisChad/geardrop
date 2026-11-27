/**
 * What kind of Telegram message a file goes out as, from its name: a picture or a clip. Kept free of
 * imports, because the command-line script (scripts/telegram.ts) runs it outside the app.
 *
 * Telegram takes pictures up to 10 MB and clips up to 50 MB from a bot.
 */
export const SOCIAL_LIMITS = { photo: 10 * 1024 * 1024, video: 50 * 1024 * 1024 } as const;

export function socialMediaType(fileName: string): "photo" | "video" | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp") return "photo";
  if (extension === "mp4" || extension === "mov") return "video";
  return null;
}

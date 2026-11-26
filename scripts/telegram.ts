import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { callTelegram, readTelegramConfig } from "../src/lib/telegram/api";
import { PRODUCTION_ORIGIN } from "../src/lib/site-url";

/**
 * Sets up and tries the Telegram news bot (docs/operations/telegram-news-bot.md).
 *
 *   pnpm telegram check             who the bot is and what is configured, with no secret printed
 *   pnpm telegram link              after writing /start to the bot: saves your chat in .env.local
 *   pnpm telegram webhook set       tells Telegram to call the live site (creates the webhook secret)
 *   pnpm telegram webhook info      where Telegram is calling now, and its last error
 *   pnpm telegram webhook delete    stops the calls (needed before `poll`)
 *   pnpm telegram poll [url]        local trial: hands Telegram's updates to a dev server
 *
 * The token, the chat id and the webhook secret are read from and written to .env.local only.
 * Nothing here prints them: a terminal is shared, pasted and screenshotted more often than a file.
 */

const ENV_FILE = ".env.local";
const WEBHOOK_PATH = "/api/telegram/webhook";
const UPDATES = ["message", "callback_query"];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Sets one variable in .env.local, replacing its line if it is already there. */
function saveEnv(name: string, value: string): void {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const next = pattern.test(current) ? current.replace(pattern, line) : `${current}${current === "" || current.endsWith("\n") ? "" : "\n"}${line}\n`;
  writeFileSync(ENV_FILE, next, "utf8");
  process.env[name] = value;
}

function token(): string {
  const value = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  if (!value) fail(`Manca TELEGRAM_BOT_TOKEN in ${ENV_FILE}: è il token che ti dà @BotFather quando crei il bot.`);
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(value)) fail("TELEGRAM_BOT_TOKEN non ha la forma di un token di @BotFather: ricopialo per intero.");
  return value;
}

async function ask<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const result = await callTelegram<T>(token(), method, payload);
  if (!result.ok) fail(`Telegram ha risposto a ${method}: ${result.description}`);
  return result.result;
}

type Chat = { readonly id: number; readonly type: string; readonly first_name?: string; readonly username?: string; readonly title?: string };
type Update = { readonly update_id: number; readonly message?: { readonly chat: Chat; readonly text?: string } };
type WebhookInfo = { readonly url: string; readonly pending_update_count: number; readonly last_error_message?: string; readonly last_error_date?: number };

async function check(): Promise<void> {
  const me = await ask<{ readonly username: string; readonly first_name: string }>("getMe");
  console.log(`Bot: ${me.first_name} (@${me.username})`);
  const config = readTelegramConfig();
  console.log(`Chat del proprietario: ${config ? "impostata" : "manca (scrivi /start al bot, poi pnpm telegram link)"}`);
  if (config?.channelId) {
    const chat = await callTelegram<Chat>(config.token, "getChat", { chat_id: config.channelId });
    console.log(chat.ok ? `Canale: ${chat.result.title ?? "trovato"}` : `Canale: il bot non lo vede (${chat.description}). Aggiungilo come amministratore.`);
  } else {
    console.log("Canale: nessuno. «Pubblica» manda il post nella tua chat, come prova.");
  }
  console.log(`Segreto del webhook: ${config?.webhookSecret ? "impostato" : "manca (lo crea pnpm telegram webhook set)"}`);
  const info = await ask<WebhookInfo>("getWebhookInfo");
  console.log(`Webhook: ${info.url || "non impostato"}`);
}

async function link(argv: readonly string[]): Promise<void> {
  const info = await ask<WebhookInfo>("getWebhookInfo");
  if (info.url) fail("Il webhook è attivo, quindi Telegram non mi mostra i messaggi: fai prima pnpm telegram webhook delete, poi rimettilo con webhook set.");
  const updates = await ask<readonly Update[]>("getUpdates", { allowed_updates: ["message"], timeout: 0 });
  const people = new Map<number, Chat>();
  for (const update of updates) {
    const chat = update.message?.chat;
    if (chat?.type === "private") people.set(chat.id, chat);
  }
  if (people.size === 0) fail("Nessun messaggio privato al bot: apri il bot su Telegram, scrivi /start e rilancia.");

  const wanted = argv.find((arg) => arg.startsWith("--user="))?.slice("--user=".length).replace(/^@/, "").toLowerCase();
  const matches = [...people.values()].filter((chat) => !wanted || chat.username?.toLowerCase() === wanted);
  const name = (chat: Chat) => `${chat.first_name ?? "?"}${chat.username ? ` (@${chat.username})` : ""}`;
  if (matches.length !== 1) {
    // More than one account wrote to the bot: the owner says which one is his, by its username.
    fail(`Hanno scritto al bot: ${[...people.values()].map(name).join(", ")}. Rilancia con --user=<il tuo username>.`);
  }
  saveEnv("TELEGRAM_OWNER_CHAT_ID", String(matches[0]!.id));
  console.log(`Fatto: le bozze andranno a ${name(matches[0]!)}. TELEGRAM_OWNER_CHAT_ID è in ${ENV_FILE}; copialo anche su Vercel.`);
}

async function webhook(action: string | undefined, argv: readonly string[]): Promise<void> {
  if (action === "info") {
    const info = await ask<WebhookInfo>("getWebhookInfo");
    console.log(`Webhook: ${info.url || "non impostato"}`);
    console.log(`Aggiornamenti in coda: ${info.pending_update_count}`);
    if (info.last_error_message) console.log(`Ultimo errore: ${info.last_error_message} (${new Date((info.last_error_date ?? 0) * 1000).toISOString()})`);
    return;
  }
  if (action === "delete") {
    await ask("deleteWebhook", { drop_pending_updates: false });
    console.log("Webhook tolto: Telegram non chiama più il sito.");
    return;
  }
  if (action !== "set") fail("Uso: pnpm telegram webhook set|info|delete");

  const origin = argv.find((arg) => arg.startsWith("--origin="))?.slice("--origin=".length) ?? PRODUCTION_ORIGIN;
  if (!/^https:\/\//.test(origin)) fail("Telegram chiama solo indirizzi https.");
  let secret = process.env["TELEGRAM_WEBHOOK_SECRET"]?.trim();
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    saveEnv("TELEGRAM_WEBHOOK_SECRET", secret);
    console.log(`Ho creato TELEGRAM_WEBHOOK_SECRET in ${ENV_FILE}: mettilo uguale su Vercel e ripubblica, altrimenti il sito rifiuta Telegram.`);
  }
  await ask("setWebhook", { url: `${origin}${WEBHOOK_PATH}`, secret_token: secret, allowed_updates: UPDATES, drop_pending_updates: true });
  console.log(`Webhook impostato: ${origin}${WEBHOOK_PATH}`);
}

/** Long-polls Telegram and hands each update to a local dev server, which has no public address. */
async function poll(target: string): Promise<void> {
  const config = readTelegramConfig();
  if (!config) fail(`Mancano TELEGRAM_BOT_TOKEN o TELEGRAM_OWNER_CHAT_ID in ${ENV_FILE}.`);
  if (!config.webhookSecret) fail(`Manca TELEGRAM_WEBHOOK_SECRET in ${ENV_FILE}: una stringa qualsiasi basta per la prova in locale.`);
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(target)) fail("poll consegna solo a un server locale (http://localhost:...).");
  const info = await ask<WebhookInfo>("getWebhookInfo");
  if (info.url) fail("Il webhook è attivo: Telegram consegna già al sito. Per provare in locale fai prima pnpm telegram webhook delete.");

  console.log(`In ascolto. Consegno a ${target} (Ctrl+C per fermare).`);
  let offset = 0;
  for (;;) {
    const result = await callTelegram<readonly Update[]>(config.token, "getUpdates", { offset, timeout: 10, allowed_updates: UPDATES });
    if (!result.ok) {
      console.error(`getUpdates: ${result.description}`);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      continue;
    }
    for (const update of result.result) {
      offset = update.update_id + 1;
      const response = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": config.webhookSecret },
        body: JSON.stringify(update),
      }).catch(() => null);
      const body = response ? ((await response.json().catch(() => ({}))) as { readonly result?: string }) : {};
      console.log(`aggiornamento ${update.update_id}: ${response ? `${response.status} ${body.result ?? ""}` : "il server locale non risponde"}`);
    }
  }
}

async function main(argv: readonly string[]): Promise<void> {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // No file: the variables may still come from the shell environment.
  }
  const [command, ...rest] = argv;
  switch (command) {
    case "check":
      return check();
    case "link":
      return link(rest);
    case "webhook":
      return webhook(rest[0], rest.slice(1));
    case "poll":
      return poll(rest[0] ?? `http://localhost:3000${WEBHOOK_PATH}`);
    default:
      fail("Uso: pnpm telegram check | link [--user=<username>] | webhook set|info|delete | poll [url]");
  }
}

void main(process.argv.slice(2));

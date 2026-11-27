import "server-only";

import { storefrontOrganizationId } from "@/lib/org/storefront";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { createTelegramGateway, readTelegramConfig } from "./api";
import { tellFollowers, type FollowContext, type OrderUpdate } from "./order-follow";
import { createSupabaseOrderFollowStore } from "./supabase-order-follow-store";

/** «Segui su Telegram» at work; without a configured bot nothing happens. */
export function createFollowContext(): FollowContext | null {
  const config = readTelegramConfig();
  if (!config) return null;
  return {
    telegram: createTelegramGateway(config),
    store: createSupabaseOrderFollowStore(createPrivilegedSupabaseClient(), () => storefrontOrganizationId()),
    now: () => new Date(),
    secret: config.webhookSecret,
  };
}

/**
 * Tells the chats that follow an order what changed (shipped, an InPost step, delivered). The
 * buyer asked for these messages, like the emails, so they go on their own; a failure is logged
 * and never fails the shipment, the delivery or the InPost sync that called it.
 */
export async function tellOrderFollowers(orderId: number, update: OrderUpdate): Promise<void> {
  try {
    const context = createFollowContext();
    if (context) await tellFollowers(context, orderId, update);
  } catch (error) {
    console.error("[telegram-follow]", orderId, update.kind, error instanceof Error ? error.message : error);
  }
}

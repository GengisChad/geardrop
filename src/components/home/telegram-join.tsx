"use client";

import type { ReactNode } from "react";
import { sendGaEvent } from "@/lib/analytics/google";
import { TELEGRAM_CHANNEL_URL } from "@/lib/navigation";

/**
 * The link into the shop's Telegram channel. It opens Telegram itself on a phone and a new tab on
 * a computer. The tap is counted (GA4 `join_group`) with where it was made, and like every event
 * only for a visitor who accepted statistics.
 */
export function TelegramJoin({
  placement,
  className,
  children,
}: {
  readonly placement: "top" | "home" | "menu" | "product";
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <a
      href={TELEGRAM_CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`telegram-join-${placement}`}
      className={className}
      onClick={() => {
        sendGaEvent("join_group", { group_id: "telegram", placement });
      }}
    >
      {children}
    </a>
  );
}

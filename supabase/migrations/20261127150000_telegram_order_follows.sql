-- «Segui su Telegram» (2026-11-27): the chats that asked the bot, from a signed link in an
-- order's email, to be told when the parcel leaves, where InPost has it and when it arrives.
-- One row per order and chat; the server's key only. Rows go at delivery, at «Non seguire più»,
-- or 90 days after they were made, as the privacy notice says.

create table public.telegram_order_follows (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.orders(id) on delete cascade,
  chat_id     bigint not null,
  -- The last thing the chat was told: an order status or an InPost event code.
  last_told   text check (last_told is null or length(last_told) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint telegram_order_follows_order_chat_unique unique (order_id, chat_id)
);

create index telegram_order_follows_created_idx on public.telegram_order_follows (created_at);

alter table public.telegram_order_follows enable row level security;
revoke all on table public.telegram_order_follows from anon, authenticated;
grant select, insert, update, delete on table public.telegram_order_follows to service_role;

comment on table public.telegram_order_follows is
  'Telegram chats following an order (2026-11-27): chat id, order, last update told. Deleted at delivery, on request, or after 90 days. Server key only.';

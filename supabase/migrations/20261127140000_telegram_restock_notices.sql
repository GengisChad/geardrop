-- 2026-11-27, the owner: the bot features he liked, the second of them «Avvisami» on Telegram. On the
-- page of a sold-out or arriving product, next to the email form, a button opens the bot; when the
-- piece can be bought again the customer gets a private message with «Compra».
--
-- It uses the shop's own «Avvisami» list, restock_requests, so the back office's demand figures
-- (get_inventory_restock_demand) count a Telegram request like an email one. A request now names
-- exactly one way to reach the customer: an email, as before, or a Telegram chat. The bot writes
-- and deletes Telegram requests with the server's key; the storefront's email RPC is unchanged.

alter table public.restock_requests alter column email drop not null;
alter table public.restock_requests add column telegram_chat_id bigint;
alter table public.restock_requests add constraint restock_requests_one_channel
  check ((email is null) <> (telegram_chat_id is null));

-- One request per product and chat, like one per product and email.
create unique index restock_requests_slug_telegram_unique
  on public.restock_requests (organization_id, product_slug, telegram_chat_id)
  where telegram_chat_id is not null;

grant select, insert, delete on table public.restock_requests to service_role;

comment on column public.restock_requests.telegram_chat_id is
  'The Telegram chat that asked the bot for this notice (2026-11-27), when it was not asked by email.';

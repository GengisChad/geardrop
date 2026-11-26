-- 2026-11-26, the owner: a Telegram bot that publishes the shop's news on a channel (new arrivals,
-- pieces back in stock, lower prices, a new tier list, a new video). He chose "bozza + OK": the bot
-- shows him each piece of news in his private chat and publishes only what he taps "Pubblica" on.
--
-- The bot keeps two things, and neither is a second copy of the shop:
--
--   telegram_news_memory  what it saw the last time it looked (a product's availability and the
--                         prices it sold at over the last 30 days, the months of the tier lists,
--                         the ids of the videos), so it can tell what changed. A price or a stock
--                         printed in a post is never taken from here: it is read from the shop
--                         again when the post is written.
--   telegram_news_drafts  one row per piece of news, from draft to published or discarded.
--                         event_key is what makes the same news found twice one draft.
--
-- Like the newsletter list they belong to the Gear Drop storefront and carry no organization yet.
-- Only the server's own key (service_role) reaches them: there is no policy, so neither a visitor
-- nor a signed-in buyer or staff account can read what is about to be announced. New tables are
-- not exposed to the API roles unless granted (config.toml), hence the explicit grant.

create table public.telegram_news_memory (
  subject    text primary key check (length(subject) between 1 and 200),
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.telegram_news_drafts (
  id                 bigint generated always as identity primary key,
  event_key          text not null check (length(event_key) between 1 and 300),
  kind               text not null check (kind in ('new_product', 'back_in_stock', 'price_drop', 'meta_update', 'new_video')),
  payload            jsonb not null,
  status             text not null default 'draft' check (status in ('draft', 'publishing', 'published', 'discarded')),
  -- The draft's message in the owner's chat; 0 while it is being sent.
  owner_message_id   bigint,
  channel_message_id bigint,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint telegram_news_drafts_event_key_unique unique (event_key)
);

create index telegram_news_drafts_waiting_idx on public.telegram_news_drafts (id) where status = 'draft';

alter table public.telegram_news_memory enable row level security;
alter table public.telegram_news_drafts enable row level security;

revoke all on table public.telegram_news_memory from anon, authenticated;
revoke all on table public.telegram_news_drafts from anon, authenticated;

grant select, insert, update on table public.telegram_news_memory to service_role;
grant select, insert, update on table public.telegram_news_drafts to service_role;

comment on table public.telegram_news_memory is
  'What the Telegram news bot saw at its last look at the shop (2026-11-26). Not a source for any figure it publishes.';
comment on table public.telegram_news_drafts is
  'News the Telegram bot proposed to the owner: draft, publishing, published or discarded. Server key only.';

-- 2026-11-26, the owner: pre-orders taken on Telegram only. A product is loaded in the catalogue
-- but kept out of the shop until its pieces are on the shelf; the channel announces it, the buyer
-- reserves it in the bot's chat and pays at once, with PayPal.me or through the site's checkout.
-- "Ordino 30 pezzi, ne prendono 10 in pre-ordine, in magazzino ne tornano 20."
--
-- Three things:
--
--   1. The bot may draft a sixth kind of news, the pre-order that opens on the channel.
--   2. telegram_preorders: who reserved what in the bot's chat, with what a Locker parcel needs
--      (name, email, phone, Locker) and whether the owner has seen the PayPal.me payment. PayPal.me
--      tells nobody that a payment arrived, so "paid" is the owner's own tap. Server key only, like
--      the bot's other tables: it holds buyers' personal data and no policy opens it.
--   3. telegram_preorder_hold: the pieces are counted in one place, products.preorder_allocation,
--      which the site's checkout already takes from. A piece reserved on Telegram comes off that
--      number, so the site cannot sell it too; a reservation nobody paid gives it back.

alter table public.telegram_news_drafts drop constraint telegram_news_drafts_kind_check;
alter table public.telegram_news_drafts add constraint telegram_news_drafts_kind_check
  check (kind in ('new_product', 'back_in_stock', 'price_drop', 'channel_preorder', 'meta_update', 'new_video'));

create table public.telegram_preorders (
  id              bigint generated always as identity primary key,
  -- What the buyer writes in PayPal's note, so the owner can match the payment.
  code            text not null check (code ~ '^GDT-[A-Z2-9]{6}$'),
  chat_id         bigint not null,
  username        text check (username is null or length(username) <= 64),
  product_slug    text not null check (length(product_slug) between 1 and 120),
  product_name    text not null check (length(product_name) between 1 and 200),
  quantity        integer not null default 1 check (quantity between 1 and 10),
  unit_cents      integer not null default 0 check (unit_cents >= 0),
  shipping_cents  integer not null default 0 check (shipping_cents >= 0),
  total_cents     integer not null default 0 check (total_cents >= 0),
  buyer_name      text check (buyer_name is null or length(buyer_name) <= 80),
  email           text check (email is null or length(email) <= 320),
  phone           text check (phone is null or length(phone) <= 20),
  locker          jsonb,
  locker_options  jsonb not null default '[]'::jsonb,
  status          text not null default 'collecting'
                    check (status in ('collecting', 'awaiting_payment', 'paid', 'cancelled', 'expired')),
  step            text not null default 'quantity'
                    check (step in ('quantity', 'payment', 'name', 'email', 'phone', 'cap', 'locker', 'confirm')),
  -- Until when reserved pieces wait for their payment.
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint telegram_preorders_code_unique unique (code)
);

create index telegram_preorders_chat_idx on public.telegram_preorders (chat_id, status);
create index telegram_preorders_open_idx on public.telegram_preorders (status, expires_at)
  where status in ('awaiting_payment', 'paid');

alter table public.telegram_preorders enable row level security;
revoke all on table public.telegram_preorders from anon, authenticated;
grant select, insert, update on table public.telegram_preorders to service_role;

comment on table public.telegram_preorders is
  'Pre-orders taken in the Telegram bot''s chat (2026-11-26): the buyer''s shipping data and whether the owner saw the PayPal.me payment. Server key only.';

-- Takes p_quantity pieces off a pre-order's allocation, or gives them back when it is negative.
-- Returns the pieces left, or null when the product is not held as a pre-order or has too few:
-- the caller then reserves nothing.
create function public.telegram_preorder_hold(p_slug text, p_quantity integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  shop bigint := private.single_storefront_organization();
  pieces_left integer;
begin
  if p_slug is null or btrim(p_slug) = '' or p_quantity is null or p_quantity = 0 or abs(p_quantity) > 10 then
    raise exception using errcode = '22023', message = 'GD_TELEGRAM_PREORDER_INVALID_HOLD';
  end if;

  update public.products
  set preorder_allocation = preorder_allocation - p_quantity
  where organization_id = shop
    and slug = p_slug
    and availability_override = 'preorder'::public.availability_override
    and preorder_allocation - p_quantity >= 0
  returning preorder_allocation into pieces_left;

  return pieces_left;
end;
$$;

revoke all on function public.telegram_preorder_hold(text, integer) from public, anon, authenticated;
grant execute on function public.telegram_preorder_hold(text, integer) to service_role;

comment on function public.telegram_preorder_hold(text, integer) is
  'Reserves pieces of a Telegram pre-order against products.preorder_allocation (negative: gives them back). Null when there are not enough.';

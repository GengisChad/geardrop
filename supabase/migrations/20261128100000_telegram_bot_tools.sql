-- The Telegram bot's new jobs (owner, 2026-11-28: "fai il resto"): stock and prices moved from the
-- owner's chat, and customer support through the bot.
--
-- The back office's own functions (adjust_inventory, decide_pricing_proposal) ask for a signed-in
-- staff member. The bot works with the server's key and checks in code that the owner's own
-- Telegram account pressed the button, so these two variants run for the server's key only. Each
-- takes a request key, kept in telegram_owner_actions: a double tap on the same button moves the
-- stock or the price once. A refused request (too few pieces, a decided proposal) keeps no key, so
-- it can be tried again.

create table public.telegram_owner_actions (
  request_key text primary key check (length(request_key) between 1 and 120),
  created_at  timestamptz not null default now()
);

alter table public.telegram_owner_actions enable row level security;
revoke all on table public.telegram_owner_actions from anon, authenticated;
grant select, insert, delete on table public.telegram_owner_actions to service_role;

comment on table public.telegram_owner_actions is
  'Buttons the shop owner pressed in the Telegram bot that moved stock or a price (2026-11-28): one row per button, so a double tap acts once. Server key only.';

-- «/carico» in the owner's chat: the same manual adjustment the back office's Inventario page
-- records, with the bot named in the note and in the audit trail.
create function public.telegram_adjust_inventory(
  p_organization_id bigint,
  p_product_id bigint,
  p_delta integer,
  p_request_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_product public.products%rowtype;
  next_stock integer;
begin
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000 then
    raise exception using errcode = '22023', message = 'GD_INVALID_STOCK_DELTA';
  end if;
  insert into public.telegram_owner_actions (request_key) values (p_request_key) on conflict do nothing;
  if not found then
    return null;
  end if;
  select product.* into target_product from public.products as product
  where product.organization_id = p_organization_id and product.id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;
  next_stock := target_product.stock_quantity + p_delta;
  if next_stock < 0 then
    raise exception using errcode = '23514', message = 'GD_INSUFFICIENT_STOCK';
  end if;
  update public.products set stock_quantity = next_stock where id = target_product.id;
  insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
  values (target_product.id, p_delta, next_stock, 'manual_adjustment'::public.inventory_reason, null, 'Telegram: rettifica dal bot');
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_organization_id, null, 'inventory.adjusted', 'products', target_product.id::text,
    jsonb_build_object('sku', target_product.sku, 'stock_quantity', target_product.stock_quantity),
    jsonb_build_object('sku', target_product.sku, 'stock_quantity', next_stock, 'delta', p_delta,
      'reason', 'manual_adjustment', 'note', 'Telegram: rettifica dal bot', 'via', 'telegram'));
  return next_stock;
end;
$$;

revoke all on function public.telegram_adjust_inventory(bigint, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.telegram_adjust_inventory(bigint, bigint, integer, text) to service_role;

-- «Applica» on the Monday list of pieces that do not sell: the pricing agent's pending proposal,
-- approved as the back office's Prezzi page approves it. A proposal outside the owner's pricing
-- policy is refused here: those he decides in the panel, where the reasons are shown.
create function public.telegram_apply_pricing_proposal(
  p_organization_id bigint,
  p_proposal_id bigint,
  p_request_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.pricing_proposals%rowtype;
  product public.products%rowtype;
begin
  insert into public.telegram_owner_actions (request_key) values (p_request_key) on conflict do nothing;
  if not found then
    return null;
  end if;
  select proposal.* into target from public.pricing_proposals as proposal
  where proposal.id = p_proposal_id and proposal.organization_id = p_organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PROPOSAL_NOT_FOUND';
  end if;
  if target.status <> 'pending' then
    raise exception using errcode = '55000', message = 'GD_PROPOSAL_ALREADY_DECIDED';
  end if;
  if target.out_of_policy then
    raise exception using errcode = '22023', message = 'GD_PROPOSAL_OUT_OF_POLICY';
  end if;
  select existing.* into product from public.products as existing
  where existing.id = target.product_id and existing.organization_id = p_organization_id
  for update;
  update public.products set price_cents = target.proposed_price_cents where id = product.id;
  update public.pricing_proposals set status = 'approved', decided_by = null, decided_at = now(),
    applied_price_cents = target.proposed_price_cents, decision_note = 'Approvata dal bot Telegram'
  where id = target.id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_organization_id, null, 'pricing.proposal_approved', 'products', product.id::text,
    jsonb_build_object('price_cents', product.price_cents),
    jsonb_build_object('price_cents', target.proposed_price_cents, 'proposal_id', target.id,
      'proposed_price_cents', target.proposed_price_cents, 'via', 'telegram'));
  return target.proposed_price_cents;
end;
$$;

revoke all on function public.telegram_apply_pricing_proposal(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_apply_pricing_proposal(bigint, bigint, text) to service_role;

-- Assistance through the bot: a customer's message is copied into the owner's chat, and his reply
-- to that copy goes back to the customer. The bot keeps only which copy belongs to which chat (and
-- the order the chat named, when it came from «C'è un problema»), never the text: the messages stay
-- in Telegram. Rows go after 90 days, as the privacy notice says.
create table public.telegram_support_messages (
  id               bigint generated always as identity primary key,
  chat_id          bigint not null,
  owner_message_id bigint not null,
  order_id         bigint,
  created_at       timestamptz not null default now(),
  constraint telegram_support_messages_owner_message_unique unique (owner_message_id)
);

create index telegram_support_messages_chat_idx on public.telegram_support_messages (chat_id, created_at desc);
create index telegram_support_messages_created_idx on public.telegram_support_messages (created_at);

alter table public.telegram_support_messages enable row level security;
revoke all on table public.telegram_support_messages from anon, authenticated;
grant select, insert, update, delete on table public.telegram_support_messages to service_role;

comment on table public.telegram_support_messages is
  'Assistance through the Telegram bot (2026-11-28): which copy in the owner''s chat belongs to which customer chat, and the order it is about. No message text. Deleted after 90 days. Server key only.';

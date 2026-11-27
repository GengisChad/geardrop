-- Channel polls before buying (2026-11-27): the owner asks the bot for a poll on a piece, the poll
-- reaches the channel only on his «Pubblica», and its votes feed the back office's forecast.
-- A channel poll is anonymous: Telegram sends the bot the counts only, so nothing here names a
-- person. The server's key writes the table; staff read the results through the function below.

create table public.telegram_polls (
  id                  bigint generated always as identity primary key,
  -- The shop's product it is about, when the owner named one; otherwise only the subject.
  product_slug        text check (product_slug is null or product_slug ~ '^[a-z0-9-]{1,80}$'),
  subject             text not null check (length(subject) between 1 and 120),
  question            text not null check (length(question) between 1 and 300),
  options             jsonb not null check (jsonb_typeof(options) = 'array'),
  counts              jsonb not null default '[]'::jsonb check (jsonb_typeof(counts) = 'array'),
  total_voters        integer not null default 0 check (total_voters >= 0),
  status              text not null default 'draft' check (status in ('draft', 'open', 'closed', 'discarded')),
  -- Telegram's own id of the poll, and its message in the channel, once published.
  poll_id             text unique,
  channel_message_id  bigint,
  opened_at           timestamptz,
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.telegram_polls enable row level security;
revoke all on table public.telegram_polls from anon, authenticated;
grant select, insert, update on table public.telegram_polls to service_role;

comment on table public.telegram_polls is
  'Polls the owner published on the Telegram channel (2026-11-27): question, options and anonymous vote counts. Server key only; staff read get_telegram_poll_results.';

-- The published polls with their votes, for the forecast page. Owner and admin of the storefront
-- only, like the forecast itself; another company gets nothing, since the channel is Gear Drop's.
create function public.get_telegram_poll_results(p_organization_id bigint)
returns table (
  id bigint,
  product_id bigint,
  product_slug text,
  subject text,
  question text,
  options jsonb,
  counts jsonb,
  total_voters integer,
  status text,
  opened_at timestamptz,
  closed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_WAREHOUSE_MANAGER_REQUIRED');
  if p_organization_id is distinct from private.single_storefront_organization() then
    return;
  end if;
  return query
    select p.id, pr.id, p.product_slug, p.subject, p.question, p.options, p.counts, p.total_voters, p.status, p.opened_at, p.closed_at
    from public.telegram_polls p
    left join public.products pr on pr.organization_id = p_organization_id and pr.slug = p.product_slug
    where p.status in ('open', 'closed')
    order by p.opened_at desc nulls last
    limit 50;
end;
$$;

revoke all on function public.get_telegram_poll_results(bigint) from public, anon, authenticated;
grant execute on function public.get_telegram_poll_results(bigint) to authenticated;

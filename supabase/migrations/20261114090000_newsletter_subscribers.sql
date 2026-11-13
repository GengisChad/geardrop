-- 2026-11-13, the owner: as the shop opens, a banner asks visitors to sign up for news on stock and
-- arrivals ("Questo è solo il primo drop, iscriviti per le novità").
--
-- Double opt-in, as the Garante expects for marketing email: a signup stays pending until the
-- address confirms from the email it receives, and only confirmed rows that have not unsubscribed
-- may be written to. The consent text the visitor saw is kept with the row, as the proof of it.
--
-- Everything goes through the server's own key (service_role): anon gets neither the table nor the
-- functions, so nobody can read the list, learn a token, or confirm an address that is not theirs.
-- Owners and admins read the list in the admin.

create table public.newsletter_subscribers (
  id                   bigint generated always as identity primary key,
  email                text not null check (
                         length(email) between 3 and 320
                         and email ~ '^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$'
                       ),
  -- The secret in the confirm and unsubscribe links. A new one on every fresh signup.
  token                uuid not null default gen_random_uuid(),
  source               text not null default 'home' check (source ~ '^[a-z0-9-]{1,40}$'),
  consent_text         text not null check (length(consent_text) between 10 and 500),
  created_at           timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  confirmed_at         timestamptz,
  unsubscribed_at      timestamptz
);

create unique index newsletter_subscribers_email_unique on public.newsletter_subscribers (lower(email));
create unique index newsletter_subscribers_token_unique on public.newsletter_subscribers (token);

alter table public.newsletter_subscribers enable row level security;
revoke all on table public.newsletter_subscribers from anon, authenticated;
grant select on table public.newsletter_subscribers to authenticated;

create policy "staff can read newsletter subscribers"
  on public.newsletter_subscribers
  for select
  using ((select private.has_staff_role(array[
    'owner'::public.staff_role, 'admin'::public.staff_role
  ])));

comment on table public.newsletter_subscribers is
  'Newsletter signups from the shop (2026-11-13). Only rows with confirmed_at set and '
  'unsubscribed_at null may be emailed. Pending rows older than 30 days are dropped on the next signup.';

-- === Signup =====================================================================================
-- Returns the token to put in the confirmation email, or null when no email should go out: the
-- address is already confirmed, a confirmation went out less than a day ago (so the form cannot be
-- used to flood someone's inbox), or the pending list is full.

create or replace function public.newsletter_signup(
  p_email   text,
  p_source  text,
  p_consent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email  text := lower(btrim(coalesce(p_email, '')));
  clean_source text := coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'home');
  existing     public.newsletter_subscribers%rowtype;
  fresh_token  uuid;
begin
  if clean_email = ''
    or length(clean_email) > 320
    or clean_email !~ '^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$'
  then
    raise exception using errcode = '22023', message = 'GD_NEWSLETTER_INVALID_EMAIL';
  end if;
  if length(coalesce(p_consent, '')) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'GD_NEWSLETTER_CONSENT_REQUIRED';
  end if;

  -- Signups nobody confirmed within 30 days are not consent: they go.
  delete from public.newsletter_subscribers
  where confirmed_at is null
    and unsubscribed_at is null
    and coalesce(confirmation_sent_at, created_at) < now() - interval '30 days';

  select * into existing
  from public.newsletter_subscribers
  where lower(email) = clean_email
  for update;

  if not found then
    -- A flood of made-up addresses stops here; real signups never get near it.
    if (select count(*) from public.newsletter_subscribers where confirmed_at is null and unsubscribed_at is null) >= 5000 then
      return null;
    end if;
    insert into public.newsletter_subscribers (email, source, consent_text, confirmation_sent_at)
    values (clean_email, clean_source, p_consent, now())
    returning token into fresh_token;
    return fresh_token;
  end if;

  if existing.unsubscribed_at is not null then
    -- Back after leaving: a new consent, a new token, a new confirmation.
    update public.newsletter_subscribers
    set token = gen_random_uuid(),
        source = clean_source,
        consent_text = p_consent,
        confirmed_at = null,
        unsubscribed_at = null,
        confirmation_sent_at = now()
    where id = existing.id
    returning token into fresh_token;
    return fresh_token;
  end if;

  if existing.confirmed_at is not null then
    return null;
  end if;

  if existing.confirmation_sent_at is not null and existing.confirmation_sent_at > now() - interval '1 day' then
    return null;
  end if;

  update public.newsletter_subscribers
  set confirmation_sent_at = now(),
      consent_text = p_consent
  where id = existing.id
  returning token into fresh_token;
  return fresh_token;
end;
$$;

-- === Confirm and unsubscribe ====================================================================
-- Each answers 'done', 'already' or 'unknown', so the page can say the right thing.

create or replace function public.newsletter_confirm(p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_found public.newsletter_subscribers%rowtype;
begin
  select * into row_found from public.newsletter_subscribers where token = p_token for update;
  if not found or row_found.unsubscribed_at is not null then
    return 'unknown';
  end if;
  if row_found.confirmed_at is not null then
    return 'already';
  end if;
  update public.newsletter_subscribers set confirmed_at = now() where id = row_found.id;
  return 'done';
end;
$$;

create or replace function public.newsletter_unsubscribe(p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_found public.newsletter_subscribers%rowtype;
begin
  select * into row_found from public.newsletter_subscribers where token = p_token for update;
  if not found then
    return 'unknown';
  end if;
  if row_found.unsubscribed_at is not null then
    return 'already';
  end if;
  update public.newsletter_subscribers set unsubscribed_at = now() where id = row_found.id;
  return 'done';
end;
$$;

revoke all on function public.newsletter_signup(text, text, text) from public, anon, authenticated;
revoke all on function public.newsletter_confirm(uuid) from public, anon, authenticated;
revoke all on function public.newsletter_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.newsletter_signup(text, text, text) to service_role;
grant execute on function public.newsletter_confirm(uuid) to service_role;
grant execute on function public.newsletter_unsubscribe(uuid) to service_role;

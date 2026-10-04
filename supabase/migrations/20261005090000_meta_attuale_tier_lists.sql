-- META ATTUALE: the monthly tier list of the Beyblade X competitive meta, published on
-- /meta and archived at /meta/<month>.
--
-- This could not live in content_pages. That table takes markdown only, its check
-- constraint rejects raw HTML, and renderSafeMarkdown's allowed-tag list has no <table>,
-- so a GFM table is dropped on the way out without an error. A ranking is rows — a rank,
-- a piece, an archetype, a reason, somewhere to buy it — and rows are what the owner has
-- to reorder from the panel every month without touching a file.
--
-- Two deliberate choices:
--
--   product_slug is plain text with no foreign key to public.products. The storefront's
--   source of truth for what is on sale is src/data/catalog.ts, with Supabase supplying
--   live stock on top; a foreign key would make this table disagree with the catalogue
--   the moment the two drift. The admin action validates the slug against the catalogue
--   on save, and the page silently drops a slug the catalogue no longer knows.
--
--   A ranking entry may carry no product at all. The shop sells complete tops, not loose
--   bits and ratchets, so most bit and ratchet entries point at the top that contains the
--   piece — and the ones it cannot supply say so. Naming the pieces we do not sell is
--   what makes the page worth reading; a tier list that happens to match a catalogue is
--   an advert, and the audience it is written for can tell the difference.

create table public.meta_snapshots (
  id bigint primary key generated always as identity,
  -- Doubles as the archive slug: /meta/2026-10 for a month, /meta/2026-10-05 for a single
  -- week. The owner updates the meta weekly and the stock changes under it, so a key that
  -- only held a month would refuse the second update of the same one.
  month text not null unique,
  title text not null,
  -- Where the numbers come from, in the owner's words: "podi top 3 di 153 tornei WBO,
  -- 31 agosto - 27 settembre 2026". A tier list without its sample is an opinion.
  source_note text not null,
  intro text,
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  active boolean not null default false,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_snapshots_month_format check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?$'),
  constraint meta_snapshots_title_length check (char_length(title) between 1 and 160),
  constraint meta_snapshots_source_length check (char_length(source_note) between 1 and 400),
  constraint meta_snapshots_intro_length check (intro is null or char_length(intro) <= 2000),
  constraint meta_snapshots_seo_title_length check (seo_title is null or char_length(seo_title) <= 70),
  constraint meta_snapshots_seo_description_length check (seo_description is null or char_length(seo_description) <= 180),
  constraint meta_snapshots_publication_consistent check (published_at is null or publication_status = 'published')
);

create table public.meta_rankings (
  id bigint primary key generated always as identity,
  snapshot_id bigint not null references public.meta_snapshots(id) on delete cascade,
  tier_type text not null,
  rank integer not null,
  piece_name text not null,
  archetype text not null,
  reason text not null,
  -- Null means the catalogue cannot supply this piece; the page says so in as many words.
  product_slug text,
  -- The owner's own test of this piece, so a reader can watch it rather than take our word.
  video_url text,
  created_at timestamptz not null default now(),
  constraint meta_rankings_tier_type check (tier_type in ('blade', 'ratchet', 'bit')),
  constraint meta_rankings_rank_positive check (rank >= 1),
  constraint meta_rankings_piece_length check (char_length(piece_name) between 1 and 200),
  constraint meta_rankings_archetype_length check (char_length(archetype) between 1 and 100),
  constraint meta_rankings_reason_length check (char_length(reason) between 1 and 2000),
  constraint meta_rankings_product_slug_format check (product_slug is null or product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint meta_rankings_video_https check (video_url is null or video_url ~ '^https://'),
  constraint meta_rankings_rank_unique unique (snapshot_id, tier_type, rank)
);

create table public.meta_videos (
  id bigint primary key generated always as identity,
  youtube_url text not null,
  title text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_videos_url_https check (youtube_url ~ '^https://'),
  constraint meta_videos_title_length check (char_length(title) between 1 and 200),
  constraint meta_videos_description_length check (description is null or char_length(description) <= 500),
  constraint meta_videos_sort_order_range check (sort_order between -1000000 and 1000000)
);

create index meta_rankings_snapshot_idx on public.meta_rankings(snapshot_id, tier_type, rank);
create index meta_snapshots_public_idx on public.meta_snapshots(month desc);
create index meta_videos_public_idx on public.meta_videos(sort_order, id);

create trigger meta_snapshots_set_updated_at before update on public.meta_snapshots
for each row execute function private.set_updated_at();
create trigger meta_videos_set_updated_at before update on public.meta_videos
for each row execute function private.set_updated_at();

-- A ranking row is public exactly when its snapshot is, which the rankings table cannot
-- see from its own row.
create or replace function private.is_public_meta_snapshot(snapshot_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meta_snapshots as snapshot
    where snapshot.id = is_public_meta_snapshot.snapshot_id
      and snapshot.active
      and snapshot.publication_status = 'published'
  );
$$;

revoke all on function private.is_public_meta_snapshot(bigint) from public, anon, authenticated, service_role;
grant execute on function private.is_public_meta_snapshot(bigint) to anon, authenticated;

alter table public.meta_snapshots enable row level security;
alter table public.meta_rankings enable row level security;
alter table public.meta_videos enable row level security;

create policy meta_snapshots_public_read on public.meta_snapshots for select to anon, authenticated
using (active and publication_status = 'published');
create policy meta_rankings_public_read on public.meta_rankings for select to anon, authenticated
using ((select private.is_public_meta_snapshot(snapshot_id)));
create policy meta_videos_public_read on public.meta_videos for select to anon, authenticated
using (active);

create policy meta_snapshots_staff_all on public.meta_snapshots for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy meta_rankings_staff_all on public.meta_rankings for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy meta_videos_staff_all on public.meta_videos for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));

-- Row level security decides which rows a role may touch; the grants decide whether it
-- may reach the table at all, and without them even a policy that says yes fails with
-- "permission denied". Nothing is granted to service_role: the panel writes as the signed
-- in member of staff, and the policies above are what stand between them and the table.
grant select on public.meta_snapshots, public.meta_rankings, public.meta_videos to anon;
grant select, insert, update, delete on public.meta_snapshots, public.meta_rankings, public.meta_videos to authenticated;
grant usage, select on sequence public.meta_snapshots_id_seq, public.meta_rankings_id_seq, public.meta_videos_id_seq to authenticated;

-- The footer has had a row for social links since the CMS went in, and no rows to put in
-- it, so it never rendered. The shop's Instagram and the channel the catalogue is actually
-- explained on now live there — and in the Organization's `sameAs`, which already named
-- Instagram, so the two finally agree.
--
-- Upsert on platform_key: a link the owner later retitles or hides from the panel keeps
-- his version, since this only writes a row that is not there yet.

begin;
select pg_advisory_xact_lock(hashtext('20261005160000_the_footer_links_the_accounts'));

insert into public.social_links (platform_key, label, href, publication_status, published_at, active, sort_order)
values
  ('instagram', 'Instagram', 'https://www.instagram.com/geardropshop/', 'published'::public.publication_status, now(), true, 0),
  ('youtube', 'YouTube', 'https://www.youtube.com/@GengisChadBBX', 'published'::public.publication_status, now(), true, 1)
on conflict (platform_key) do nothing;

-- site_settings carries the same two addresses for the panel and the structured data.
update public.site_settings
set instagram_url = coalesce(nullif(instagram_url, ''), 'https://www.instagram.com/geardropshop/'),
    youtube_url = coalesce(nullif(youtube_url, ''), 'https://www.youtube.com/@GengisChadBBX')
where singleton;

commit;

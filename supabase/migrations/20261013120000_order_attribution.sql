-- Where each order came from.
--
-- GA4 only hears from buyers who accept statistics cookies (about one order in eight), so neither
-- Analytics nor Google Ads can tell whether a campaign sold. The storefront notes the channel of
-- the visit that ended in the purchase, Stripe carries it in the checkout session metadata, and
-- the webhook writes it here.
--
-- Coarse labels only ("google" / "cpc", "instagram" / "social", "direct" / "none"): no click
-- identifier, no URL with a query string, nothing that singles out a person. The length checks
-- keep it that way at the database too. A replay changes nothing.

begin;

alter table public.orders
  add column if not exists attribution_source text,
  add column if not exists attribution_medium text,
  add column if not exists attribution_campaign text,
  add column if not exists attribution_landing text;

alter table public.orders drop constraint if exists orders_attribution_labels;
alter table public.orders
  add constraint orders_attribution_labels check (
    (attribution_source is null or char_length(attribution_source) between 1 and 40)
    and (attribution_medium is null or char_length(attribution_medium) between 1 and 40)
    and (attribution_campaign is null or char_length(attribution_campaign) between 1 and 60)
    and (attribution_landing is null or (char_length(attribution_landing) <= 120 and attribution_landing like '/%'))
  );

comment on column public.orders.attribution_source is
  'Channel of the visit that placed the order: utm_source, google (gclid / srsltid), a search engine, a social network, a referring host, or direct.';
comment on column public.orders.attribution_medium is
  'cpc (Google Ads click), free (Merchant Center free listing / organic with srsltid), organic, social, referral, none, or utm_medium.';
comment on column public.orders.attribution_campaign is
  'utm_campaign, when the link carried one.';
comment on column public.orders.attribution_landing is
  'Path of the page the visit landed on, without query string.';

commit;

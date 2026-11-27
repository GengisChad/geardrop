begin;
select plan(2);

-- 2026-11-27: a picture or clip published on Instagram becomes a draft for the channel.
insert into public.telegram_news_drafts (event_key, kind, payload)
values (
  'social:AgADtest01:cx-20-customize-set-c',
  'social_post',
  '{"kind":"social_post","slug":"cx-20-customize-set-c","path":null,"note":null,"media":{"type":"photo","fileId":"AgACAgQAAxkBAAtest","uniqueId":"AgADtest01"}}'
);
select is(
  (select count(*)::integer from public.telegram_news_drafts where kind = 'social_post'),
  1,
  'a post made from an Instagram piece is a kind of news the bot can draft'
);

select throws_ok(
  $$insert into public.telegram_news_drafts (event_key, kind, payload) values ('order:2', 'new_order', '{}')$$,
  '23514',
  null,
  'a kind the owner did not choose still cannot be drafted'
);

select * from finish();
rollback;

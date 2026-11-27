-- 2026-11-27, the owner: "tutto quello che pubblichi su IG mandalo anche su telegram con collegamento
-- al pagamento del sito". A picture or clip published on Instagram becomes a draft for the channel:
-- the bot may now draft a seventh kind of news, social_post. It is shown to the owner like every
-- other draft and reaches the channel only on his «Pubblica».
--
-- new_video stays allowed: the two trial drafts of 2026-11-26 carry it, though the bot no longer
-- drafts it.

alter table public.telegram_news_drafts drop constraint telegram_news_drafts_kind_check;
alter table public.telegram_news_drafts add constraint telegram_news_drafts_kind_check
  check (kind in ('new_product', 'back_in_stock', 'price_drop', 'channel_preorder', 'meta_update', 'new_video', 'social_post'));

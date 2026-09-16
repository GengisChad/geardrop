begin;

-- The shop now answers customers and receives orders at infogeardrop@gmail.com. Pages that still
-- carry the previous address are updated in place, and the support email is set only where none
-- has been chosen in the admin yet.
update public.content_pages
set markdown_source = replace(markdown_source, 'gengischad@gmail.com', 'infogeardrop@gmail.com'),
    updated_at = now()
where position('gengischad@gmail.com' in markdown_source) > 0;

update public.site_settings
set support_email = 'infogeardrop@gmail.com'
where singleton
  and (support_email is null or support_email = 'gengischad@gmail.com');

commit;

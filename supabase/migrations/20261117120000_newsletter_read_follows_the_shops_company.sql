-- The newsletter list was added on main (20261114090000) before companies existed, and its one
-- policy let any active owner or admin read it through the global staff role. With two companies
-- in the database that would show the shop's subscribers to staff who only work for the other one.
--
-- The list still carries no organization: it is the public shop's list, written only by the
-- service role. Until a second storefront collects addresses, the people who may read it are the
-- owners and admins of the company that runs a public shop.

drop policy "staff can read newsletter subscribers" on public.newsletter_subscribers;

create policy "newsletter_subscribers_manager_read"
  on public.newsletter_subscribers
  for select
  to authenticated
  using ((
    select exists (
      select 1
      from unnest(private.member_organization_ids(array[
        'owner'::public.staff_role, 'admin'::public.staff_role
      ])) as member(organization_id)
      where private.is_storefront_organization(member.organization_id)
    )
  ));

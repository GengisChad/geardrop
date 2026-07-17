# One-shot bootstrap for the first two owners

Do not run this procedure during local Phase 1 or before explicit approval of the remote rollout gate. It never creates Auth users: both email/password accounts must already exist and be confirmed.

The migration creates `private.bootstrap_initial_owners(text[])` with no grants for `anon`, `authenticated`, `service_role`, or `PUBLIC`. It can be called only through a reviewed direct database administrator connection. The function:

1. requires exactly two non-empty, distinct normalized emails;
2. locks `staff_profiles` to serialize concurrent attempts;
3. refuses to run if any staff profile already exists;
4. resolves exactly two confirmed rows from `auth.users` without altering them;
5. inserts exactly two active `owner` rows and matching audit events in one transaction;
6. rolls back completely on every mismatch and refuses every later attempt.

After the remote gate, replace the placeholders only in the operator session and execute once:

```sql
begin;

select private.bootstrap_initial_owners(
  array['owner-one@example.com', 'owner-two@example.com']::text[]
);

do $$
begin
  if (select count(*) from public.staff_profiles where active and role = 'owner') <> 2 then
    raise exception 'OWNER_BOOTSTRAP_VERIFICATION_FAILED';
  end if;

  if (select count(*) from public.staff_profiles) <> 2 then
    raise exception 'UNEXPECTED_STAFF_PROFILE';
  end if;
end;
$$;

commit;
```

Then verify through two separate owner sessions and one non-staff session. Do not assign staff privileges from Auth metadata, do not bulk-promote preserved users, and do not reuse the bootstrap for later staff management. A later reviewed forward migration removes the bootstrap function after successful rollout evidence is recorded.

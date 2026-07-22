# One-shot bootstrap for the first two owners

> **Concluso, e la funzione è stata rimossa.** I due owner sono stati creati e promossi sul
> progetto GEAR//DROP: due utenti Auth confermati, due righe `owner` attive, due eventi di
> audit `initial_owner_bootstrap`. La migration `20260721010000_retire_owner_bootstrap` ha
> poi eliminato `private.bootstrap_initial_owners(text[])`, quindi questa procedura non è
> più eseguibile e resta solo come traccia di come sono nati i primi owner.
>
> Da qui lo staff si gestisce dal pannello admin e dalle sue RPC — `record_staff_invite`,
> `change_staff_role`, `set_staff_active`, `revoke_staff_access` — che ricontrollano il
> ruolo del chiamante. Un database che avesse di nuovo bisogno del *primo* owner
> richiederebbe di reintrodurre la funzione con una nuova migration, deliberatamente e
> sotto revisione.

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

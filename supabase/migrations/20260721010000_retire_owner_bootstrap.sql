-- Retire the one-shot owner bootstrap.
--
-- private.bootstrap_initial_owners(text[]) existed to promote the first two owners on a
-- database that had none. That has happened: two confirmed auth users hold active owner
-- rows in public.staff_profiles, each with its initial_owner_bootstrap audit event. The
-- function refuses to run a second time anyway (GD_OWNER_BOOTSTRAP_ALREADY_USED as soon
-- as staff_profiles is non-empty), so dropping it removes a security definer function
-- that can no longer do anything useful.
--
-- From here staff is managed only through the normal admin RPCs, which re-check the
-- caller's role. Nothing about existing owners, roles or audit history changes: this
-- migration touches no application data. It is deliberately not `cascade` — if anything
-- still depended on the function the drop would fail loudly rather than take the
-- dependency with it.

drop function if exists private.bootstrap_initial_owners(text[]);

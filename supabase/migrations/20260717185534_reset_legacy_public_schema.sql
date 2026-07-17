-- Remove only the application objects inventoried before the commerce rebuild.
-- Managed schemas and auth.users are deliberately preserved.
drop trigger if exists on_auth_user_created on auth.users;
do $$
begin
  if to_regclass('public.clubs') is not null then
    execute 'drop trigger if exists trg_guard_clubs_status on public.clubs';
  end if;
end;
$$;

drop table if exists public.audit_logs cascade;
drop table if exists public.club_join_requests cascade;
drop table if exists public.match_results cascade;
drop table if exists public.points_ledger cascade;
drop table if exists public.standings cascade;
drop table if exists public.tournament_snapshots cascade;
drop table if exists public.tournament_matches cascade;
drop table if exists public.tournament_rounds cascade;
drop table if exists public.tournament_players cascade;
drop table if exists public.tournaments cascade;
drop table if exists public.player_profiles cascade;
drop table if exists public.clubs cascade;
drop table if exists public.news cascade;

drop function if exists public.guard_clubs_status_change();
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();
drop function if exists public.is_club_leader();
drop function if exists public.is_judge_or_above();
drop function if exists public.owns_tournament(uuid);

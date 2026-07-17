begin;
select plan(3);

select has_schema('auth', 'managed auth schema is preserved');
select has_table('auth', 'users', 'auth users table is preserved');
select is_empty(
  $$
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'audit_logs', 'club_join_requests', 'clubs', 'match_results', 'news',
        'player_profiles', 'points_ledger', 'standings', 'tournament_matches',
        'tournament_players', 'tournament_rounds', 'tournament_snapshots', 'tournaments'
      )
  $$,
  'inventoried legacy public tables are absent'
);

select * from finish();
rollback;

-- GEAR//DROP — read-only inventory of the remote `public` schema (design §3).
--
-- Run this FIRST, before any migration, and review the output. It changes nothing.
-- Its purpose is to produce the explicit drop list the reset step needs: the operator
-- compares what already exists against what this project owns (see 0000_reset_public.sql)
-- and decides manually what to do with anything else.
--
-- Supabase-managed schemas (auth, storage, realtime, vault, extensions,
-- supabase_migrations, graphql, pgsodium, cron, net) are never listed here and are never
-- touched by the reset.

-- 1. Tables and views in public, with row counts (estimates) and RLS state.
select
  c.relname                                   as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    when 'f' then 'foreign table'
  end                                         as kind,
  c.relrowsecurity                            as rls_enabled,
  c.relforcerowsecurity                       as rls_forced,
  c.reltuples::bigint                         as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
order by c.relkind, c.relname;

-- 2. Row-level security policies in public.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. User-defined functions and procedures in public (extension-owned ones excluded).
select
  p.proname                                   as function_name,
  pg_get_function_identity_arguments(p.oid)   as arguments,
  case p.prokind
    when 'f' then 'function'
    when 'p' then 'procedure'
    when 'a' then 'aggregate'
    when 'w' then 'window'
  end                                         as kind,
  p.prosecdef                                 as security_definer,
  pg_get_userbyid(p.proowner)                 as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_depend d
  on d.objid = p.oid and d.deptype = 'e'      -- owned by an extension
where n.nspname = 'public'
  and d.objid is null
order by p.proname;

-- 4. Triggers on public tables (system triggers excluded).
select
  c.relname   as table_name,
  t.tgname    as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 5. Sequences in public (identity-owned sequences included).
select
  c.relname as sequence_name,
  coalesce(dep.refobjid::regclass::text, '(standalone)') as owned_by
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_depend dep
  on dep.objid = c.oid and dep.deptype in ('a', 'i')
where n.nspname = 'public'
  and c.relkind = 'S'
order by c.relname;

-- 6. Types and enums defined in public.
select t.typname as type_name, t.typtype as type_kind
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typtype in ('e', 'c', 'd')
  and not exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind <> 'c')
order by t.typname;

-- 7. Non-default table grants in public (what the Data API can currently reach).
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;

-- 8. Existing Auth users (preserved by the reset; staff privilege is granted manually).
select id, email, created_at, last_sign_in_at, email_confirmed_at
from auth.users
order by created_at;

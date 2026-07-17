-- GearDrop must be installed only on a new, dedicated Supabase project.
-- This guard is intentionally non-destructive: it aborts instead of deleting or
-- rewriting any pre-existing application table.
do $$
declare
  existing_application_tables text;
begin
  select string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ' order by relation.relname)
  into existing_application_tables
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and not exists (
      select 1
      from pg_catalog.pg_depend as dependency
      join pg_catalog.pg_extension as extension
        on extension.oid = dependency.refobjid
      where dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
        and dependency.objid = relation.oid
        and dependency.deptype = 'e'
    );

  if existing_application_tables is not null then
    raise exception using
      errcode = 'P0001',
      message = 'GD_DEDICATED_PROJECT_REQUIRED',
      detail = format('Existing application tables: %s', existing_application_tables),
      hint = 'Create a new Supabase project dedicated to GearDrop; do not reset or reuse this database.';
  end if;
end;
$$;

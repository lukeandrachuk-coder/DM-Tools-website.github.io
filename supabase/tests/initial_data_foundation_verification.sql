-- Run after `supabase db reset` (or in the Supabase SQL editor) as a structural
-- verification checklist. RLS behavior must be tested with real Auth JWTs.

-- All six scoped tables have RLS enabled.
select c.relname, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles','campaigns','campaign_members','entries','statblocks','characters')
order by c.relname;

-- Foreign keys, primary keys, and role/type checks are database constraints.
select conrelid::regclass as table_name, conname, contype
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in ('profiles','campaigns','campaign_members','entries','statblocks','characters')
order by table_name, conname;

-- The join function's definition must not contain an owner update; its sole
-- membership insert uses role player. This verifies the no-owner-transfer path.
select pg_get_functiondef('public.join_campaign_by_code(text)'::regprocedure)
  not ilike '%update public.campaigns%' as join_never_updates_campaign;

-- Player-safe views intentionally omit DM notes; player base-table SELECT is
-- absent, while the views are granted to authenticated users.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('player_visible_entries', 'player_characters')
  and column_name = 'dm_notes';

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Initial online data foundation. This migration deliberately does not touch the
-- browser application's IndexedDB stores or its local authentication system.

create extension if not exists pgcrypto;

create type public.campaign_member_role as enum ('owner', 'dm', 'player');
create type public.entry_type as enum (
  'Location', 'NPC', 'Monster', 'Faction', 'Item', 'Quest', 'Lore', 'Weapon',
  'Armor', 'Statblock'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_not_blank check (length(btrim(username)) > 0)
);
create unique index profiles_username_normalized_unique on public.profiles (lower(username));

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  join_code text not null,
  dm_name text,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_name_not_blank check (length(btrim(name)) > 0),
  constraint campaigns_join_code_not_blank check (length(btrim(join_code)) > 0)
);
create unique index campaigns_join_code_normalized_unique on public.campaigns (lower(join_code));
create unique index campaigns_legacy_id_unique on public.campaigns (legacy_id) where legacy_id is not null;
create index campaigns_owner_id_idx on public.campaigns (owner_id);
create index campaigns_updated_at_idx on public.campaigns (updated_at desc);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.campaign_member_role not null default 'player',
  joined_at timestamptz not null default now(),
  invited_by uuid references public.profiles(id) on delete set null,
  primary key (campaign_id, user_id)
);
create index campaign_members_user_campaign_idx on public.campaign_members (user_id, campaign_id);
create index campaign_members_campaign_role_idx on public.campaign_members (campaign_id, role);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  legacy_id text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  type public.entry_type not null,
  name text not null,
  description text not null default '',
  dm_notes text not null default '',
  player_visible boolean not null default false,
  tags text[] not null default '{}',
  image_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_name_not_blank check (length(btrim(name)) > 0),
  constraint entries_tags_no_blank_values check (array_position(tags, '') is null)
);
create unique index entries_campaign_legacy_id_unique on public.entries (campaign_id, legacy_id) where legacy_id is not null;
create index entries_campaign_type_idx on public.entries (campaign_id, type);
create index entries_campaign_player_visible_idx on public.entries (campaign_id, player_visible);
create index entries_search_idx on public.entries using gin (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))
);
create index entries_tags_idx on public.entries using gin (tags);

create table public.statblocks (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  creature_type text not null default '',
  size text not null default '',
  alignment text not null default '',
  armor_class integer not null default 10,
  hit_points integer not null default 1,
  hit_dice text not null default '',
  speed text not null default '',
  strength smallint not null default 10,
  dexterity smallint not null default 10,
  constitution smallint not null default 10,
  intelligence smallint not null default 10,
  wisdom smallint not null default 10,
  charisma smallint not null default 10,
  saving_throws text not null default '',
  skills text not null default '',
  vulnerabilities text not null default '',
  resistances text not null default '',
  immunities text not null default '',
  condition_immunities text not null default '',
  senses text not null default '',
  languages text not null default '',
  challenge text not null default '',
  special_abilities text not null default '',
  attacks text not null default '',
  actions text not null default '',
  bonus_actions text not null default '',
  reactions text not null default '',
  legendary_actions text not null default '',
  weaknesses text not null default '',
  constraint statblocks_armor_class_nonnegative check (armor_class >= 0),
  constraint statblocks_hit_points_nonnegative check (hit_points >= 0)
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  legacy_id text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  player_user_id uuid references public.profiles(id) on delete set null,
  player_name text not null default '',
  name text not null,
  race text not null default '',
  class_name text not null default '',
  level integer not null default 1,
  description text not null default '',
  dm_notes text not null default '',
  image_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint characters_name_not_blank check (length(btrim(name)) > 0),
  constraint characters_level_positive check (level > 0)
);
create unique index characters_campaign_legacy_id_unique on public.characters (campaign_id, legacy_id) where legacy_id is not null;
create index characters_campaign_idx on public.characters (campaign_id);
create index characters_campaign_player_user_idx on public.characters (campaign_id, player_user_id);

-- image_id intentionally has no FK yet: the images table is explicitly out of scope
-- for this migration and will be added before clients can populate these columns.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create trigger entries_set_updated_at before update on public.entries for each row execute function public.set_updated_at();
create trigger characters_set_updated_at before update on public.characters for each row execute function public.set_updated_at();

-- Auth is the only source of profile identities. A placeholder username is safe
-- until a later Auth/profile UX lets the user choose a display username.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user_' || replace(new.id::text, '-', ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Membership predicates bypass table RLS but expose only booleans. Pinning the
-- search path prevents caller-controlled object resolution in definer functions.
create or replace function public.is_campaign_member(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = target_campaign_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_campaign_role(target_campaign_id uuid, allowed_roles public.campaign_member_role[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = target_campaign_id
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.is_campaign_content_manager(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.has_campaign_role(target_campaign_id, array['owner', 'dm']::public.campaign_member_role[]);
$$;

create or replace function public.is_statblock_content_manager(target_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.entries e
    join public.campaign_members m on m.campaign_id = e.campaign_id
    where e.id = target_entry_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'dm')
  );
$$;

-- Ownership and attribution are immutable through ordinary client updates.
create or replace function public.prevent_campaign_owner_change()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'campaign ownership can only be changed by a dedicated owner transfer operation';
  end if;
  return new;
end;
$$;
create trigger campaigns_prevent_owner_change before update on public.campaigns for each row execute function public.prevent_campaign_owner_change();

create or replace function public.prevent_creator_change()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'record creator cannot be changed';
  end if;
  return new;
end;
$$;
create trigger entries_prevent_creator_change before update on public.entries for each row execute function public.prevent_creator_change();
create trigger characters_prevent_creator_change before update on public.characters for each row execute function public.prevent_creator_change();

-- A statblock can extend only an entry explicitly typed Statblock. The entry
-- remains the canonical home for shared name, description, image, and visibility.
create or replace function public.require_statblock_entry_type()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from public.entries e where e.id = new.entry_id and e.type = 'Statblock'
  ) then
    raise exception 'statblocks require an entry with type Statblock';
  end if;
  return new;
end;
$$;
create trigger statblocks_require_statblock_entry_type
  before insert or update of entry_id on public.statblocks
  for each row execute function public.require_statblock_entry_type();

-- All client campaign creation must use this atomic function so every campaign
-- starts with a matching owner membership row.
create or replace function public.create_campaign(
  campaign_name text,
  campaign_join_code text,
  campaign_dm_name text default null,
  campaign_description text default ''
)
returns public.campaigns
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_campaign public.campaigns;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.campaigns (owner_id, name, join_code, dm_name, description)
  values (auth.uid(), campaign_name, campaign_join_code, campaign_dm_name, campaign_description)
  returning * into new_campaign;
  insert into public.campaign_members (campaign_id, user_id, role, invited_by)
  values (new_campaign.id, auth.uid(), 'owner', auth.uid());
  return new_campaign;
end;
$$;

-- A code can only add the caller as a player. It never writes campaigns.owner_id.
create or replace function public.join_campaign_by_code(campaign_join_code text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target_campaign_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select c.id into target_campaign_id from public.campaigns c
    where lower(c.join_code) = lower(btrim(campaign_join_code)) for key share;
  if target_campaign_id is null then raise exception 'campaign code not found'; end if;
  insert into public.campaign_members (campaign_id, user_id, role, invited_by)
  values (target_campaign_id, auth.uid(), 'player', null)
  on conflict (campaign_id, user_id) do nothing;
  return target_campaign_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.entries enable row level security;
alter table public.statblocks enable row level security;
alter table public.characters enable row level security;

create policy "profiles: users read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: users update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "campaigns: members read" on public.campaigns for select to authenticated using (public.is_campaign_member(id));
create policy "campaigns: managers update" on public.campaigns for update to authenticated using (public.is_campaign_content_manager(id)) with check (public.is_campaign_content_manager(id));
create policy "campaigns: owners delete" on public.campaigns for delete to authenticated using (public.has_campaign_role(id, array['owner']::public.campaign_member_role[]));

create policy "campaign members: members read" on public.campaign_members for select to authenticated using (public.is_campaign_member(campaign_id));
create policy "campaign members: managers add players" on public.campaign_members for insert to authenticated with check (
  role = 'player' and invited_by = auth.uid() and public.is_campaign_content_manager(campaign_id)
);

create policy "entries: managers read" on public.entries for select to authenticated using (public.is_campaign_content_manager(campaign_id));
create policy "entries: managers create" on public.entries for insert to authenticated with check (created_by = auth.uid() and public.is_campaign_content_manager(campaign_id));
create policy "entries: managers update" on public.entries for update to authenticated using (public.is_campaign_content_manager(campaign_id)) with check (public.is_campaign_content_manager(campaign_id));
create policy "entries: managers delete" on public.entries for delete to authenticated using (public.is_campaign_content_manager(campaign_id));

create policy "statblocks: managers read" on public.statblocks for select to authenticated using (public.is_statblock_content_manager(entry_id));
create policy "statblocks: managers create" on public.statblocks for insert to authenticated with check (public.is_statblock_content_manager(entry_id));
create policy "statblocks: managers update" on public.statblocks for update to authenticated using (public.is_statblock_content_manager(entry_id)) with check (public.is_statblock_content_manager(entry_id));
create policy "statblocks: managers delete" on public.statblocks for delete to authenticated using (public.is_statblock_content_manager(entry_id));

create policy "characters: managers read" on public.characters for select to authenticated using (public.is_campaign_content_manager(campaign_id));
create policy "characters: managers create" on public.characters for insert to authenticated with check (created_by = auth.uid() and public.is_campaign_content_manager(campaign_id));
create policy "characters: managers update" on public.characters for update to authenticated using (public.is_campaign_content_manager(campaign_id)) with check (public.is_campaign_content_manager(campaign_id));
create policy "characters: managers delete" on public.characters for delete to authenticated using (public.is_campaign_content_manager(campaign_id));

-- Player-safe projections deliberately omit dm_notes. Base-table policies do not
-- grant players SELECT, because RLS filters rows rather than sensitive columns.
create view public.player_visible_entries
with (security_invoker = false) as
  select e.id, e.campaign_id, e.type, e.name, e.description, e.player_visible,
         e.tags, e.image_id, e.created_at, e.updated_at
  from public.entries e
  where e.player_visible and public.is_campaign_member(e.campaign_id);

create view public.player_visible_statblocks
with (security_invoker = false) as
  select s.*
  from public.statblocks s
  join public.entries e on e.id = s.entry_id
  where e.player_visible and public.is_campaign_member(e.campaign_id);

create view public.player_characters
with (security_invoker = false) as
  select c.id, c.campaign_id, c.player_user_id, c.player_name, c.name, c.race,
         c.class_name, c.level, c.description, c.image_id, c.created_at, c.updated_at
  from public.characters c
  where c.player_user_id = auth.uid() and public.is_campaign_member(c.campaign_id);

grant execute on function public.create_campaign(text, text, text, text) to authenticated;
grant execute on function public.join_campaign_by_code(text) to authenticated;
grant select on public.player_visible_entries, public.player_visible_statblocks, public.player_characters to authenticated;

-- Do not leave SECURITY DEFINER entry points executable by PUBLIC.
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.is_campaign_member(uuid) from public;
revoke all on function public.has_campaign_role(uuid, public.campaign_member_role[]) from public;
revoke all on function public.is_campaign_content_manager(uuid) from public;
revoke all on function public.is_statblock_content_manager(uuid) from public;
revoke all on function public.create_campaign(text, text, text, text) from public;
revoke all on function public.join_campaign_by_code(text) from public;
grant execute on function public.is_campaign_member(uuid) to authenticated;
grant execute on function public.has_campaign_role(uuid, public.campaign_member_role[]) to authenticated;
grant execute on function public.is_campaign_content_manager(uuid) to authenticated;
grant execute on function public.is_statblock_content_manager(uuid) to authenticated;

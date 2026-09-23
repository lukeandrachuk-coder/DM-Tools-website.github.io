# DM Toolkit data architecture audit and Supabase migration blueprint

**Scope.** This is an analysis of the current single-page application, based on
`app.js`, `index.html`, and the repository's current data paths. It deliberately
does **not** change application persistence, remove IndexedDB, add Supabase
credentials, or introduce a parallel runtime architecture.

## Executive findings

- The application is browser-local. IndexedDB database `DMToolkit` (version 2)
  is the authoritative data store; `localStorage` only remembers the signed-in
  local account ID and sidebar state.
- There are seven declared IndexedDB stores: `campaigns`, `entries`,
  `characters`, `combats`, `maps`, `sessions`, and `accounts`. Every store uses
  `id` as its key path and has **no indexes**. The code tries to use a
  `settings` store for a directory handle, but version 2 never creates it; that
  optional feature therefore intentionally falls back when unavailable.
- “Authentication” is a local username/password lookup. Passwords are stored
  in plaintext in IndexedDB. It is not a server-backed identity system.
- A campaign has exactly one effective local owner (`ownerId`). Campaign codes
  do not create membership: entering a known code rewrites that campaign's
  `ownerId` to the current local account. There are no roles, invitations,
  player accounts, or real sharing semantics.
- Wiki entries, including statblocks, are a single polymorphic `entries` store.
  Statblocks are embedded under `entry.statblock`; they are not a separate
  store. Combat participants are likewise embedded in `combat.p` rather than
  independent records.
- No session-to-character, session-to-entry, session-to-combat, or
  session-to-map reference is currently recorded. Maps are image URLs only;
  there is no upload/blob/data-URL pipeline or fog-of-war data.

## 1. Current authentication and account state

### Creation, identity, and login

`createAccount` reads a username and password from the account form, rejects a
case-insensitive duplicate username, and writes this object to `accounts`:

```text
{ id, username, password, createdAt }
```

`id` is a client-generated `account_<timestamp>_<random>` string. The password
is intentionally stored locally and compared directly by `login`; there is no
hashing, email, password reset, session token, OAuth, server, or cross-browser
identity. On the first account only, `claimLegacyData` sets `ownerId` on old
unowned campaigns and records in the six campaign-data stores.

On successful create or login, the account ID is assigned to in-memory
`currentUserId` and written to `localStorage.dm_current_user`. On startup,
`restoreLogin` reads that key, verifies that the account still exists in
IndexedDB, and restores the in-memory ID; otherwise it clears the key and shows
the login screen. `logout` clears both `currentUserId` and that localStorage key.

### Current-campaign state

`currentCampaignId` exists only in JavaScript memory. It is reset to `null`
after every successful application entry, including a reopened site; it is not
stored in IndexedDB, localStorage, URL state, or sessionStorage. Selecting or
creating a campaign changes it only for the current page lifetime.

## 2. Campaigns, ownership, membership, and permissions

### Stored campaign shape

```text
campaigns
{ id, ownerId, name, code, dm, description, createdAt, updatedAt }
```

- `id` is client generated with the `campaign` prefix.
- `ownerId` is the sole account relationship and access boundary in the local
  UI: `getMyCampaigns` filters to equality with `currentUserId`.
- `code` is a user-editable/generated `LLLL-####` string. Generation uses
  `Math.random`; it is not checked for uniqueness.
- `dm` is a free-text display name, not an account reference and not a role.
- “Join campaign” finds a campaign by a case-insensitive code, then **changes
  its `ownerId` to the joiner's local account**. Consequently the prior owner
  loses local access. It is not collaboration or membership.

There is no `campaign_members` data, member role, invitation, player-to-account
mapping, or permission assignment. The apparent “owner” checks in campaign form
and opening code are client-side only. All campaign-owned stores repeat
`ownerId` and `campaignId`; reads filter both to the current user and, when one
is selected, the campaign. Deleting a campaign iterates the five dependent
stores and deletes matching `campaignId` records manually.

## 3. Wiki entries and statblocks

### Entry types actually supported

The standard wiki form offers **Location, NPC, Monster, Faction, Item, Quest,
and Lore**. The campaign quick-add form additionally offers **Weapon** and
**Armor**. **Statblock** is a special entry type made by the statblock form.
Characters are a separate `characters` store, and sessions, maps, and combats
are separate stores rather than wiki entries. No other persisted entry type is
present.

Normal-entry shape (quick-add may also include `tags`):

```text
entries
{ id, ownerId, campaignId, name, type, description, notes, image,
  playerVisible, [tags], createdAt, updatedAt }
```

`notes` is labelled DM Notes. `image` is an arbitrary image URL string.
`playerVisible` is a boolean. `tags` is a single comma-separated string and is
only written by quick add; the standard entry editor neither exposes nor
preserves it, so editing such an entry can remove tags.

### Statblock relationship and full stored fields

A statblock is one `entries` record with `type: "Statblock"`, the normal common
fields above (except no `tags` is written), and an embedded `statblock` object.
Its `description` and `image` duplicate `statblock.description` and
`statblock.image`; `notes` is retained from an existing entry but no statblock
notes editor is displayed.

```text
statblock
{ type, size, alignment, armorClass, hitPoints, hitDice, speed,
  abilities: { strength, dexterity, constitution, intelligence, wisdom, charisma },
  savingThrows, skills, vulnerabilities, resistances, immunities,
  conditionImmunities, senses, languages, challenge, specialAbilities, attacks,
  actions, bonusActions, reactions, legendaryActions, weaknesses, description,
  image }
```

All ability scores and armor class/hit points are numbers (with defaults), while
the remaining combat/action/stat text fields are strings. A statblock has no
foreign key to a monster or other entry beyond being that entry itself.

## 4. Characters

```text
characters
{ id, ownerId, campaignId, name, player, race, className, level, image,
  description, notes, createdAt, updatedAt }
```

`player` is a free-text person name, not `accounts.id` or a campaign member.
`ownerId` is the local account that created/edits every character in the
campaign. No code restricts one character per player, so a player label may
appear on any number of characters. Characters are not used as combat
participants by ID and are not referenced from sessions.

## 5. Combat

```text
combats
{ id, ownerId, campaignId, name, notes, status, round, turnIndex, p,
  createdAt, updatedAt, endedAt }
```

`status` is `draft`, `active`, or `ended`; only one active combat is prevented
by client-side logic per current campaign. `round` starts at 1, `turnIndex`
indexes the sorted participant array, and `endedAt` is ISO text or null.
There is no `sessionId`, map ID, or entry/character ID on a combat.

`p` is an embedded, initiative-descending array. Its normalized participant
shape is:

```text
{ id, n, i, h, m, a, tempHp, conditions, notes, hidden, isPlayer }
```

where `n` name, `i` initiative, `h` current HP, `m` maximum HP, and `a` armor
class are numeric except name. `tempHp` is numeric; damage consumes it before
current HP, while healing is capped at maximum HP. `conditions` and `notes` are
strings; `isPlayer` and `hidden` are booleans. Participants have no link to a
character, entry, statblock, or account—only their own generated participant
ID. Normalization provides backward-compatible defaults and rewrites each
combat when the combat page renders.

## 6. Sessions

```text
sessions
{ id, ownerId, campaignId, number, date, summary, events, unresolved,
  createdAt, updatedAt }
```

`number` comes from an HTML number input but is saved as a string; `date` is a
date-input string. The three narrative fields are text. Despite the requested
future concepts, the current repository stores **no** session players,
locations, NPCs, events as structured records, combats, maps, or other
references. `events` is a single unstructured text field, not a relationship.

## 7. Maps and images

```text
maps
{ id, ownerId, campaignId, name, image, description, createdAt, updatedAt }
```

Map `image` is required in its form and is rendered directly as an `<img>` URL.
Entry, character, and statblock images are optional URL strings. The code does
not use file inputs, Blob storage, data URLs, object URLs for persisted images,
or an IndexedDB image store. The only Blob/object URL use is a transient JSON
backup download. There is no fog-of-war model, map annotation, grid, token,
map-to-session, or map-to-combat association.

## 8. IndexedDB inventory and helpers

Database `DMToolkit`, version 2, declares these stores, all with `keyPath: id`:

| Store | Important fields | Indexes / relationships |
| --- | --- | --- |
| `accounts` | `id`, `username`, `password`, `createdAt` | No indexes. Referenced by `ownerId` only in application logic. |
| `campaigns` | `id`, `ownerId`, `name`, `code`, `dm`, `description`, timestamps | No indexes. `ownerId` resembles FK to accounts. |
| `entries` | Common entry fields and optional embedded `statblock`/`tags` | No indexes. `ownerId` and `campaignId` are logical references. |
| `characters` | Character fields above | No indexes. `ownerId`, `campaignId` logical references. |
| `combats` | Encounter fields and embedded `p` array | No indexes. `ownerId`, `campaignId` logical references only. |
| `maps` | Map fields above | No indexes. `ownerId`, `campaignId` logical references. |
| `sessions` | Session fields above | No indexes. `ownerId`, `campaignId` logical references. |

The generic IndexedDB helpers are `openDB`, `all(storeName)`, `one(storeName,
id)`, `put(storeName, object)`, and `del(storeName, id)`. Domain code uses them
for all CRUD, legacy claiming, cascading campaign deletion, export/import, and
combat normalization. `makeId(prefix)` creates IDs from `Date.now()` and seven
base-36 random characters. It has no collision check and is not suitable as a
distributed database primary-key generator.

`settings` is **not** in the actual store inventory. `chooseDataFolder` tries
to write `{ id: "dataFolder", handle }` there, and `getDataFolderHandle` catches
the resulting missing-store error. The source comments acknowledge that no
database upgrade created it. This browser `FileSystemDirectoryHandle` is local
capability state and must not be sent to Supabase.

## 9. LocalStorage, session state, backups

| Location | Key / state | Meaning |
| --- | --- | --- |
| `localStorage` | `dm_current_user` | Local `accounts.id`; restored on startup after account existence check. |
| `localStorage` | `dm_sidebar_open` | Boolean-like sidebar preference; defaults open unless exactly `"false"`. |
| JavaScript memory | `currentUserId`, `currentCampaignId`, `currentPage`, `sidebarOpen` | Runtime UI/session state; only sidebar preference and user ID persist as above. |
| `sessionStorage` | none | The repository makes no sessionStorage calls. |
| IndexedDB (attempted) | `settings/dataFolder` | Optional local directory handle; currently unavailable because the store is absent. |

JSON account/campaign exports include account metadata (with password removed),
campaigns, entries, characters, combats, maps, and sessions. Imports clone
campaign and record IDs, replace `ownerId` with the current account, and remap
`campaignId`. These imports do not validate nested payloads and are a useful
legacy source but not an authentication migration path.

## 10. Player/DM visibility and current enforcement

- `entries.playerVisible` exists for standard entries, quick-add entries, and
  statblocks. It is labelled “Visible to players”; standard entries/statblocks
  default false, while campaign quick-add defaults true.
- `entries.notes` is labelled DM Notes but is nevertheless included in the
  record retrieved by the current UI.
- `combat.p[].hidden` is labelled “Hidden from Players”; `isPlayer` labels a
  participant as a player character.
- There is **no “View as Player” mode**, no player-specific rendering path, and
  no query/filter that applies `playerVisible`, `hidden`, or `isPlayer` to a
  player account. The current application has only owner access and renders all
  records returned by its owner/campaign filter. Therefore these flags are UI
  metadata today, not a security boundary.

## A. Human-readable current model

Each browser has one IndexedDB database containing locally created accounts.
An account locally “owns” campaigns and every campaign record repeats that
owner. A campaign contains independent collections of polymorphic world entries,
player-character records, encounters with embedded combatants, image-URL maps,
and narrative session logs. There are no durable cross-links between those
collections beyond `campaignId`, apart from statblock content embedded in a wiki
entry. The entire model is client-managed and logically cascades deletes and
access checks in JavaScript.

## B. Proposed Supabase tables

Use Supabase Auth UUIDs as the user identity. The schema below preserves all
current data while normalizing the places where records are currently embedded.
Use `timestamptz` for audit timestamps and `uuid` generated by PostgreSQL for
new IDs. During import retain the local string IDs in `legacy_id` with a
per-table uniqueness constraint such as `(campaign_id, legacy_id)`.

| Table | Columns (key types shown) | Keys, indexes, and IndexedDB mapping |
| --- | --- | --- |
| `profiles` | `id uuid`, `username text`, `display_name text null`, `created_at timestamptz`, `updated_at timestamptz` | PK/FK `id -> auth.users(id)`. Unique case-insensitive username (or use email as the Auth login and make username a profile field). Maps `accounts` excluding password. |
| `campaigns` | `id uuid`, `legacy_id text null`, `owner_id uuid`, `name text`, `join_code text`, `dm_name text null`, `description text`, timestamps | PK; FK owner -> profiles; unique normalized `join_code`; indexes `(owner_id)`, `(updated_at desc)`. Maps `campaigns`. |
| `campaign_members` | `campaign_id uuid`, `user_id uuid`, `role campaign_role`, `joined_at timestamptz`, `invited_by uuid null` | Composite PK `(campaign_id,user_id)`; FKs campaign/users/inviter; indexes `(user_id,campaign_id)` and `(campaign_id,role)`. New: replaces ownership transfer and provides `owner`, `dm`, `player` membership. Owner must also have an owner row. |
| `entries` | `id uuid`, `campaign_id uuid`, `legacy_id text null`, `created_by uuid`, `type entry_type`, `name text`, `description text`, `dm_notes text`, `player_visible boolean`, `tags text[]`, `image_id uuid null`, timestamps | PK; FKs campaign, creator, image; indexes `(campaign_id,type)`, `(campaign_id,player_visible)`, full-text/GiN search on name/description/tags. Maps normal `entries`; convert comma string tags to `text[]`. |
| `statblocks` | `entry_id uuid`, `creature_type text`, `size text`, `alignment text`, `armor_class integer`, `hit_points integer`, `hit_dice text`, `speed text`, six ability `smallint` columns, `saving_throws text`, `skills text`, `vulnerabilities text`, `resistances text`, `immunities text`, `condition_immunities text`, `senses text`, `languages text`, `challenge text`, `special_abilities text`, `attacks text`, `actions text`, `bonus_actions text`, `reactions text`, `legendary_actions text`, `weaknesses text` | PK/FK `entry_id -> entries` (one-to-one). Maps `entries.statblock`; common description/image remain canonical on entries. Could initially use `jsonb` for the action fields, but these scalar text columns preserve the exact present model. |
| `characters` | `id uuid`, `campaign_id uuid`, `legacy_id text null`, `created_by uuid`, `player_user_id uuid null`, `player_name text`, `name text`, `race text`, `class_name text`, `level integer`, `description text`, `dm_notes text`, `image_id uuid null`, timestamps | PK; FKs campaign, creator, optional player profile, image; indexes `(campaign_id)`, `(campaign_id,player_user_id)`. Maps `characters`; keep `player_name` for unclaimed/migrated free text. Multiple rows per player remain allowed. |
| `combats` | `id uuid`, `campaign_id uuid`, `legacy_id text null`, `created_by uuid`, `name text`, `notes text`, `status combat_status`, `round integer`, `turn_index integer`, `started_at timestamptz null`, `ended_at timestamptz null`, timestamps | PK; FKs campaign/creator; indexes `(campaign_id,status)`, `(campaign_id,updated_at desc)`. Maps combat header; enforce at most one active encounter per campaign with a partial unique index if desired. |
| `combat_participants` | `id uuid`, `combat_id uuid`, `legacy_id text null`, `character_id uuid null`, `entry_id uuid null`, `name text`, `initiative integer`, `current_hp integer`, `max_hp integer`, `armor_class integer`, `temp_hp integer`, `conditions text`, `notes text`, `is_player boolean`, `hidden_from_players boolean`, `sort_order integer`, timestamps | PK; FKs combat and optional character/entry; indexes `(combat_id,sort_order)`, `(combat_id,initiative desc)`. Maps embedded `combats.p`; nullable source links preserve current unlinked participants and allow future linking. |
| `maps` | `id uuid`, `campaign_id uuid`, `legacy_id text null`, `created_by uuid`, `name text`, `description text`, `image_id uuid`, `player_visible boolean default false`, `fog_state jsonb null`, timestamps | PK; FKs campaign/creator/image; indexes `(campaign_id)`, `(campaign_id,player_visible)`. Maps `maps`; visibility/fog are future fields and need product decisions because no current values exist. |
| `images` | `id uuid`, `campaign_id uuid`, `uploaded_by uuid`, `storage_bucket text`, `storage_path text`, `source_url text null`, `mime_type text null`, `byte_size bigint null`, `width integer null`, `height integer null`, timestamps | PK; FKs campaign/uploader; unique `(storage_bucket,storage_path)`; index `(campaign_id)`. Maps all existing URL strings initially through `source_url`; later uploaded files live in Supabase Storage, not DB blobs. |
| `sessions` | `id uuid`, `campaign_id uuid`, `legacy_id text null`, `created_by uuid`, `number integer null`, `played_on date null`, `summary text`, `events text`, `unresolved text`, `player_visible boolean default false`, timestamps | PK; FKs campaign/creator; indexes `(campaign_id,played_on desc)`, unique optional `(campaign_id,number)`. Maps `sessions`. Visibility is future policy/product work. |

Do **not** create session reference tables during the first migration because the
current data has none. Once the product defines their behavior, add
`session_entries(session_id, entry_id, relation_type)`,
`session_characters(session_id, character_id)`, `session_combats(session_id,
combat_id)`, and `session_maps(session_id, map_id)` with campaign-consistency
checks. Likewise do not invent fog data during import; `fog_state` should remain
null until a fog editor has a specified format.

## C. Target relationships

- An Auth user has one profile and many campaign memberships. A campaign has
  one owner member and any number of DM/player members.
- A campaign owns entries, characters, combats, maps/images, and sessions.
  Creator IDs provide attribution; membership, not repeated owner IDs, grants
  access.
- An entry optionally has exactly one statblock. Statblocks remain dedicated to
  their entry rather than becoming a second normal wiki entity.
- A combat has ordered participants. A participant can optionally reference a
  character or an entry/statblock but keeps its copied encounter name/stats so
  combat history does not change when source content is edited.
- Images belong to a campaign and are referenced by entries, characters, and
  maps. Existing remote URLs can be retained until an explicit upload/import
  workflow copies them with authorization and copyright review.
- Sessions are campaign logs initially. Future join tables can make the desired
  character/NPC/location/combat/map references explicit without rewriting the
  session narrative fields.

## D. Authentication migration

1. Configure Supabase Auth with an approved end-user method (email/password is
   the natural replacement; username can remain a profile field). Only the
   publishable/anon client configuration belongs in the browser; never add a
   service-role key to this repository or client.
2. Create `profiles` from an Auth trigger and let the user choose/claim a unique
   username. The current plaintext password cannot and must not be imported as
   an Auth credential. Existing users must set a new password through a
   controlled sign-up/reset/claim flow.
3. Replace the local login/create/restore/logout behavior only in a later,
   bounded task using Supabase Auth sessions. Supabase manages persistence and
   token refresh; application code should derive user ID from `auth.getUser()`/
   auth state rather than `dm_current_user`.
4. Offer a signed-in, user-initiated IndexedDB import that creates the new
   campaign, owner membership, and child rows in a transactional/server-side
   migration endpoint. Do not upload local account passwords. Preserve original
   `createdAt`/`updatedAt` when possible and retain `legacy_id` for diagnostics.

## E. Security and RLS plan

Enable RLS on every public table and Storage bucket. Implement small
`security definer` membership predicates (carefully pinned `search_path`), e.g.
`is_campaign_member(campaign_id)`, `has_campaign_role(campaign_id, roles[])`,
and `owns_character(character_id)`. Never accept a client-provided `owner_id`,
`created_by`, membership role, or campaign ID without policy validation.

| Resource | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| `profiles` | User can select/update own profile; campaign DMs may need a restricted member-profile view/RPC, not unrestricted profile reads. | Self insert via auth trigger; self update only; username uniqueness in DB. |
| `campaigns` | Members only. | Auth user creates a campaign with self as owner through an RPC/trigger that atomically makes owner membership. Owner/DM may update; owner alone deletes/transfers ownership. |
| `campaign_members` | Members of that campaign. | Owner/DM manages invitations/player rows; restrict role changes and owner removal/transfer to owner-only RPCs. Joining by code must call a transaction/RPC that adds *the caller* as `player` and never changes owner. |
| `entries`, `statblocks`, `maps`, `sessions` | Owner/DM sees all. A player selects only rows in their campaign with `player_visible = true`; hide `dm_notes` by using player-safe views/RPCs that do not project the column, not merely a UI omission. | Owner/DM creates/edits/deletes. Players get no direct mutation unless a future explicit contribution feature requires it. `statblocks` inherits access from parent entry. |
| `characters` | Owner/DM sees campaign characters; a player may select their own `player_user_id` character(s), plus whatever public character presentation the product chooses. | Owner/DM manages all. A player may update only a defined allowlist of columns on a character assigned to `auth.uid()`—prefer a narrow RPC or a player-editable projection so they cannot alter campaign, assignment, DM notes, or audit fields. |
| `combats`, `combat_participants` | Owner/DM sees all. Do not expose `hidden_from_players`, participant notes, or private combat state through direct player selects; offer a player-safe active-combat view that filters hidden rows and omits sensitive columns. | Owner/DM manages encounter state and participants. Players have no direct write initially. |
| `images` / Storage | Member access only; player reads must be limited to images reachable from player-visible records/maps. | Owner/DM uploads/deletes only initially. Store paths should include campaign UUID and Storage RLS must validate membership, rather than trusting the path alone. |

For reliable player-safe payloads, base-table RLS alone is insufficient when a
row contains both public and DM-only columns: RLS filters rows, not columns.
Keep sensitive fields in a separate DM-only table or expose players only through
security-invoker views/RPCs that select an allowlist. Apply the same principle
to private image objects. Put `campaign_id` on child rows and validate it
against any referenced parent (for example combat participant -> combat) with
triggers/constraints so cross-campaign references cannot be forged.

## F. Incremental migration strategy (do not break local use)

1. **Freeze and test the current contract.** Add no backend behavior yet;
   document/fixture each legacy shape, including malformed/older combat records
   accepted by `normalizeCombat`, and retain export/import as a recovery path.
2. **Provision schema and RLS in migrations only.** Create Auth/profile,
   membership, core tables, Storage buckets, constraints, policy tests, and
   player-safe views/RPCs. Use no service-role key in browser code.
3. **Add authentication behind a focused feature flag/adapter.** Preserve the
   current IndexedDB code and local login until the Auth transition has an
   explicit UX and rollback plan. Do not write dual authoritative data silently.
4. **Build a user-triggered legacy importer.** Read one local account's data,
   create an owned cloud campaign/member rows, map every legacy ID, normalize
   combat participants, retain URL images, and report per-record failures.
   Make importing idempotent with an import record or legacy mapping.
5. **Migrate read paths one feature at a time.** Campaign list/selection first,
   then entries/statblocks, characters, maps/images, sessions, and combats.
   At each step choose one authority per feature and retain IndexedDB as the
   offline/local backup until acceptance tests pass.
6. **Add writes and realtime deliberately.** Use optimistic concurrency (e.g.,
   `updated_at`/version) for shared edits and transaction/RPCs for combat turns,
   joins, and ownership changes. Test simultaneous DMs before subscribing to
   realtime channels.
7. **Only after acceptance, offer opt-in cloud migration.** Keep IndexedDB and
   export available. Do not delete browser data automatically; make cloud/local
   source-of-truth and conflict behavior explicit to users.

## G. Decisions and risks before implementation

1. **Identity claim:** Local usernames are browser-scoped and can collide across
   devices. Decide whether login is email/password, magic link, OAuth, or a
   username-plus-email profile. Plaintext legacy passwords must be discarded,
   not migrated.
2. **Sharing semantics:** Decide whether a code is an invite, reusable join
   token, one-time invite, or view-only link; define expiry/revocation and who
   may create it. The current owner-transfer behavior must not be reproduced.
3. **Roles:** Confirm `owner`, `dm`, and `player` capabilities, especially
   whether multiple DMs exist and which character fields a player may edit.
4. **Visibility product contract:** Decide whether player-visible sessions,
   maps, and character details are needed. Existing `playerVisible`/`hidden`
   flags are not enforced and DM notes are co-located with public entry data.
5. **Images:** Decide whether arbitrary external URLs remain allowed, whether
   existing URLs should be copied to Storage, storage quotas/limits, and
   privacy/copyright handling. URLs may be unavailable or leak requester data.
6. **Statblock/action structure:** Current abilities/actions are free text.
   Decide whether the first cloud schema should preserve text exactly (lowest
   risk) or introduce structured actions/attacks before UI support exists.
7. **Combat concurrency/history:** Decide whether combat changes need an event
   log/audit trail, how ties sort, and whether source character/statblock changes
   update an active participant. The current record has no session link and no
   conflict control.
8. **Session linking:** Define actual relationships before adding join tables;
   current data cannot populate them. Also decide session-number uniqueness and
   player visibility.
9. **Legacy data quality:** IDs, campaign codes, tags, session numbers, dates,
   and embedded combat fields are not constrained. Import must validate,
   normalize, deduplicate codes, and report rather than silently discard bad
   data.
10. **Offline policy:** Decide whether IndexedDB is a permanent offline cache,
    an exportable local-only mode, or simply a legacy archive. This determines
    conflict resolution and whether any future sync queue is needed.

## Concise, task-sized implementation plan

1. Approve the role, invite-code, visibility, image, and offline decisions in
   the risk list.
2. Create Supabase SQL migrations for `profiles`, campaigns/members, all core
   content tables, Storage metadata, constraints, and indexes—without touching
   application persistence.
3. Add and test RLS policies, player-safe views/RPCs, and Storage policies with
   owner/DM/player/no-member test cases.
4. Add Supabase Auth UI/session integration in an isolated task; never expose a
   service-role key and retain local IndexedDB until migration is accepted.
5. Implement an opt-in, idempotent IndexedDB export/import mapper with legacy
   IDs, validation, and a dry-run/report mode.
6. Replace data access incrementally by feature (campaigns, entries/statblocks,
   characters, maps, sessions, combats), with one source of truth per completed
   feature and regression tests at each step.
7. Add realtime/concurrency controls and only then launch opt-in cloud migration
   while preserving IndexedDB and backups.

# Initial Supabase database foundation

`migrations/20260923000000_initial_data_foundation.sql` provisions only the
first database layer: profiles, campaigns, campaign membership, entries,
statblocks, and characters. It does not connect the browser app to Supabase or
alter its IndexedDB authentication/persistence.

## Applying it

1. Link this repository to the already-created project with the Supabase CLI,
   then run `supabase db push`; alternatively, apply the migration in the
   Supabase SQL editor as the project owner.
2. Confirm the Auth provider(s) and redirect URLs before enabling sign-up. The
   included `auth.users` trigger creates a profile with a unique temporary
   `user_<uuid>` username. A later Auth/profile UX must let users choose and
   validate their real username.
3. Do **not** add a service-role key, database password, or any secret to this
   repository or the browser. Only a future browser integration may use the
   project URL and publishable/anon key.
4. Run `supabase/tests/initial_data_foundation_verification.sql` after applying
   the migration. For RLS tests, create four real Auth test users (owner, DM,
   player, non-member) and issue requests using each user's JWT. The owner
   should call `create_campaign`; the player should call
   `join_campaign_by_code`. Verify that `owner_id` is unchanged, that the
   non-member sees no campaign, and that a player can read only the two
   `player_*` views—not `entries`, `statblocks`, or `characters` base tables.

## Security boundary in this foundation

- `create_campaign` is the only client-granted campaign creation route and
  atomically inserts the owner membership row.
- `join_campaign_by_code` only inserts the caller as a `player`; it does not
  update `campaigns.owner_id`.
- Direct base-table access is restricted to owners and DMs for content. The
  player-safe views intentionally omit `entries.dm_notes` and
  `characters.dm_notes`; players must never be granted base-table SELECT.

## Deferred work

A later migration must add the images table/FKs, combat/map/session tables,
player-safe image access, and any player editing RPCs. A later application task
must replace local login and IndexedDB reads/writes deliberately; no local
password may be imported. If player-visible statblocks need a smaller public
field set, replace `player_visible_statblocks` with an explicit allowlist before
exposing it in a player UI.

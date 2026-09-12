# Working on the pantry

`CLAUDE.md` has pointed at this file since phase 2 and it has never existed, so
project instructions have been empty the whole time. This is it.

## What this is

A pantry tracker. Next.js on Vercel, `sqld` (libSQL) self-hosted on a Hetzner
box in Nuremberg at `db.packthings.fyi`. Raw SQL, no ORM, no abstraction layer -
that is deliberate and predates everything here.

## Things that will bite you

**`quantity` means the open container, not the total.** Since containers
arrived, a stock row is `sealed_count` full packs plus whatever is left in the
open one. `totalOnHand()` in `lib/containers.ts` is the answer to "how much is
there". Three separate bugs have come from testing `quantity > 0`: expiring
items, stocked-ingredient matching, and cooking itself, which capped a take at
the open container and silently under-deducted.

**The cascade rule is written twice**, in `ADJUST_SQL` and in `applyDelta()` -
once so the server is atomic, once so a stepper can move before the round trip.
`npm run check:cascade` runs both over 480 cases. Run it after touching either.

**Three places move stock**: `ADJUST_SQL`, `PACK_SQL`, and the cook action in
`app/recipes/[id]/actions.ts`. They must agree about what a jar is. Undo was
briefly a fourth - it added the delta straight back onto `quantity`, which
restores the right total and the wrong shelf - and now goes through
`ADJUST_SQL` like everything else. A stock write that does its own arithmetic
is the bug, every time.

**sqld allows no pragma control.** `foreign_keys=OFF` is accepted and ignored,
`defer_foreign_keys` likewise, `legacy_alter_table` will not parse. Every
published recipe for rebuilding a SQLite table starts by disabling foreign keys,
so none of them applies. `scripts/rebuild-items.mjs` is the worked example:
write down what the drop would destroy, drop, rename, restore, in one
transaction, discovering referencing tables through `PRAGMA foreign_key_list`
rather than listing them.

**`LIBSQL_URL` is upgraded from `https:` to `wss:` in `lib/db.ts`.** Over HTTP
the client opens a fresh TCP and TLS connection per query and pools nothing.
Set `LIBSQL_PROTOCOL=http` to roll that back without a deploy.

**Tesseract cannot run server-side here.** Its Node build spawns a
`worker_threads` Worker from a file path, which does not survive bundling into
a serverless function - the worker never starts and the request hangs rather
than failing. Receipt reading runs in the browser for that reason.

## Before changing the database

1. `node --env-file=.env.local scripts/clone-db.mjs <file>` - copies live into a
   local SQLite file, DDL and rows.
2. Run the migration against the clone. Run it twice; it must be idempotent.
3. Check `PRAGMA foreign_key_check` and that row counts and links survived.
4. Keep that clone as the backup, then run it for real.

Backups live in `C:\Users\Luna\Documents\pantry\backups\`. Migrations are
additive: `ALTER TABLE ADD COLUMN` and `CREATE TABLE IF NOT EXISTS`, never a
rewrite. Retired columns are frozen in place rather than dropped -
`items.category`, `items.shop`, `items.restock_to`, `items.restock_min` are all
still there as the way back.

## Checks

    npm run check:cascade     the two copies of the container rule agree
    npm run check:receipt     receipt parsing and matching
    npm run check:estimates   the generic-food matcher
    npm run probe             round-trip time to the database

`scripts/ts-imports.mjs` lets plain node import the project's TypeScript, so a
check tests what ships rather than a copy of it:

    node --import ./scripts/ts-imports.mjs scripts/whatever.mjs

## House style

Comments say **why**, not what. A comment that restates the line above it is
noise; one that records a decision, a trap, or a thing that was got wrong once
is worth keeping. Most of the comments in this codebase exist because something
was wrong before.

Commit messages are prose, imperative, and explain the reasoning. They are the
real history of why the thing is shaped as it is.

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

**`lib/db.ts` imports `@libsql/client/web`, and that slash-web matters.** The
default export resolves to the node build, which depends on an 8.5MB native
addon so a `file:` URL can open a SQLite file directly. Nothing in the app
opens a file - it talks to sqld over a WebSocket - but Vercel traces a bundle
per route and 41 of 51 functions each got a copy: 347MB of the 540MB stored on
every deployment, for a binary nothing calls. Storage is counted across every
deployment retained, and the free tier's 10GB had gone to 16GB. Changing the
import back "to be consistent with the scripts" puts all of it straight back.
The scripts import `@libsql/client` on purpose - `clone-db` and
`check-cascade` really do open local files, and they ship nowhere.

**`du` on `.next/server` lies about deployment size.** It said 8.9MB while the
real figure was 540MB, because it does not see the `node_modules` that file
tracing copies into each function. `npm run check:bundle` reads the
`*.nft.json` trace lists and reports size times number-of-functions, which is
what Vercel actually charges for. Vercel keeps the last 20 production
deployments whatever the retention policy says, so the steady state is roughly
twenty times that number - budget against 20x, not 1x.

**A recipe line may have no amount at all.** `some` is a unit with no
dimension - "salt, to taste", "oil for frying" - and every conversion refuses
it with `reason: "unmeasured"`, which is deliberately not the same as
`unknown-unit`. Five places convert a recipe line and each has to tell a
decision to respect from a mistake to report: cooking subtracts nothing, the
shopping list leaves it alone if you have any, nutrition skips it rather than
calling a pinch of salt a hole in the figures. One miss puts salt on the
shopping list for ever. `npm run check:amounts`.

**"What is this recipe short of" lives in one place.** `recipeShortfall()` in
`lib/shopping.ts`, used by the add-what's-missing button and by the week
planner's Shop for it. It was a hundred lines inside a server action, and a
second copy of it is a sixth instance of the bug this file keeps a count of.

**"How many days until this date" is `daysUntil()` in `lib/dates.ts`, and
nothing else.** There were two of them. `daysUntil` subtracted the current
INSTANT from the target date's midnight and floored the fraction - and
`Math.floor` rounds a negative away from zero - so a thing that went off
yesterday afternoon read as two days ago, wrong by a day for every moment that
was not exactly midnight. The SQL in `getExpiring` did the same subtraction and
truncated toward zero, so it answered one. One item, three screens, three
numbers. The SQL copy still exists and still sorts the query, because ordering
only needs to be monotonic - but it is never the number shown, and rendering
`days_left` puts the bug straight back. `npm run check:dates`, which pins the
clock, because a test that asks the real time passes at midnight and fails at
teatime.

**Dates in the planner are days, not instants.** "Thursday dinner" is a fact
about the kitchen's calendar, so `meal_plan.on_date` is 'YYYY-MM-DD' text and
`fromIso` pins to noon - `new Date("2026-03-29")` parses as UTC, which on the
morning the clocks go forward is 01:00 local. The week starts Monday, and
`getDay()` is 0 on Sunday, which is the off-by-one everybody makes.
`npm run check:plan`.

**The nudge reads London's clock, not the server's.** Deploys to Frankfurt,
used in Britain: a reminder set for six on a Sunday would arrive at five, and
twice a year the gap changes. `londonNow()` asks Intl. `npm run check:push`.

**Tesseract cannot run server-side here.** Its Node build spawns a
`worker_threads` Worker from a file path, which does not survive bundling into
a serverless function - the worker never starts and the request hangs rather
than failing. Receipt reading runs in the browser for that reason.

**A count that is wrong reads as "delete this feature".** `usage_events` and
`lib/usage.ts` record what gets pressed, against a closed list of names in
`ACTIONS` - closed because the counts are only comparable if the names are
stable, and because the route drops an unknown name silently. Which means a
typo in a `data-track` attribute, or a name added to the list and never wired
up, both arrive in the report as a zero, and a zero is a number somebody acts
on. `npm run check:usage` walks both directions. `record()` never throws and is
never awaited: the button matters and the count does not.

**A guessed expiry date must never look like a read one.** `lib/shelf-life.ts`
fills in a date for food nobody dated - 34 of 47 items had neither a packet
date nor a once-opened life, so the rescue engine, the heaviest weight in the
tonight ranker and the Sunday nudge were all blind to most of the kitchen. The
guess is only offered for food `estimateFor` actually recognises, because a
confident wrong number is worse than a blank: a blank invites a correction and
a number does not. `items.expiry_estimated` carries the marking all the way to
the screen, an estimate is never drawn in the alarm colour however far past it
is, and nothing anywhere tells anybody to throw food away on one. Two numbers,
not one - `keeps` is sealed from today, `openFor` is after opening, and the
schema is emphatic that they differ. `npm run check:shelf-life`.

**There is one notification and the bar for a second is high.** Five phases
were spent deliberately not having any - a thing with unread items in it is a
thing to keep up with. `notifications` exists for one case, chosen 15 Sep 2026:
somebody cooked a recipe you wrote. The argument was that writing a recipe down
is the only thing in here done for other people, and it was the only one that
gave nothing back. A second `kind` needs that same argument - somebody else's
action, about something you made, that you would otherwise never learn. A like
is a tap; it does not qualify. The row is keyed to the `cook_event` rather than
describing it, because a cook can be undone and "@luna cooked your ragu" for a
cook that did not happen is worse than silence - and undo marks `undone_at`
rather than deleting, so the cascade never fires and `forgetCook` has to.

## Before changing the database

1. `node --env-file=.env.local scripts/clone-db.mjs <file>` - copies live into a
   local SQLite file, DDL and rows.
2. Run the migration against the clone. Run it twice; it must be idempotent.
3. Check `PRAGMA foreign_key_check` and that row counts and links survived.
4. Keep that clone as the backup, then run it for real.

Some changes cannot be additive: `shopping_list.kitchen_id` had to become
nullable so a person without a kitchen could keep a list.
`scripts/rebuild-shopping-list.mjs` is the second worked example after
`rebuild-items.mjs`, and the easy case - nothing in the schema points at a
shopping list line, though it discovers that rather than assuming it.

Backups live in `C:\Users\Luna\Documents\pantry\backups\`. Migrations are
additive: `ALTER TABLE ADD COLUMN` and `CREATE TABLE IF NOT EXISTS`, never a
rewrite. Retired columns are frozen in place rather than dropped -
`items.category`, `items.shop`, `items.restock_to`, `items.restock_min` are all
still there as the way back.

## Checks

    npm run check:cascade     the two copies of the container rule agree
    npm run check:amounts     ~, "to taste", and how an amount is said
    npm run check:recipe-text pasted plain text becoming a recipe
    npm run check:dates       one answer for "how many days until"
    npm run check:bundle      what a deployment costs Vercel to store
    npm run check:plan        week arithmetic, DST, meal slots
    npm run check:push        when the weekly nudge decides it is due
    npm run check:receipt     receipt parsing and matching
    npm run check:estimates   the generic-food matcher
    npm run check:usage       every counted name is one the server accepts
    npm run check:shelf-life  how long food lasts, and the date arithmetic
    npm run probe             round-trip time to the database

`scripts/ts-imports.mjs` lets plain node import the project's TypeScript, so a
check tests what ships rather than a copy of it:

    node --import ./scripts/ts-imports.mjs scripts/whatever.mjs

## Reports

People write in from `/report`, and whoever is admin decides on `/reports`.
The `reports` skill in `.claude/skills/` is the step after: it reads the
approved ones, does them, and marks each done with a note the reporter sees.
`scripts/reports.mjs` is how it talks to the database.

## House style

Comments say **why**, not what. A comment that restates the line above it is
noise; one that records a decision, a trap, or a thing that was got wrong once
is worth keeping. Most of the comments in this codebase exist because something
was wrong before.

Commit messages are prose, imperative, and explain the reasoning. They are the
real history of why the thing is shaped as it is.

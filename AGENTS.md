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

**A recipe off a video is fetched, never transcribed by a model.** A cooking
video almost always has the recipe written down beside it - YouTube's
description, a reel's caption - so `lib/video-import.ts` finds that text and
hands it to `readRecipeText`, the same reader a paste goes through. Four
things it knows that are not obvious. **This cannot be done in the browser**,
however much it looks like it should be: youtube.com and instagram.com send no
CORS headers, so a client-side fetch is refused before it is read and `no-cors`
returns an opaque response of zero readable characters - measured, in Chromium,
both sites, three routes. The only endpoint that answers cross-origin is
YouTube's oEmbed, which carries a title and a thumbnail and no description. So
it is a server fetch, and the server has its own problem: **YouTube's player
endpoint answers a laptop and refuses a datacentre**, which is where this
deploys, so the feature worked locally and nowhere else. The route that is
answered from anywhere is the watch page asked for as a link preview - a
crawler user-agent - and the page still carries the full description in the
same blob the player would have returned. The player clients are tried first
anyway, because they are the only route that also carries **captions**:
YouTube's web caption URLs answer with 200 and an empty body, wanting a token
the browser mints in JavaScript, while the IOS and ANDROID clients are not
asked for one. Which means transcripts work in development and are **absent in
production**, and that is the honest state of it: `video.google.com/timedtext`,
`api/timedtext` bare, with `kind=asr`, and every `fmt` all answer 200 with zero
bytes. Which is survivable only because of the route that does the real work -
a cook who does this for a living writes two sentences and "Get the recipe
here", so when a description carries no ingredient list the links in it are
followed (not the channel, the playlist, the socials or the Amazon shelf) and
the page read for schema.org markup, which nearly every food site publishes for
search engines. It gives amounts as the strings a person typed, so it goes back
through `readRecipeText` as text rather than being built into a document here.
Two videos that produced three useless paragraphs now give fourteen ingredients
and fifteen. Text with no amounts anywhere in it is marked `thin` and the
screen says so, because a draft with one ingredient called "Recipe by
@somebody" looks like it worked. **Markup can be a shell**: Squarespace
declares a Recipe with an empty `recipeIngredient` and types the list into the
page body, so the body is flattened to lines and carved by its own
"Ingredients" and "Directions" headings - by the longest run of amounts, as a
description is carved, a page with pickles, sauce and burger under three
sub-headings gives you one of the three. And **the bot check is a mood, not a
fact**: the same video went through from production four times and was refused
the fifth with "Sign in to confirm you're not a bot", so the page is asked for
as a crawler and then as a browser, and the refusal message tells the person to
paste the recipe link from the description instead - which works, because a
recipe page pasted in is read directly.

**Client-side fetching cannot rescue any of this**, and it is the first idea
everybody has. Measured in Chromium: the watch page and the player endpoint
are both refused cross-origin (`text/plain` to dodge the preflight is refused
too), a caption URL **from the player endpoint** is readable - 359k characters,
so the transport is not the problem - and the caption URL from the watch page
returns 200 and zero bytes to the browser exactly as it does to the server.
The only working caption URL comes from the one endpoint neither the browser
nor a datacentre can call. There is nothing to hand to the client. Auto-captions **roll**, repeating each
line as they scroll, and the repeats arrive as `aAppend` events - joining the
file naively says everything three times. And a description is mostly advert:
the one that made `carveFromDescription` necessary had its ingredients on lines
23 to 36 of sixty and read whole it produced two ingredients and fifty-five
steps, so the ingredient list is **found** - the longest run of lines stating an
amount - rather than hoped for. Instagram answers a crawler user-agent with the
caption in og:description and a logged-out browser with nothing. The fetched
text lands in the paste box rather than becoming a recipe, because a transcript
is a machine's guess at speech and the amounts are the half it gets wrong.
`npm run check:video`.

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

**Stock is not a tab.** Decided 15 Sep 2026. The shelf lives under the answer
on `/tonight`, because what is in the kitchen is part of deciding what to cook
rather than an errand of its own - three tabs and the add button, in four equal
columns. `/pantry` is still a route and still owns the list, the groupings, the
bulk actions and selection mode; it is reached from "As a list" on the shelf
and from every item link, not from the tab bar. Pages that used to light up the
Stock tab pass `active="none"`.

**What shape a thing is, is decided in one place.** `lib/vessel.ts` answers it
from the name and the unit, because nothing in the database says "jar" - there
is no packaging column, Open Food Facts is never asked, and `count_noun` is
empty on every row. The rule learned from running it over the real kitchen is
**the name beats the unit**: half the rows are "there is some, nobody said how
much" placeholders and every one of those is stored as mass whatever it is, so
a unit-first rule drew Olive oil and Milk as bags - while Paprika and MSG are
stored as `1 count`, so counting first drew spice jars as pips. Both directions
are pinned in `npm run check:vessel`.

Two components draw from it and neither may grow its own copy:
`components/vessel.tsx` is the control you DRAG to say how full something is,
and `components/shelf-vessel.tsx` only ever reports. **The silhouettes they
draw are also shared**, in `components/vessel-shapes.ts` - they were not, and
tapping a soy sauce on the shelf opened a page showing a visibly different
soy sauce. The shapes are a 60x76 box and anything drawing bigger scales them;
a second set is a second idea of what a bottle is. The classifier used to
live inside the client component, where `scripts/ts-imports.mjs` could not load
it - a .tsx is invisible to the check harness, so every rule in it was
untestable. Anything a check needs to ask belongs in `lib/`.

Being wrong about a shape is deliberately cheap - a bottle drawn as a jar still
shows the right amount at the right level - so it needs no marking, unlike the
expiry guess. `fillFor` is the half that must never lie: it returns null rather
than a plausible level for an `unspecified` row or one with no pack size.

**Every exported function in a `"use server"` file is a live endpoint.** Not
"a function the UI calls" - a URL, reachable by anyone who is past the auth
gate, whether or not a component references it. `removeRecipe` had no
authorisation at all and nothing in the app called it, which is exactly why
nobody noticed: it was a way for any of six accounts to delete any recipe by
id. The owner goes in the `WHERE` clause, never in a caller's `if` - see
`docs/AUTHZ-2026-09-15.md` - and a function that needs one should require it in
its signature so the compiler catches the caller that forgets.

**Being allowed to SEE something is not being allowed to CHANGE it.**
`getRecipe(id, viewer)` answers visibility. Two write paths used it as if it
answered permission, so anybody could overwrite a recipe shared with them.

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
    npm run check:vessel      what shape a thing is, and whether it has a level
    npm run check:video       a video link becoming text worth reading
    npm run check:substitutes what can stand in, and "powder" is not enough
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

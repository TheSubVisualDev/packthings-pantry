# Where I'm at

Live progress on the tester-feedback round. Updated as I go — check the
timestamp to see how fresh it is.

**Last updated:** 22 Sep 2026 — interaction audit approved, building it
**Doing right now:** #1, sheets opening underneath pinned buttons
**Waiting on you:** nothing

### 22 Sep, the interaction audit

Fifteen findings in `docs/AUDIT-2026-09-22.md`, each put to you. Approved:
everything except two parts of #9 (the repeated name and the single Save stay
as they are). #12 was answered with "up to two days past".

- [ ] 1 sheets above pinned buttons
- [ ] 2 "Cooked it"
- [ ] 3 back goes where you came from, one name per place (+13)
- [ ] 4 blank name boxes
- [ ] 5 substitutes need more than a shared "powder"
- [ ] 6 ticks: not-in-stock start unticked, whole row toggles
- [ ] 7 the shelf's "?" for things with an amount
- [ ] 8 quick adjust's step size
- [ ] 9 readable dates on the item page
- [ ] 10 plan hint to the top
- [ ] 11 discover: no repeats, calm caps, no empty suggestions
- [ ] 12 past food counts for two days
- [ ] 14 instant ticks at the end of a shop
- [ ] 15 source link, counts, "open", paste page

### 17 Sep, three pieces of friction

**Cooking no longer asks to be let in first.** The Cook button, the ingredient
ticks and the shopping link all only appeared once a recipe was in the
cookbook. Press Cook now and it adopts the recipe itself — writing only the
links it is sure of, so nothing is settled in your name about a shelf you have
not shopped for yet.

**"Shop for it — 3 things"** is a button on the tonight card instead of a line
of underlined text, and the shopping-trip strip is on /tonight, which is the
screen you open in a shop. That strip has said in its own file all along that
it belonged there.

**A recipe can be planned onto a day from the recipe page** — seven days, your
own meal names, one tap, and it is waiting on Tonight when the day comes.

A correction to what I said earlier today: the zeros are not all the same kind.
Everything older than today is already in somebody's cookbook, and six meals
have been cooked — all before counting started on the 15th. So `cook.start` at
zero is two quiet days, not a blocked funnel. The gate was still real for a
recipe that has just arrived, and the three imported today are in nobody's
cookbook. But `meal_plan` and `pinned_recipes` have never held a row in the
app's whole life. Those two are the honest zeros.

Page speed is not the problem either: 210–390ms a page, warm, measured against
production on a phone viewport.

### 17 Sep, a recipe off a video (#26)

Paste a YouTube link or an Instagram reel into the paste screen and press
Fetch. It takes what the cook wrote down — the description or the caption —
and falls back to the spoken captions when they wrote nothing. No model, no
key, no bill.

The text lands in the paste box rather than becoming a recipe, so you see what
it found before anything is read. Where it came from is said on the screen,
and a transcript says so in the alarm colour, because machine captions are
where an amount goes wrong.

Driven against four real links: a description with the recipe in it (13
ingredients, amounts and notes intact), a reel (12 ingredients, 9 steps), a
video with nothing written down (falls to the transcript and says so), and a
link that is not a video at all.

Then it failed for you on the deployed app while working here, twice over.
YouTube's player endpoint answers a laptop and refuses a datacentre; it asks
for the watch page as a link preview now, which is answered from anywhere.
Instagram was a different fault wearing the same error — the share sheet's
`/share/reel/<token>` was being rebuilt into a link to a post that does not
exist. Both verified against pantry.packthings.fyi, not just locally.

Then two of your videos read as three useless paragraphs, because a cook who
does this for a living writes "Get the recipe here" and links out. It follows
that link now and reads the recipe markup on the page: those two give fourteen
ingredients with nine steps, and fifteen with five. A recipe page pasted
straight in works the same way.

**Transcripts do not work on the deployed app.** Captions only come with
YouTube's player endpoint, which refuses a datacentre, and every other caption
route answers 200 with an empty body. They work locally. In practice it
matters less than it sounds: a transcript is the worst source of an amount
there is, and the linked page is the best.

When there is nothing with amounts in it anywhere — a reel captioned "swipe
for the recipe" — the screen says so instead of making a draft with one
ingredient in it.

A page whose markup is an empty shell — Squarespace declares a Recipe and
leaves the ingredients out of it — is read from the body instead, carved by
its own Ingredients and Directions headings. Joshua Weissman's burger gives 42
ingredients and 16 steps, both burgers, every section kept. Two lines in it
are section titles the reader takes for unmeasured ingredients ("Smash
Burger", "Thick and Juicy Burger"); delete them in the editor.

YouTube's bot check on a datacentre comes and goes — four videos through, the
fifth refused. It asks the page as a crawler and then as a browser, and when
everything is refused it tells you to paste the recipe link out of the
description, which this reads directly.

#22 — photograph a cupboard, have it become stock — is still parked. That one
really does need a model.

### 17 Sep, the admin screens

`/admin/usage` exists. Everything `lib/usage.ts` could already answer and
nothing ever asked it: what gets pressed, by how many people, on which screen,
day by day over 7, 30 or 90 days — and underneath, the names that have never
once fired, which is the half worth reading. The date counting started sits
next to that list, because the tracker only went in on 15 Sep and a zero from
two days is not a zero from a month.

As of today: 39 taps, 4 people, 7 of the 18 names used. `recipe.open`,
`stock.adjust` and `stock.open` are nearly all of it. `cook.start` has never
fired, which is the one to watch.

`/admin/db` is a tree now — table, then its columns and rows, then a row's
cells. The old strip of pills answered "show me this table" and never showed
the shape of the database at all. A branch costs a round trip when you open
it and nothing before; the URL follows the last one opened, so the screen is
still a screen you can send. The query box, the locked columns and the
ask-first delete are unchanged.

### Two things to press when you next open it

1. **A bug report with a picture on it.** Every report since 14 Sep lost its
   photo silently - reports 7 to 11 have one, 12 to 25 have none. The reset of
   the file picker moved above the line that reads the files, and a FileList
   empties when you clear the input. Driven end to end in Chromium and WebKit
   before and after.
2. **Scan something you already own.** It adds a sealed pack now rather than
   pouring the contents into the open one, which is what it did.

### 17 Sep, the friction audit

An unbiased pass over the app came back with twelve points of friction; you
approved eleven and left ingredient drag-reordering alone.

Built: barcode restocking goes through PACK_SQL (and the panel's "in stock"
figures count the whole shelf); undo survives the toast, on /cooked and on
the recipe, for a day; the receipt reader adds a missing item in place
instead of navigating away and losing the receipt; a guessed date is marked
in the edit form and can be asked for one item at a time; the new-pack prompt
offers the standard life; the add form has "Add another" and points at the
receipt reader; the untracked-amount checkbox comes before the fields it
skips; the receipt reader has a progress bar; quick-adjust errors say which
item; and the shop filter for Running Low is one rule in one query.

Not looked at in a browser: the two receipt-reader changes, which need a real
receipt to reach. Everything else was photographed.

### 15 Sep, in one line

Three approved reports collated: the app now counts what gets pressed, the
recipe page and Discover had the friction taken out of them, and the pen
test's headers are finally on. One report left open by choice — photographing
a cupboard waits for agentic support.

**Open item corrected.** The note below said /tonight and /plan were two
suggestion engines free to disagree. They are not: `fillTheGaps` has always
called `rankTonight` over `getTonightFacts`, the same pair /tonight uses, so
there is one engine and always was. The real disagreement was narrower and
worse — /tonight never read the plan at all, so a curry planned for Thursday
on Sunday was invisible on Thursday and the app cheerfully suggested something
else. Fixed: the plan leads, the ranking is "or something else".

**P7 is decided: tell them.** Somebody cooking a recipe you wrote is now the
one notification this app has, and the bar for a second one is written into
AGENTS.md so it stays that way.

**Shelf life is in.** 34 of 47 items had no date and no once-opened life, so
the rescue engine was blind to three quarters of the kitchen. Guesses are
marked, muted, and never say "throw this away".

**The database key is rotated.** The pre-rotation token is dead - it now
returns `AUTH_JWT_INVALID`, tested rather than assumed. Four minutes down.
The new token expires 14 Dec 2026 and renewing it needs no downtime, because
the key does not change. `docs/ROTATE-DB-KEY.md`.

**Left on the box:** `db.packthings.fyi` still answers the open internet and
still tells anyone its version. Restricting it at Caddy needs a decision about
Vercel's egress addresses changing.

### 14 Sep, in one line

Three independent auditors walked the app; sixteen findings, six of them
blockers, all fixed and pushed. Four of those findings were in code written
that same morning by the agent that then reviewed it and passed it clean,
which is the entire argument for having had somebody else look.

Full write-up, with what each auditor found and where it was wrong, in
`docs/AUDIT-2026-09-14.md`.

### What changed, by area

**The importer** — a cook time overwritten by prep time (a regression shipped
that morning, in the same commit that added its own tests, which never tested
a recipe with both lines); wrapped numbered methods torn apart line by line;
a wrapped headnote split between the description and "what happened last time
you made it"; "1-inch piece of ginger" stored as "Inch piece of ginger".

**Dates** — one rule instead of three. `daysUntil` was comparing an instant to
a midnight and flooring it, so anything past its date read a day worse than it
was. `npm run check:dates` pins the clock, because a date test that asks the
real time passes at midnight and fails at teatime.

**The front door** — `/tonight` is where the app opens; the promotional banner
is off the stock page; Discover no longer lists your own recipes back at you.

**The editor** — three fields per ingredient instead of six; blank rows and
blank steps no longer block a save; you can name a recipe before writing it;
tag suggestions come from the recipe rather than from your most-used tags.

**Feel** — cooking has a payoff instead of a receipt; stock rows swipe both
ways; the stagger stopped hiding rows it never got round to animating.

**Vercel** — 540MB per deployment down to 135MB, mostly one native SQLite
driver that nothing calls, copied into 41 of 51 functions. Vercel always keeps
the last 20 production deployments, so the floor was 20 x 540MB and the 10GB
free tier was never going to hold it. It resolves itself as the old
deployments roll out.

### Still open, as projects rather than fixes

1. ~~**Merge `/tonight` and `/plan`.**~~ Done 15 Sep, and the premise was
   wrong — see above. There was one ranker all along; what was missing was
   /tonight reading the plan. The pages stay separate on purpose: one answers
   "what tonight, given what is in", the other "what this week, and what do I
   need to buy". Merging the screens would have cost /tonight the thing it is
   good at, which is one fast decision at six when you are hungry.
2. **Read the use-by date with the camera.** Tesseract already runs in the
   browser for receipts. Must confirm before saving — a barcode misread as a
   date is worse than an empty field.
3. **Swipe between the four tabs.** Luna's idea. Note the conflict before
   building it: stock rows now take horizontal swipes themselves, so a
   page-level swipe would fight them on the one screen people use most.
   Probably wants the page gesture to start from a screen edge.

### Lessons worth keeping

- Subagents only committed at the very end, so when all three hit the session
  limit mid-flight their work was nearly lost — it was recovered by hand from
  their worktrees. Tell them to commit incrementally.
- An agent that walks flows for real changes the data it is judging. Both
  walking auditors left rows behind, and one reported a shelf its own cooking
  had emptied as a matching bug. Clone the database or have them log what they
  create.
- One agent ran a blanket `taskkill //F //IM node.exe` and killed every dev
  server on the machine, including the other agents'. Worth saying explicitly
  in a worker brief: never use a process kill that is not scoped to your own
  port.

---

## The tester-feedback round, before the audit

| | | |
|---|---|---|
| #17 | Story-style recipe editor | done `e57f880` |
| #18 | Recipe not keeping its servings | done `c7a5a40` |
| #19 | Desktop recipe editor | done `c7a5a40` |
| #20 | Desktop design pass | done `275dc7a` |
| #21 | Vercel storage warning | half done `4fbedf0` |

**#17** — three stages: what goes in it → how it is made → what it is called,
with one instruction per screen. New, editing and pasting all use it. Two
importer bugs fell out of testing it: a "Serves 6. Takes 40 minutes." line
became an ingredient, and so did "Sift the flour...".

**#18** — a tray of 16 flapjacks opened as 2 servings. Not a cache: the
kitchen's "usually cooking for" was overruling what each recipe said about
itself. It now only applies to recipes you write yourself.

**#19 + #20** — the editor preview is a phone in a frame with the form taking
the rest of the width; the recipe page is two columns with the method beside
the ingredients; the week planner shows seven days across. Phones unchanged.

**#21** — dropped source maps from the build: server output went 31MB → 8.9MB,
so every future deploy costs a third of what it did. The other half is below.

---

### Report #17 — the recipe editor, a bit at a time · done

The tall editor is three stages now: what goes in it → how it is made → what
it is called. Inside the method, one instruction per screen with numbered pips
to jump between them. Forward and back mean the next instruction inside the
method and the next stage everywhere else.

- Both authoring and editing use it, and so does pasting — both ways in.
- Pasting lands on **Check it through** rather than **Edit recipe**.
- Nothing is unmounted, so paging around loses nothing you typed.
- Reordering a step takes the cursor with it.
- Editing keeps a "skip to the details" shortcut.

Two importer bugs fell out of testing it:

- `Serves 6. Takes 40 minutes.` became ingredient number one. The headline
  time is now read and kept — but only off a line that is nothing else.
- `Sift the flour...` became an ingredient, because the list of verbs a method
  opens on was written from savoury recipes. Knead, prove, chill and sieve are
  on it now. Cream and batter deliberately are not: they are also things you
  buy.

---

## Batches

| | Batch | State |
|---|---|---|
| A | Six visual fixes from the screenshots | **done, pushed** `04cd93f` |
| B | `~` approximate amounts and "to taste" | **done, pushed** `6fc9246` |
| C | Paste a plain-text recipe and have it parsed | **done, pushed** |
| D | Bug report / feature request, with photos | **done, pushed** |
| E | Shopping lists without a kitchen | **done, pushed** |
| F | Weekly meal planner + nutrition | **done, pushed** |

---

## A — six visual fixes · done

Pushed as `04cd93f`.

1. **"In stock" and "To buy" were the same grey chip** — the real bug behind
   img1. Different shapes now: a tick against an outlined basket.
2. **The filled circle read as "you have this"** — it is the cooking
   checklist. One line above the list says so.
3. **Ingredient lines lead with the amount** (img5) — "2 packs Tortellini"
   over "600g · preferred filling". Units say themselves properly: two tins,
   not two tin.
4. **Quick adjust rows stopped wrapping** (img2) — a long name pushed the
   stepper onto its own line against the left edge.
5. **Search placeholder fits** (img3), **Save button no longer ghosts**
   (img4) — it changed width on top of a backdrop-blur, which iOS paints
   twice.
6. **Tap the sides of the cook screen to move** (img6) — plus arrow keys.
   The footer buttons stay.

## B — approximate and unmeasured amounts · done

Pushed as `6fc9246`. Migration run against a clone twice, then live. Backup
at `../backups/pre-approx-2026-09-13.db`.

- Type `~70` in the quantity box → reads "~70g Brown Onion" everywhere. Still
  comes off the shelf; just stops claiming a precision nobody had.
- New unit **to taste** in the dropdown, for a seasoning with no amount at
  all. Cooking subtracts nothing. The shopping list leaves it alone if you
  have any and lists it if you have none. Nutrition skips it.
- `npm run check:amounts` — 40 cases.

## C — paste a plain-text recipe · done

No LLM involved — it is regex heuristics, which is why it could be built.
`/recipes/paste` now opens on **Written out** instead of JSON, and it is in
the + menu rather than three taps deep behind the Claude page.

Reads: `2 x 400g tins chopped tomatoes` (two numbers, both kept), `1 onion
(about 150g)` (the brackets are a note, not the amount), fractions both
written and vulgar, ranges, `oz`/`lb`/`cups` converted and reported, `salt
and pepper to taste` split in two, sections, and a paste with no headings at
all. It never invents an amount: a line it cannot read comes back unmeasured
with the original words kept.

Nothing saves until you have looked at it, and Keep it lands in the **editor**
rather than the recipe page, because a read recipe is a draft.

`npm run check:recipe-text` — 50 cases.

## D — bug report / feature request · done

Exactly the flow you asked for.

1. **`/report`** — one form, both halves. A toggle at the top: *Something's
   broken* / *I wish it did*. One line is all that's required, up to four
   pictures, and it fills in which page they were on and which browser by
   itself. In the account menu as **Report or request**.
2. **`/reports`** — yours only. Anyone else gets a 404, not a refusal: a page
   that says "you're not allowed" has told them there's a there.
3. **The tinder bit** — one card, swipe it, drag tilts it and fades in
   ON THE LIST / NOT FOR NOW. Arrow keys work. Buttons stay for anyone who
   doesn't know the gesture. Undo puts the last one back.
4. **Say "collate the reports"** and the `reports` skill takes the approved
   ones oldest first, looks at the screenshots, does them, and marks each
   done with a note that the person who reported it sees on their own page.

Nothing is deleted by a swipe. Clearing the turned-down ones is a separate
command I'll confirm with you first — an idea that keeps being asked for
after it was turned down is worth knowing, and a deleted row can't tell you.

`@admin` is the one who can triage. `scripts/reports.mjs admin <handle>`
adds another.

## E — shopping lists without a kitchen · done

A list belongs to a kitchen **or** to a person now. No kitchen gets the list
and nothing else — restock, shop grouping and the trip all compare it to
shelves that aren't there, so they're off rather than dead. "Add what's
missing" from a recipe works and adds everything, which is correct: with no
shelves, everything is short.

Needed a table rebuild (`kitchen_id` was NOT NULL and SQLite can't drop a
constraint). `scripts/rebuild-shopping-list.mjs`, dry-run then applied,
backup at `../backups/pre-personal-list-2026-09-13.db`.

## Also fixed, from you mid-session

**The pictures field didn't update when uploading.** Two causes. The preview
went through `next/image`, which only accepts the hostnames next.config
allows — a `blob:` URL isn't a hostname, so it failed silently and the frame
stayed empty. Underneath, the object URLs were being revoked immediately
after creation by React's development double-mount. Both fixed and driven in
a real browser: preview decodes, upload lands in Blob.

## F — weekly meal planner + nutrition · in progress

What you asked for: **up to 3 meal slots a day (configurable) across 7 days**,
a **Sunday push notification** (configurable) to plan the week ahead, nutrition
**totalled across the planned week** with compare-to-actual coming later, and
to do something fun with it.

Four stages, each pushed as it lands.

| | Stage | State |
|---|---|---|
| F1 | Schema, the week grid, configurable slots | **done** |
| F2 | The fun bit + shop for the whole week in one go | **done** |
| F3 | Nutrition totalled across the planned week | **done** |
| F4 | The Sunday nudge — service worker, web push, cron | **done** |

`/plan` — seven rows, not seven columns, because seven columns on a phone is
fifty pixels a cell. Reachable from Tonight and the + menu.

- **Up to 3 meals a day**, named by the kitchen, defaulting to dinner alone.
- A slot takes a recipe **or** a line of text — Leftovers, Out, Takeaway.
- Every planned meal draws in its recipe's own tint, so a planned week is a
  stripe of colour and four days of the same brown are visible at a glance.
- **Fill the gaps** runs the `/tonight` ranker: uses up what's going off,
  never repeats within the week, only fills forwards, and tells you when it
  ran out of recipes rather than going round the cookbook twice.
- **Shop for it** — one trip for seven dinners, judged against one snapshot
  of the shelves so pasta twice in a week isn't bought twice.
- **Repeat next week**, because most weeks are mostly last week.
- **Nutrition per plate**, with the week total under it and a plain count of
  how many planned meals are actually behind the number.
- **The nudge** — pick any day and evening hour. Reads the week before it
  sends, so "nothing planned yet" and "four meals in, finish it off?" are
  different messages.

`npm run check:plan` (dates, DST, slots) and `npm run check:push` (when it
fires, across both clock changes).

---

## The one thing left for you — old Vercel deployments

Vercel keeps every deployment, and that is most of the 7.5GB. This removes
every one that is not serving a live domain:

```
vercel remove packthings-pantry --safe --yes
```

`--safe` protects anything with an active alias, which is the deployment
`pantry.packthings.fyi` points at — I checked, it is the current one. It also
deletes the previous production build, so instant rollback goes; a redeploy
from git takes about 30 seconds instead.

I tried to run this and my own safety check blocked it as a bulk delete.

---

## Previously, for the nudge

The Sunday nudge needs five variables on Vercel. They're already in your
`.env.local` — copy them across:

```
vercel env add VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production
vercel env add NEXT_PUBLIC_VAPID_KEY production
vercel env add VAPID_SUBJECT production
vercel env add CRON_SECRET production
```

Until then the settings panel says notifications aren't set up, and nothing
else is affected.

**Then test it on your phone**, not in a browser tab: Settings → Plan the
week → Nudge me → Send one now. I couldn't verify delivery from here —
headless Chromium refuses notifications outright, which is exactly why that
button exists. On an iPhone it only works once the app is on your home
screen.

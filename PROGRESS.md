# Where I'm at

Live progress on the tester-feedback round. Updated as I go — check the
timestamp to see how fresh it is.

**Last updated:** 14 Sep 2026 — audit round closed, 13 commits pushed
**Doing right now:** nothing
**Waiting on you:** how the swipe sensitivity actually feels in the hand. The
thresholds were guessed with a mouse and a thumb is not a mouse.

### Today, in one line

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

1. **Merge `/tonight` and `/plan`.** Two suggestion engines answering one
   question, free to disagree with each other the way the date code did. Risk:
   `/tonight` is tuned for one fast decision at six when you are hungry.
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

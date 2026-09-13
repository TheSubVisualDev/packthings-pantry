---
name: reports
description: Work through the bug reports and feature requests people have sent from inside the pantry app and that Luna has approved on the triage screen. Use when asked to "collate the reports", "do the approved reports", "what has come in", "go through the bug reports", or to clear out the turned-down ones.
---

# Working through what has come in

People write in from `/report` inside the app. Luna decides what happens to
each one on `/reports`, swiping through them one at a time. This skill is the
step after that: taking the approved ones and actually doing them.

The decisions are already made. **Do not re-litigate them.** An approved report
is work to do, and a turned-down one is not up for discussion — if you think a
turned-down report was a mistake, say so in one sentence at the end and leave
it turned down.

## Reading the queue

```
node --env-file=.env.local scripts/reports.mjs list
```

That gives the approved ones in full — title, body, which page they were on,
which browser, and the URLs of any screenshots. Oldest first, which is the
order to work in.

Other things it does:

| | |
|---|---|
| `list new` | not yet decided — tell Luna to triage them, do not decide yourself |
| `list rejected` | turned down |
| `list done` | already dealt with, with what was done |
| `list all` | everything |
| `show <id>` | one report in full |

**Look at the screenshots.** Read the photo URLs with WebFetch or fetch them.
Every useful report in the last round came with one, and half of them were
about something only visible in a picture — two buttons painted on top of each
other, text cut off mid-word. A report you have only read the title of is a
report you are about to guess at.

## Doing them

Work in the order the list gives them. Group ones that touch the same file or
the same idea into a single commit — three reports about the ingredient row are
one piece of work, not three.

For each one, before you start, decide which it is:

- **Small and obvious** — just do it.
- **Big, or a decision about what the app is** — do not build it on the
  strength of a swipe. Approval means "worth doing", not "and here is how".
  Put the options to Luna first.
- **Already fixed** — check. Some of these will have been sitting a while.
  Mark it done saying which commit did it.

Follow `AGENTS.md`. Run the checks it lists. If the change touches the
database, clone first — the rules for that are in AGENTS.md and are not
optional.

## Closing them off

When a report is actually done — the change is committed, not merely written:

```
node --env-file=.env.local scripts/reports.mjs done <id> "what was done"
```

The note is shown to whoever wrote the report, on their own `/report` page, so
write it for them and not for a changelog. "The Save button no longer paints
twice — it was resizing on top of a blur" rather than "fixed in 04cd93f".

Only approved reports can be marked done. That is deliberate: it stops work
landing in front of a decision.

## Who can triage

```
node --env-file=.env.local scripts/reports.mjs admin            # who it is now
node --env-file=.env.local scripts/reports.mjs admin luna       # add somebody
```

The migration gave it to the lowest user id, which is the account that set the
pantry up. That is not always the account the person actually uses.

## Clearing out the turned-down ones

Only when Luna asks:

```
node --env-file=.env.local scripts/reports.mjs purge
```

This deletes every turned-down report and its photos, permanently. It is not
what "not for now" does on its own, and it should not be — an idea that keeps
being asked for after it was turned down is itself worth knowing, and the only
way to notice that is for the old one to still be there. **Confirm with Luna
before running it**, and say how many it will delete.

## Reporting back

Finish with, in this order:

1. What is now fixed, one line each, in plain words.
2. Anything approved that you did **not** do, and why — blocked, needs a
   decision, turned out to be three questions rather than one.
3. How many are still waiting to be triaged, if any.

Keep it short. Luna's reply-length rules apply here like everywhere else.

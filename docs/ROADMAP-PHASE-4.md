# Phase 4 — make it pleasant

Scoped 11 Sep 2026 from Luna's list, after phase 3 shipped and got used.

Phase 3 made the pantry *correct*. This one is mostly about it being nice to
hold: a design pass, a cook flow that matches how cooking actually goes, and
recipes you can write before you own the ingredients.

## P1 · Speculative recipes — about half a day

**Write a recipe for something you cannot make yet.**

Today a recipe line is free text and already survives having no stock row -
`item_name` is the portable truth and matching happens at cook time. So the data
model needs nothing. What needs work is the editor and everything downstream
treating "not in the pantry" as a problem to flag rather than a normal state.

- The editor should not imply an ingredient has to exist.
- "Nothing in your kitchen matches this" belongs as quiet information, not a
  warning.
- Nutrition already handles it: unstocked lines fall back to the generics table,
  because a recipe's figures are a property of the dish rather than of the
  cupboard. Worth checking the rest of the app agrees.
- The shortfall button becomes the natural next action: plan the dish, then send
  the whole thing to the shopping list.

## P2 · Design pass, mobile first — handoff to Claude Design

**Mobile first, desktop second.** The current design grew from artboards that
were drawn phone-first and then stretched, and it shows in the places Luna named:

- **The recipe creator is clunky.** It was rebuilt in phase 2 as preview-left /
  fields-right with a tab switch on mobile. The tab switch is the weak part.
- **Some tabs are clunky** generally - the header's segmented control, the
  editor's preview/fields toggle, and the stock page's group-by switch are three
  different answers to the same question.

For the handoff, the things worth knowing:

- Typeface is Manrope throughout, Plex Mono for barcodes and keys.
- Palette is the "Fridge Door" direction, light mode only - no dark palette has
  ever been specified, so none was invented.
- `DESIGN-Recipe-Editor.html` is the existing mockup for the editor.
- Selection mode, the bulk bar and the receipt review screen are all new since
  any design work and have never been looked at.

## P3 · Clickable timers in recipes — about a day

**"Simmer for 20 minutes" should be a button.**

Steps are already structured rows in `recipe_steps`, so the timings can be
parsed out of the text rather than entered separately - the same trick the
receipt parser uses, and the same bias: miss one rather than invent one.

Notes:
- A timer has to survive the screen locking and the tab going to the background,
  so it should be an end timestamp rather than a counting number.
- The method already has a keep-screen-awake toggle to build on.
- Several timers at once is the normal case, not the edge case.

## P4 · Cook as a checklist — about a day

**Cook fires when you have ticked everything off, and confirmed at the bottom.**

Today Cook is a button you press at the start, and the decrement happens
immediately. That is backwards from how cooking goes: you work down the
ingredients, and the moment you are *finished* is the moment stock should move.

- Each ingredient gets a tick.
- Substitutions and the serving count stay changeable while you work.
- Confirm at the bottom does what Cook does now.
- Worth deciding: does an unticked ingredient mean "did not use it", and should
  it therefore not be decremented? That is the interesting question in this
  milestone and it changes what the log means.

## P5 · Receipt scanning quality — about half a day

**Lossless, not lossy - and the pipeline is already most of the way there.**

Two things that were true when this was scoped are no longer true, and the next
person should not go looking for either.

**There is no upload.** Recognition moved into the browser in phase 3, so
nothing crosses the wire but the recognised text. The Server Action body limit
that originally forced a shrink is irrelevant now.

**There is no lossy codec either.** `prepareReceipt` hands Tesseract the canvas
directly, as raw pixels - the JPEG encoding went out with the upload. So there
is no quality setting to raise and no format to switch to. Anyone hunting for a
`toBlob` call will not find one.

**The only loss left is the resample**, and it is the one worth killing:
`TARGET_WIDTH = 1600` in `lib/scan-image.ts` is applied unconditionally, so a
4000px photograph of a receipt is bicubically averaged down to 1600px before
anything reads it. Small print is exactly what that destroys, and it is thrown
away for no benefit at all now that nothing is being transmitted or stored.

So the work, in order of how much it is likely to buy:

1. **Stop downscaling.** Only ever enlarge small photos; leave big ones alone,
   or cap somewhere far higher. This is the whole of Luna's point and probably
   most of the win.
2. **Adaptive thresholding.** The current contrast stretch is global, so one
   shadow across a curled receipt drags the whole image. Local thresholding is
   the standard answer and suits thermal paper particularly well.
3. **Deskew.** A photograph taken at an angle costs more accuracy than most
   people expect.
4. **Crop to the items**, by hand or by finding the printed block, so the shop's
   logo and the card receipt stapled underneath are never read at all.

If a photo is ever stored or sent for any reason, it should be PNG or lossless
WebP. Nothing in the current path does, but the principle is the one to keep.

**`npm run check:receipt` covers parsing, not recognition.** A handful of real
photographs kept as fixtures is what would make any of this measurable rather
than a matter of opinion - and it is worth doing first, so the tuning has a
before and after.

## Inherited, still outstanding

From `STATE-2026-09-11.md`, unchanged and not part of this phase unless picked
up deliberately:

- The pre-rotation sqld token is still valid, with no expiry and no revocation.
- No CSP or `X-Frame-Options`.
- `db.packthings.fyi` is reachable from the open internet.

**Rough total: 3 to 4 days of building, plus whatever the design pass returns.**

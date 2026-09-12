# The pantry's design language

Written 12 Sep 2026, as the pre-design pass — bringing what exists up to a
spec, so the design pass that follows has something to design *against* rather
than a set of one-off decisions to reverse-engineer.

## The one rule

**Mobile first, desktop serviceable.** The phone layout is the design. The
desktop layout is the accommodation.

That is a direction, not a slogan, and it has a test: **every `sm:` rule should
be making something smaller, tighter or wider — never bigger.** If a control
grows on desktop, the phone version was drawn too small and should be fixed
there instead.

Concretely:

- Base sizes are thumb sizes. Interactive things are **44px** tall by default;
  `sm:` may take them to 32–36px, because a mouse is precise and a dense
  toolbar reads better on a wide screen.
- Rows of controls **scroll sideways** rather than wrapping. A filter row that
  grows to three lines pushes the thing you are filtering off the screen.
- Dialogs are **bottom sheets** that become centred panels at `sm:`, not
  centred panels that get squashed.
- Every page keeps `pb-32`. The FAB floats over the end of the page, and a last
  row it covers is a row you cannot press.

## The primitives

Four, in `components/ui/`. There were previously zero — or rather there were
six unused shadcn files in a different visual language entirely, imported by
nothing, which have been deleted. If shadcn is ever wanted, `npx shadcn add`
brings them back in seconds; leaving them checked in only told the next person
a lie about what this app is built from.

### `Sheet`

The one modal surface. Bottom sheet on a phone with a grab handle and
safe-area padding, centred panel at `sm:`.

It exists because there were three hand-rolled ones that disagreed about
everything load-bearing. Only one closed on Escape. None trapped focus, so
tabbing walked off into the page behind. None locked the background scroll.
None was announced as a dialog. Those are not polish — a modal you cannot leave
with a keyboard fails the moment somebody is not using a mouse, and a phone in
a kitchen is closer to that case than a desk is.

Dismissal is deliberately generous: Escape, the backdrop, and a close button.
The cost of an accidental dismissal here is re-tapping a button; the cost of a
trap is much higher.

### `Segmented`

Switching between views of the same thing, where exactly one is always chosen.
The header's sections and the stock page's group-by.

### `FilterChips`

Narrowing a list, where "none" is the normal state and tapping the active one
turns it off. The shop filter and the cookbook's tag and time filters.

**These two are kept apart on purpose.** They were four separate
implementations before, in three shapes and two colour treatments, and looking
alike would have been a lie: a segmented control always has an answer, a filter
row usually has none.

### `Page` / `PageTitle`

One shell, four widths, named for what they hold rather than for a number:
`form`, `read`, `list`, `wide`. There were **ten** distinct maximum widths
across the routes, three vertical paddings and two horizontal ones, and none of
the differences meant anything — so nobody could tell which were decisions and
which were typos.

## Tokens, as they actually are

Not invented here — this is what the app already uses, written down so it stops
being folklore.

| | |
|---|---|
| Typeface | Manrope throughout; IBM Plex Mono for barcodes and keys |
| Palette | "Fridge Door", **light mode only by decision, not omission** |
| Card radius | `rounded-[20px]` |
| Control radius | `rounded-[14px]` for buttons and fields, `rounded-full` for chips |
| Card shadow | `shadow-[0_1px_3px_rgba(0,0,0,0.05)]` |
| Headings | `font-extrabold tracking-[-0.02em]` |
| Body | `font-medium`; `font-semibold` for secondary text |
| Labels | `text-xs font-bold uppercase tracking-[0.08em] text-label` |

**No dark palette has ever been specified, so none has been invented.** That is
a decision to make deliberately, not to drift into.

## Two rules about meaning, not looks

Both came out of the friction pass and both are load-bearing:

1. **An opinion and a measurement must not look the same.** A typed tag is a
   solid chip you can remove; a derived one ("20 mins", "No oven") is an
   outline with no remove button. Drawing them identically is how people end up
   trusting the wrong one.
2. **Not having something is not an error.** An ingredient you have not bought
   reads "To buy" in a muted chip, never in the destructive colour. That colour
   is for things that will actually go wrong — a unit that cannot come off the
   shelf, a cook that failed.

## What is still unbuilt

- **Selection mode and the bulk bar** have never been designed at all. Entering
  selection mode, what is selectable, and what the bar can do are three
  separate discoveries.
- **Receipt review** asks about every line. It should accept the confident ones
  silently and ask about the rest — the shape `Sheet` was built for, and the
  one the cookbook's linking prompt already uses.
- **The FAB's menu** is four items and never learns which one this person uses.
- **No keyboard shortcuts** anywhere, and the two things done most often —
  adjust stock, add to the list — are three taps deep from everywhere.

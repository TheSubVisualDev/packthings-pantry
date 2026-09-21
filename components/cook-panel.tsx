"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { BookOpenText, Check, List, ShoppingBasket } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Sheet } from "@/components/ui/sheet";
import {
  cookRecipe,
  rateRecipe,
  undoCook,
  type CookResult,
  type UndoResult,
} from "@/app/recipes/[id]/actions";
import { totalOnHand } from "@/lib/containers";
import { displayItemName } from "@/lib/recipe-display";
import { SubstitutePicker } from "@/components/substitute-picker";
import { NewPackDates } from "@/components/new-pack-dates";
import { AddShortfallButton } from "@/components/add-shortfall-button";
import { RecipeMethod, type CookStep } from "@/components/recipe-method";
import {
  describeLine,
  formatQuantity,
  resolveAmount,
  scaleQuantity,
  splitAmount,
} from "@/lib/units";
import type { Item } from "@/lib/types";

/** A stand-in the pantry could offer for one ingredient. */
export interface SubstituteOption {
  id: number;
  name: string;
  /** Tags it has in common with what the recipe asked for, if any. */
  shared: string[];
  /** Its stock row, so a swap can be judged against the shelf immediately. */
  level: Pick<
    Item,
    | "quantity"
    | "canonical_unit"
    | "sealed_count"
    | "pack_size"
    | "pack_unit"
    | "unspecified"
    | "count_noun"
    | "dimension"
  >;
}

export interface CookLine {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  /** "1 tin (400 g)": what one unit amounts to, when it's a package. */
  pack_size: number | null;
  pack_unit: string | null;
  note: string | null;
  optional: boolean;
  /** "~70g": roughly this much. Display only. */
  approx: boolean;
  section: string | null;
  /**
   * The stock row this line resolves to, carrying its containers.
   *
   * Not just `quantity`: that is what is in the OPEN one, and judging a
   * recipe against it called things short with sealed packs behind them.
   */
  item: Pick<
    Item,
    | "quantity"
    | "dimension"
    | "canonical_unit"
    | "sealed_count"
    | "pack_size"
    | "pack_unit"
    | "unspecified"
    | "count_noun"
  > | null;
  /** What else is in that could stand in, best first. Empty is common. */
  substitutes: SubstituteOption[];
}

/** How long the undo stays the loud button. It never stops being possible. */
const UNDO_WINDOW_SECONDS = 10;

type Status =
  | { kind: "in-stock" }
  | { kind: "short"; detail: string }
  | { kind: "not-in-pantry" }
  | { kind: "needs-manual"; detail: string };

/**
 * Resolves a line at the chosen serving count. Recomputed on every servings
 * change - whether a line is short depends on how many you're cooking for.
 */
/**
 * Judges one line against the shelf - or against its stand-in, if one has been
 * picked. The substitute is compared exactly as the original would be, so
 * swapping in something you have less of still reads as short.
 */
function resolve(
  line: CookLine,
  swap: SubstituteOption | null,
  base: number,
  servings: number,
): { status: Status; display: number } {
  const scaled = scaleQuantity(line.quantity, base, servings);
  /**
   * The stand-in's stock row, or the line's own.
   *
   * Checked before the not-in-pantry case rather than after: a substitute is
   * most useful exactly when the recipe asks for something this kitchen has
   * never held, and testing line.item first would refuse to offer one.
   */
  const level = swap ? swap.level : line.item;
  if (!level) return { status: { kind: "not-in-pantry" }, display: scaled };

  const converted = resolveAmount(
    scaled,
    line.unit,
    { size: line.pack_size, unit: line.pack_unit },
    level.dimension,
  );

  /**
   * A line nobody measured, against a shelf that has some.
   *
   * There is no number to judge, and the recipe's whole claim is that you need
   * salt. You have salt. A kitchen with none never gets here - the no-stock
   * branch above has already called it To buy, which is the right answer.
   */
  if (!converted.ok && converted.reason === "unmeasured") {
    return { status: { kind: "in-stock" }, display: scaled };
  }

  if (!converted.ok) {
    return {
      status: {
        kind: "needs-manual",
        detail:
          converted.reason === "dimension-mismatch"
            ? `${line.unit} can't convert to ${level.canonical_unit}`
            : `unknown unit "${line.unit}"`,
      },
      display: scaled,
    };
  }

  // Counts are rounded up during conversion, so show the whole number that
  // will actually leave stock rather than the raw fraction.
  const display =
    level.dimension === "count" ? converted.quantity : scaled;

  /**
   * Everything on the shelf, not just the open container.
   *
   * `quantity` has meant "what is in the open one" since containers arrived,
   * so comparing against it called a recipe short while two sealed bottles sat
   * behind the nearly-empty one. Unspecified items have no number to compare,
   * and are taken at their word.
   */
  const onHand = totalOnHand(level);

  if (onHand !== null && converted.quantity > onHand) {
    return {
      status: {
        kind: "short",
        detail: `need ${formatQuantity(converted.quantity)}${level.canonical_unit}, have ${formatQuantity(onHand)}${level.canonical_unit}`,
      },
      display,
    };
  }
  return { status: { kind: "in-stock" }, display };
}

function StatusBadge({ status }: { status: Status }) {
  const base =
    "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap print:hidden";
  if (status.kind === "in-stock")
    return (
      /* A tick, because "In stock" and "To buy" were the same grey chip in the
         same place, and a tester reported reading one as the other. The words
         were never the difference at a glance; the shape is. */
      <span className={`${base} bg-chip text-muted-foreground`}>
        <Check className="h-3 w-3" strokeWidth={3.5} aria-hidden />
        In stock
      </span>
    );
  if (status.kind === "short")
    return (
      <span
        className={`${base} bg-[oklch(0.94_0.06_75)] text-[oklch(0.42_0.1_60)]`}
        title={status.detail}
      >
        Low
      </span>
    );
  if (status.kind === "not-in-pantry")
    return (
      // Deliberately not the destructive colour the other two use. An
      // ingredient you have not bought is a shopping item, not a fault - and a
      // recipe written before you own any of it went red from top to bottom,
      // which made writing one down feel like doing something wrong. It is
      // outlined rather than filled so it cannot be mistaken for the in-stock
      // chip, which is what kept happening while both were flat grey.
      <span className={`${base} border border-primary/35 bg-primary/8 text-primary`}>
        <ShoppingBasket className="h-3 w-3" strokeWidth={3} aria-hidden />
        To buy
      </span>
    );
  return (
    <span
      className={`${base} bg-[oklch(0.94_0.05_35)] text-destructive`}
      title={status.detail}
    >
      Manual
    </span>
  );
}

export function CookPanel({
  recipeId,
  baseServings,
  rating,
  lines,
  steps,
  hasKitchen,
  inCookbook,
  lastServings,
}: {
  recipeId: number;
  baseServings: number;
  /**
   * How many it was cooked for last time here, or what this kitchen usually
   * cooks for. Null when neither is known.
   */
  lastServings: number | null;
  rating: number | null;
  lines: CookLine[];
  steps: CookStep[];
  /** Cooking spends stock, so without a kitchen there's nothing to spend. */
  hasKitchen: boolean;
  /**
   * Whether this kitchen has adopted the recipe.
   *
   * Cooking is gated on it because the links that decide what comes off the
   * shelf are written when a recipe is adopted. Cooking one that has not been
   * would have to guess at the stove, which is the one place guessing is worst.
   */
  inCookbook: boolean;
}) {
  /**
   * How many to cook for, starting from what happened last time.
   *
   * A recipe's base servings is a fact about the recipe; how many people live
   * here is a fact about the kitchen, and it does not change between visits.
   * Setting it to four every time and watching it come back as two on the next
   * visit is the app forgetting something it already wrote down - cook_events
   * has recorded the number on every cook since phase 1.
   *
   * Reset still goes to the recipe's own number, because that is what Reset
   * means and it is the only way back to the quantities as written.
   */
  const reduceMotion = useReducedMotion();

  const [servings, setServings] = useState(lastServings ?? baseServings);

  // Counts presses, not the number, so the readout animates on every one of
  // them. Starts at 0 so the panel does not open with the figure jumping.
  const [servingTicks, setServingTicks] = useState(0);
  const changeServings = (next: (v: number) => number) =>
    setServings((v) => {
      const to = next(v);
      if (to !== v) setServingTicks((n) => n + 1);
      return to;
    });
  const [result, setResult] = useState<CookResult | null>(null);
  const [undone, setUndone] = useState<UndoResult | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();

  /**
   * Stand-ins chosen for this cook, by ingredient line.
   *
   * Not saved to the recipe: using oat milk tonight because that is what is in
   * does not make it an oat milk recipe. It lives as long as this screen does.
   */
  const [swaps, setSwaps] = useState<Record<number, number>>({});

  /**
   * Which ingredients have actually gone in.
   *
   * Cooking used to fire the moment you pressed a button at the top, which is
   * backwards from how cooking goes: you work down the list, and the moment
   * you are *finished* is the moment the stock has really moved. Nothing is
   * written until Confirm.
   *
   * Everything starts ticked. The common case by a long way is that you used
   * the whole recipe, and a checklist you have to fill in before you can cook
   * would be a worse version of the button it replaced.
   */
  const [ticked, setTicked] = useState<Record<number, boolean>>({});

  /** The unticked lines, shown for confirmation. Null while not asking. */
  const [asking, setAsking] = useState<string[] | null>(null);
  const [undoPending, startUndo] = useTransition();
  /** Whether the method is open on the page. Closed until somebody asks. */
  const [reading, setReading] = useState(false);
  const [ratingPending, startRating] = useTransition();

  // Reads off a fixed deadline rather than decrementing a counter, so a tab
  // that was backgrounded comes back showing the right number, not a stale one.
  // The deadline itself is set in the cook handler; this only ticks.
  useEffect(() => {
    if (!deadline) return;

    const timer = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setSecondsLeft(left > 0 ? left : 0);
      if (left <= 0) clearInterval(timer);
    }, 250);

    return () => clearInterval(timer);
  }, [deadline]);

  const resolved = lines.map((line) => {
    const swap =
      line.substitutes.find((option) => option.id === swaps[line.id]) ?? null;
    return { line, swap, ...resolve(line, swap, baseServings, servings) };
  });

  const blockers = resolved.filter((r) => r.status.kind !== "in-stock");

  // Unticked means not used. A line is ticked unless it has been untucked, so
  // a recipe opened and confirmed straight away behaves exactly as the old
  // single button did.
  const skippedLines = resolved.filter(({ line }) => ticked[line.id] === false);
  const skippedIds = skippedLines.map(({ line }) => line.id);

  // Kept in the order the recipe gave them, so a section header appears where
  // its lines start rather than being sorted somewhere else.
  const sections: { name: string | null; entries: typeof resolved }[] = [];
  for (const entry of resolved) {
    const name = entry.line.section;
    const last = sections.at(-1);
    if (last && last.name === name) last.entries.push(entry);
    else sections.push({ name, entries: [entry] });
  }

  // What each step should say it needs, at the serving count chosen now.
  const labels: Record<number, string> = {};
  for (const { line, display } of resolved) {
    labels[line.id] = describeLine(
      display,
      line.unit,
      { size: line.pack_size, unit: line.pack_unit },
      line.item_name,
      line.approx,
    );
  }

  function cook(skip: number[]) {
    setResult(null);
    setUndone(null);
    setAsking(null);
    setDeadline(0);
    setSecondsLeft(0);

    startTransition(async () => {
      const cooked = await cookRecipe(recipeId, servings, swaps, skip);
      setResult(cooked);

      if (cooked.eventId !== undefined) {
        setSecondsLeft(UNDO_WINDOW_SECONDS);
        setDeadline(Date.now() + UNDO_WINDOW_SECONDS * 1000);
      }
    });
  }

  /**
   * Confirming, and asking about anything left unticked.
   *
   * An unticked line is genuinely ambiguous - it can mean "I did not use this"
   * or "I forgot to tick it" - and the app does not guess, because guessing
   * wrong either leaves stock too high or spends something that is still in
   * the cupboard. The prompt appears only when something is actually unticked,
   * so a full recipe still confirms in one tap.
   */
  function onConfirm() {
    if (skippedIds.length === 0) {
      cook([]);
      return;
    }
    setAsking(skippedLines.map(({ line }) => line.item_name));
  }

  function onUndo(eventId: number) {
    startUndo(async () => {
      setUndone(await undoCook(eventId));
    });
  }

  return (
    /**
     * One column on a phone, two on a desktop: what it needs, then what you do.
     *
     * Reported as the desktop site not being up to spec - and this page was the
     * worst of it, a 690px strip down the middle of a 1440px window with the
     * method three screens below the ingredients it uses. On a phone that order
     * is right and there is no alternative. On a monitor it wastes half the
     * glass to reproduce a constraint the screen does not have.
     *
     * The cut is where the page already divides: everything about whether you
     * can cook this - servings, ingredients, what you are short of, the cook
     * button - on the left and sticky, so it stays put while you read. The
     * method, and what you thought of it afterwards, on the right.
     *
     * Printing ignores all of it: print:block puts the two back in one column,
     * because a recipe on paper is read top to bottom.
     */
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start lg:gap-9 lg:space-y-0 print:block">
      <div className="space-y-5 lg:sticky lg:top-24 print:space-y-5">
      <section className="print:hidden">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
          Cooking for
        </h2>
        <div className="flex items-center gap-3">
          {/* py-2 rather than py-3, because the buttons inside now carry their
              own height and the row would otherwise grow by the difference. */}
          <div className="flex flex-1 items-center justify-between rounded-[14px] bg-card px-2 py-2 font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {/* min-h-11/min-w-11 is the 44px Apple asks for, and this is the
                one control on the page that gets used standing at a hob with
                one hand. The hit box used to be the size of the glyph - about
                26px - which is a miss every few presses, and a miss on a
                stepper reads as the app ignoring you. */}
            <button
              type="button"
              aria-label="Fewer servings"
              onClick={() => changeServings((v) => Math.max(1, v - 1))}
              className="flex min-h-11 min-w-11 items-center justify-center text-2xl leading-none text-primary disabled:opacity-30"
              disabled={servings <= 1}
            >
              &minus;
            </button>
            {/* Same tick as the stock stepper, for the same reason: the count
                used to swap in place, so a press that scaled the whole
                ingredient list looked like a press that missed. Keyed on a
                count rather than on the value because 3 -> 2 -> 3 is two
                presses and both of them moved something. */}
            <span
              key={servingTicks}
              className={`tabular-nums${servingTicks > 0 ? " tick" : ""}`}
            >
              {servings} {servings === 1 ? "serving" : "servings"}
            </span>
            <button
              type="button"
              aria-label="More servings"
              onClick={() => changeServings((v) => Math.min(50, v + 1))}
              className="flex min-h-11 min-w-11 items-center justify-center text-2xl leading-none text-primary disabled:opacity-30"
              disabled={servings >= 50}
            >
              +
            </button>
          </div>
          {servings !== baseServings && (
            <button
              type="button"
              onClick={() => changeServings(() => baseServings)}
              className="shrink-0 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
        {servings !== baseServings && (
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            Scaled &times;{formatQuantity(servings / baseServings)} from base{" "}
            {baseServings}. Stored quantities stay at base.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-label">
            Ingredients
          </h2>
          {/* The answer to "can I make this", at the top where the question is
              asked. The shortfall and its button stay under the list, which is
              where you decide to do something about it. */}
          {hasKitchen && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                blockers.length === 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-chip text-muted-foreground"
              }`}
            >
              {blockers.length === 0
                ? `you have everything for ${servings}`
                : `${blockers.length} to buy`}
            </span>
          )}
        </div>
        {/*
          What the ticks are for, said once.

          A filled brand-coloured circle beside every ingredient reads as "you
          have this" - a tester said exactly that, and then found the status
          chip on the other end of the row disagreeing with it. The circles are
          a cooking checklist, not a stock report, and one line saying so costs
          less than inventing a third visual language for them.
        */}
        {hasKitchen && (
          <p className="mb-2 text-xs font-semibold text-muted-foreground print:hidden">
            Ticked ones come off your shelves when you cook. Untick anything you
            left out.
          </p>
        )}
        {sections.map((section) => (
          <div key={section.name ?? ""} className="mb-3 last:mb-0">
            {section.name && (
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {section.name}
              </h3>
            )}
            {/* stagger: the ingredient list is the most-read list in the app
                and arrived all at once. It does not re-fire when the servings
                change - React keeps the same rows, and a CSS animation runs on
                mount, not on re-render - which is what makes it safe on a list
                that recomputes every amount on every press. */}
            <ul className="stagger overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {section.entries.map(({ line, swap, display, status }) => {
                const amount = splitAmount(
                  display,
                  line.unit,
                  { size: line.pack_size, unit: line.pack_unit },
                  line.approx,
                );
                return (
                <li
                  key={line.id}
                  className="border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
                >
                  <div className="flex items-center justify-between gap-3">
                  {hasKitchen && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={ticked[line.id] !== false}
                      aria-label={`Used ${line.item_name}`}
                      onClick={() =>
                        setTicked((current) => ({
                          ...current,
                          [line.id]: current[line.id] === false,
                        }))
                      }
                      className={`print:hidden ${
                        ticked[line.id] === false
                          ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border"
                          : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      }`}
                    >
                      {ticked[line.id] !== false && (
                        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      )}
                    </button>
                  )}
                  {/*
                    The amount leads the line, with the name.

                    It used to be a bold name over a small grey "2 (600g)", and
                    a tester read that whole second line as fine print and
                    missed the amount. What you measure belongs where the eye
                    already is; what one pack comes to and how to cut it are
                    both second-line facts, so they share the quiet line.
                  */}
                  <div className={`min-w-0 flex-1 ${ticked[line.id] === false ? "opacity-45" : ""}`}>
                    <div className="font-bold break-words">
                      {amount.primary && (
                        <span className="text-quantity">{amount.primary} </span>
                      )}
                      {/* "1 Brown Onions" is nobody's sentence. Names are
                          stored plural for the stock list; this is the one
                          place that reads as a sentence instead of a row. */}
                      {displayItemName(line.item_name, line.quantity, line.unit)}
                      {line.optional && (
                        <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                          optional
                        </span>
                      )}
                    </div>
                    {(amount.secondary || line.note) && (
                      <div className="text-sm font-semibold text-muted-foreground">
                        {amount.secondary && (
                          <span className="text-quantity">{amount.secondary}</span>
                        )}
                        {amount.secondary && line.note && " · "}
                        {line.note && <span className="font-medium">{line.note}</span>}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={status} />
                  </div>

                  {line.substitutes.length > 0 && (
                    <SubstitutePicker
                      options={line.substitutes}
                      chosen={swap}
                      wanted={line.item_name}
                      onChoose={(id) =>
                        setSwaps((current) => {
                          const next = { ...current };
                          if (id === null) delete next[line.id];
                          else next[line.id] = id;
                          return next;
                        })
                      }
                    />
                  )}
                </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

        {/* Right under the ingredients, because "can I make this tonight" is
            answered here and the answer is useless three screens down past the
            method. The cook flow offers it again afterwards for what it could
            not decrement. */}
        {hasKitchen && blockers.length > 0 && !result && (
          <div className="rounded-[16px] bg-chip px-4 py-3 print:hidden">
            <p className="text-center text-sm font-semibold text-muted-foreground">
              {/* A recipe you own none of is a normal thing to have written
                  down - something you meant to try - so it reads as a plan
                  rather than as a shortage. */}
              {blockers.length === resolved.length
                ? `Nothing for this is in yet. Shopping for ${servings}?`
                : `Short of ${blockers.length} ${
                    blockers.length === 1 ? "thing" : "things"
                  } for ${servings}.`}
            </p>
            <div className="mt-1.5">
              <AddShortfallButton recipeId={recipeId} servings={servings} />
            </div>
          </div>
        )}

      {hasKitchen ? (
        /**
         * The cook button follows you down the ingredient list.
         *
         * Ticking things off while cooking pushed it off the top of the
         * screen, and getting back to it meant scrolling up past everything
         * you had just ticked - on the one screen this app is used on
         * one-handed, standing up, with something on the hob.
         *
         * Sticky rather than fixed. Fixed would need to know how tall the tab
         * bar is and would float over a short recipe that never scrolls;
         * sticky stays in the flow, pins only while there is list left to
         * scroll, and lets go at the end. The offset clears the tab bar and
         * the home indicator underneath it. Released at `sm`, where the tab
         * bar is gone and the left column is already sticky as a whole.
         */
        <>
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 sm:static print:hidden">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            /* Its own shadow on mobile: pinned over a scrolling list it needs
               to read as sitting above the page rather than in it. */
            className="w-full rounded-[14px] bg-primary px-4 py-4 text-[15px] font-extrabold text-primary-foreground shadow-[0_8px_24px_-8px_rgba(60,44,30,0.55)] transition-opacity disabled:opacity-60 sm:shadow-none"
          >
            {pending
              ? "Cooking…"
              : skippedIds.length > 0
                ? `Done — cooked ${resolved.length - skippedIds.length} of ${resolved.length}`
                : `Done — cooked for ${servings}`}
          </button>
        </div>
        {/* Outside the sticky box on purpose. It is read once, at the bottom,
            and pinning it meant a line of transparent text riding over the
            ingredient list. Still a sibling of the button rather than inside
            anything, so the button's sticky parent stays the full-height
            column and it pins for the whole scroll. */}
        <p className="text-center text-xs font-semibold text-muted-foreground print:hidden">
          Stock moves when you press this, not before. Untick anything you did
          not use.
          {/* Said once, on a recipe that is not in the cookbook yet, because
              cooking puts it there and somebody should not discover that
              afterwards. It is a consequence, not a question - the whole point
              of this change is that nothing is asked at the stove. */}
          {!inCookbook && " Cooking it also adds it to your cookbook."}
        </p>
        </>
      ) : (
        <p className="rounded-[14px] bg-chip px-4 py-3.5 text-center text-sm font-semibold text-muted-foreground">
          Cooking takes things off a shelf, so it needs{" "}
          <Link href="/kitchens" className="font-bold text-primary underline underline-offset-2">
            a kitchen
          </Link>
          . You can still read the recipe.
        </p>
      )}

      <Sheet
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={
          asking?.length === 1
            ? "One thing you did not tick"
            : `${asking?.length ?? 0} things you did not tick`
        }
        description="Leave them on the shelf, or take them off anyway?"
        footer={
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => cook(skippedIds)}
              className="w-full rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
            >
              Did not use {asking?.length === 1 ? "it" : "them"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => cook([])}
              className="mt-2 w-full rounded-[14px] bg-chip px-4 py-3 text-sm font-bold disabled:opacity-60"
            >
              Used everything after all
            </button>
          </>
        }
      >
        <ul className="space-y-1">
          {(asking ?? []).map((name) => (
            <li key={name} className="text-sm font-bold break-words">
              {name}
            </li>
          ))}
        </ul>
      </Sheet>

      </div>

      <div className="space-y-5">
      {/*
        Two ways to cook it, and the method is behind them.

        Reading a recipe and cooking one are different postures. The method was
        always open below the ingredients, which made this page one long scroll
        whose shape never said where the cooking part started - and made the
        step-by-step screen, which is the better way to do it on a phone, a
        thing nobody would ever find.
      */}
      {steps.length > 0 && (
        <section>
          <div className="flex gap-2 print:hidden">
            <Link
              href={`/recipes/${recipeId}/cook?servings=${servings}`}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-primary px-4 text-[15px] font-extrabold text-primary-foreground"
            >
              <BookOpenText className="h-4 w-4" strokeWidth={2.75} />
              Step-by-step
            </Link>
            {/* The toggle is a phone control. On a desktop the method is
                already open in the column beside the ingredients, so a button
                offering to show it would be lying. */}
            <button
              type="button"
              aria-expanded={reading}
              onClick={() => setReading((value) => !value)}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-chip px-4 text-[15px] font-extrabold hover:bg-border lg:hidden"
            >
              <List className="h-4 w-4" strokeWidth={2.75} />
              {reading ? "Hide the list" : "Read as list"}
            </button>
          </div>

          {/*
            Rendered whether or not it is open, and hidden with CSS.

            Printing is the reason: a method that only exists in the DOM once
            somebody has pressed "Read as list" is a method that comes out of
            the printer as a blank half-page. `hidden print:block` is the one
            place in this app where display is decided twice, and it earns it.

            Desktop is the second reason, and it is decided the same way rather
            than by defaulting the state open - which would need to know the
            viewport during render, and guessing it is how you get a hydration
            mismatch on the one page people print.
          */}
          <div
            className={
              reading ? "mt-4" : "hidden lg:mt-4 lg:block print:mt-4 print:block"
            }
          >
            <RecipeMethod steps={steps} labels={labels} />
          </div>
        </section>
      )}


      {result && (
        /**
         * The one unambiguously good moment in the app, animated like it.
         *
         * Everything else here is bookkeeping - stock went down, a date moved
         * - but this is a meal that got made, and it arrived as a receipt: a
         * static card headed "Cooked - 6 of 9 lines decremented". The motion
         * vocabulary in globals.css was built for exactly this and nothing was
         * spending it on the moment worth spending it on.
         *
         * Only on success. A failed cook springing cheerfully into view would
         * be worse than the flat card it replaced, so the entrance is skipped
         * and the tick is not drawn at all.
         */
        <motion.section
          initial={
            result.ok && !reduceMotion ? { opacity: 0, y: 14, scale: 0.97 } : false
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className={`rounded-[20px] p-5 ${result.ok ? "bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]" : "bg-[oklch(0.96_0.03_40)]"}`}
        >
          {!result.ok ? (
            <p className="text-sm font-bold text-destructive">
              {result.error ?? "Cook failed"}
            </p>
          ) : undone?.ok ? (
            <>
              <h3 className="text-sm font-extrabold">
                Undone &mdash; stock put back
              </h3>
              {undone.restored.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm font-semibold text-muted-foreground">
                  {undone.restored.map((line) => (
                    <li key={line.item_name}>
                      {line.item_name} +{formatQuantity(line.restored)}
                      {line.unit === "count" ? "" : line.unit} (
                      {formatQuantity(line.quantity)} now)
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              {/* The tick lands a beat after the card, which is what makes it
                  read as a result rather than as decoration that arrived with
                  the furniture. */}
              <div className="flex items-center gap-2.5">
                <motion.span
                  initial={reduceMotion ? false : { scale: 0, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 600,
                    damping: 17,
                    delay: reduceMotion ? 0 : 0.09,
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Check className="h-4.5 w-4.5" strokeWidth={3.5} aria-hidden />
                </motion.span>
                <h3 className="text-[17px] font-extrabold tracking-[-0.01em]">
                  {result.flagged.length === 0
                    ? `Cooked for ${servings}.`
                    : "Cooked."}
                </h3>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
                {result.applied.length} of{" "}
                {result.applied.length + result.flagged.length} lines came off
                your shelves.
              </p>
              {result.applied.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm font-semibold text-muted-foreground">
                  {result.applied.map((line) => (
                    <li key={line.item_name}>
                      {line.item_name} &minus;
                      {formatQuantity(line.decremented ?? 0)}
                      {line.unit === "count" ? "" : line.unit} (
                      {formatQuantity(line.remaining_total ?? 0)} left)
                    </li>
                  ))}
                </ul>
              )}
              {/* Said plainly, because a cook that left things out is a
                  different cook and the log records it as one. */}
              {result.skipped.length > 0 && (
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  Left on the shelf: {result.skipped.join(", ")}.
                </p>
              )}

              {/* Before the shortfalls: a packet in your hand is a question
                  with a short shelf life, and it should not be below a list. */}
              <NewPackDates opened={result.opened} />

              {result.flagged.length > 0 && (
                <div className="mt-4">
                  <div className="mb-3">
                    <AddShortfallButton recipeId={recipeId} servings={servings} />
                  </div>
                  <h4 className="text-sm font-extrabold text-destructive">
                    Needs manual handling
                  </h4>
                  <ul className="mt-1 space-y-1 text-sm font-semibold text-[oklch(0.44_0.09_38)]">
                    {result.flagged.map((line) => (
                      <li key={line.item_name}>
                        {line.item_name}
                        {line.detail ? ` — ${line.detail}` : ""}
                        {line.issue === "not-in-pantry"
                          ? " — not in pantry"
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.eventId !== undefined && (
                <div className="mt-4">
                  {secondsLeft > 0 ? (
                    <button
                      type="button"
                      onClick={() => onUndo(result.eventId!)}
                      disabled={undoPending}
                      className="w-full rounded-[14px] bg-ink px-4 py-3 text-sm font-extrabold text-background transition-opacity disabled:opacity-60"
                    >
                      {undoPending
                        ? "Undoing…"
                        : `Undo · ${secondsLeft}s`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUndo(result.eventId!)}
                      disabled={undoPending}
                      className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60"
                    >
                      {undoPending ? "Undoing…" : "Undo this cook"}
                    </button>
                  )}
                  {undone && !undone.ok && (
                    <p role="alert" className="mt-2 text-sm font-bold text-destructive">
                      {undone.error ?? "Undo failed"}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </motion.section>
      )}

      <section className="print:hidden">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
          What you thought
        </h2>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} out of 5`}
              disabled={ratingPending}
              onClick={() =>
                startRating(async () => {
                  await rateRecipe(recipeId, star);
                })
              }
              className={`text-2xl leading-none transition-opacity disabled:opacity-50 ${
                rating !== null && star <= rating
                  ? "text-primary"
                  : "text-border hover:text-primary/50"
              }`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-sm font-semibold text-muted-foreground">
            {rating === null ? "Not rated yet" : `${rating}/5`}
          </span>
        </div>
      </section>
      </div>
    </div>
  );
}

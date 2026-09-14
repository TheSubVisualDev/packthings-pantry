"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft } from "lucide-react";
import { PhotoPicker } from "@/components/photo-picker";
import { RecipePreview } from "@/components/recipe-preview";
import { SoftSelect } from "@/components/soft-select";
import { saveRecipeDocument, type SaveRecipeResult } from "@/app/recipes/actions";
import {
  PACKAGE_UNITS,
  readQuantity,
  UNITS_BY_DIMENSION,
  UNMEASURED,
} from "@/lib/units";
import type { Dimension } from "@/lib/types";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const SMALL = "rounded-[12px] border border-border bg-card px-3 py-2.5 font-semibold outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";
const CARD = "rounded-[20px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-5";
const GHOST = "rounded-full px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-chip disabled:opacity-30";

const DIMENSION_LABEL: Record<Dimension, string> = {
  mass: "Weight",
  volume: "Volume",
  count: "Count",
};

interface DraftIngredient {
  key: string;
  item_name: string;
  /**
   * As typed, tilde and all: "70", "~70", "". The ~ is parsed out at save
   * time rather than held as a separate flag, because a person writing "about
   * 70 grams" is typing about the number, not ticking a box beside it.
   */
  quantity: string;
  unit: string;
  /** "1 tin (400 g)": only asked for when the unit is a package. */
  pack_size: string;
  pack_unit: string;
  note: string;
  optional: boolean;
  section: string;
}

interface DraftStep {
  key: string;
  body: string;
  minutes: string;
  section: string;
  /** item_name values, matching how the document references ingredients. */
  uses: string[];
}

/** Photos already attached, keyed so the editor can show them without owning them. */
export interface RecipePhotos {
  hero: string | null;
  /** Step id to URL. Steps only have ids once the recipe has been saved. */
  steps: Record<number, string | null>;
  /** Step ids in position order, so a draft row can find the saved step it is. */
  stepIds: number[];
}

export interface RecipeDraft {
  name: string;
  description: string;
  base_servings: string;
  prep_minutes: string;
  cook_minutes: string;
  source: string;
  notes: string;
  ingredients: Omit<DraftIngredient, "key">[];
  steps: Omit<DraftStep, "key">[];
}

/** Moves an item within a list, or returns it unchanged at the ends. */
function move<T>(list: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (to < 0 || to >= list.length) return list;

  const next = [...list];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);
  return next;
}

/**
 * Writing a recipe by hand.
 *
 * Ingredients and steps are ordered lists you build a row at a time, and a
 * step can be told which ingredients it uses by tapping them - the same link
 * the cooking view reads to show quantities beside each instruction.
 *
 * Nothing is validated here. The draft is handed to the same parse the API
 * uses and the answer comes back with paths attached, because a second
 * implementation of "what is a valid recipe" is a second thing to be wrong.
 *
 * Two panes on a wide screen - what it will look like on the left, the fields
 * on the right - and a tab switch on a narrow one, where side by side would
 * mean two columns too thin to use. The preview updates as you type because it
 * reads the same draft state the fields write to.
 */
export function RecipeEditor({
  initial,
  recipeId,
  pantryNames,
  sections,
  photos,
}: {
  initial: RecipeDraft;
  recipeId?: number;
  /** Absent for a recipe that hasn't been saved yet - there's nothing to attach to. */
  photos?: RecipePhotos;
  /** Existing item names, offered as suggestions but never enforced. */
  pantryNames: string[];
  /** Section names already used across the pantry's recipes. */
  sections: string[];
}) {
  const router = useRouter();

  // React needs a key that survives reordering, and rows have no id until
  // they're saved. The rows a recipe loads with are numbered by position;
  // anything added afterwards gets a fresh id, minted in an event handler
  // rather than during render.
  const makeKey = () => `row-${crypto.randomUUID()}`;

  const [draft, setDraft] = useState(() => ({
    ...initial,
    ingredients: initial.ingredients.map((line, index) => ({
      ...line,
      key: `initial-ingredient-${index}`,
    })),
    steps: initial.steps.map((step, index) => ({
      ...step,
      key: `initial-step-${index}`,
    })),
  }));
  const [result, setResult] = useState<SaveRecipeResult | null>(null);

  /**
   * Which of the three questions is on screen.
   *
   * Asked in the order somebody writing a recipe down actually has it: what
   * goes in, then what you do, then what to call it. The page used to be all
   * of it at once - a form tall enough that the Save button was a scroll away
   * from the name field, and the first thing anybody met was a photo picker
   * for a recipe that did not exist yet.
   *
   * Hidden rather than unmounted, so every field keeps what was typed and
   * moving back and forth loses nothing.
   */
  const [stage, setStage] = useState(0);

  /**
   * Which instruction is on screen, within the method.
   *
   * One at a time, because that is the shape a method has when you are writing
   * it - you finish a step and then think of the next one - and because a
   * column of twelve identical textareas is the thing this rework is for.
   */
  const [stepAt, setStepAt] = useState(0);

  /**
   * The warnings split by whether they are anybody's fault.
   *
   * "Not in this kitchen yet" is a fact about the cupboard; a unit that
   * cannot be decremented is a fact about the recipe. Only the second is
   * worth interrupting somebody who has just pressed save.
   */
  const notStocked = (result?.warnings ?? []).filter((w) => w.kind === "not-stocked");
  const realWarnings = (result?.warnings ?? []).filter((w) => w.kind !== "not-stocked");
  const [pending, startTransition] = useTransition();

  // Which pane is showing, on a screen too narrow for both. Desktop ignores it
  // and shows the pair side by side.
  const [pane, setPane] = useState<"edit" | "preview">("edit");

  function field<K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function patchIngredient(index: number, patch: Partial<DraftIngredient>) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function patchStep(index: number, patch: Partial<DraftStep>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  }

  function onSave() {
    const document = {
      name: draft.name,
      description: draft.description || undefined,
      base_servings: Number(draft.base_servings),
      prep_minutes: draft.prep_minutes ? Number(draft.prep_minutes) : undefined,
      cook_minutes: draft.cook_minutes ? Number(draft.cook_minutes) : undefined,
      source: draft.source || undefined,
      notes: draft.notes || undefined,
      /**
       * A row nobody filled in is an empty row, not a mistake.
       *
       * Every row went to the server verbatim, including the blank one you get
       * from pressing "add an ingredient" and then thinking better of it. The
       * schema rejected it, and the rejection arrived as
       * `ingredients[3].item_name: Missing item_name.` printed on the details
       * stage - which does not show ingredients at all, and offered no way back
       * to row four. The paste reader already drops blank lines without
       * comment; this is the same courtesy for a form.
       *
       * Only rows that are entirely untouched. A row with an amount typed into
       * it and no name yet is somebody midway through, and that IS worth
       * stopping for.
       */
      ingredients: draft.ingredients
        .filter(
          (line) =>
            line.item_name.trim() !== "" ||
            line.quantity.trim() !== "" ||
            line.note.trim() !== "",
        )
        .map((line) => {
        const typed = readQuantity(line.quantity);
        const unmeasured = line.unit === UNMEASURED;

        return {
          item_name: line.item_name,
          // An unmeasured line sends no quantity at all; the parser refuses a
          // pack size on one too, so both are dropped here rather than sent
          // and rejected.
          quantity: unmeasured ? undefined : (typed.quantity ?? Number(line.quantity)),
          unit: line.unit,
          approx: !unmeasured && typed.approx,
          // Only meaningful for package units, and only when actually filled in.
          pack_size:
            !unmeasured && PACKAGE_UNITS.includes(line.unit) && line.pack_size.trim()
              ? Number(line.pack_size)
              : undefined,
          pack_unit:
            !unmeasured && PACKAGE_UNITS.includes(line.unit) && line.pack_size.trim()
              ? line.pack_unit
              : undefined,
          note: line.note || undefined,
          optional: line.optional,
          section: line.section || undefined,
        };
      }),
      /**
       * The same for steps, and here it was a dead end rather than a nuisance.
       *
       * A new recipe opens with one empty step, so "write the ingredients down
       * now and the method later" - which is how half of them get written -
       * failed on `steps[0].body: Step has no text`, about a box the person had
       * never touched. There was no way to save at all without typing
       * something into it.
       *
       * A step is only its body; minutes or a section with no instruction
       * attached is not a step somebody started, it is leftovers from one they
       * removed.
       */
      steps: draft.steps
        .filter((step) => step.body.trim() !== "")
        .map((step) => ({
          body: step.body,
          minutes: step.minutes ? Number(step.minutes) : undefined,
          section: step.section || undefined,
          uses: step.uses,
        })),
    };

    startTransition(async () => {
      const saved = await saveRecipeDocument(document, recipeId);
      setResult(saved);
      if (saved.ok && saved.id) router.push(`/recipes/${saved.id}`);
    });
  }

  const ingredientNames = draft.ingredients
    .map((line) => line.item_name.trim())
    .filter(Boolean);

  const STAGES = [
    { title: "What goes in it?", hint: "Everything the recipe needs, in the order you use it." },
    { title: "How is it made?", hint: "One instruction per screen." },
    { title: "What is it called?", hint: "The name is the only part that is required." },
  ];

  const last = stage === STAGES.length - 1;
  /** A recipe with nothing in it is not a recipe; nothing else is compulsory. */
  const canLeave =
    stage === 0
      ? draft.ingredients.some((line) => line.item_name.trim() !== "")
      : true;

  /**
   * The instruction on screen, clamped rather than stored clamped.
   *
   * Removing the last step leaves stepAt pointing past the end, and an index
   * no card matches is a stage with nothing in it. Deriving it means the
   * invariant cannot be broken by whichever of the four things that change
   * `steps` forgets to fix the cursor - which is the same shape as the bug
   * that made triage skip a card.
   */
  const stepCount = draft.steps.length;
  const stepShowing = Math.min(stepAt, Math.max(0, stepCount - 1));
  const moreSteps = stage === 1 && stepShowing < stepCount - 1;

  /**
   * Forward and back mean the next INSTRUCTION inside the method, and the next
   * stage everywhere else.
   *
   * One pair of controls rather than two: a screen with a page-next and a
   * stage-next on it makes you read both before pressing either.
   */
  function goBack() {
    if (stage === 1 && stepShowing > 0) setStepAt(stepShowing - 1);
    else setStage((n) => n - 1);
  }

  function goNext() {
    if (moreSteps) setStepAt(stepShowing + 1);
    else setStage((n) => n + 1);
  }

  /** A new instruction, and you are taken to it - it is why you pressed. */
  function addStep() {
    setDraft((c) => ({
      ...c,
      steps: [
        ...c.steps,
        {
          key: makeKey(),
          body: "",
          minutes: "",
          section: c.steps.at(-1)?.section ?? "",
          uses: [],
        },
      ],
    }));
    setStepAt(stepCount);
  }

  return (
    /**
     * The editor takes the room; the preview sits beside it as a phone.
     *
     * Two equal columns, both flat on the page background, was reported as
     * "needs to be a clearer distinction between the preview and the editor"
     * - and it did read as one continuous surface, with the form's own cards
     * being the only thing that looked like a boundary. Half the width also
     * went to the half nobody is typing into.
     *
     * So the form is the page and the preview is an object on it, at the
     * width it will actually be read at. Ordered form-then-preview in the
     * markup as well as on screen, because that is tab order.
     */
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-10">
      {/* Spans both columns: one bar over the pair, so Save is in the same
          place whichever pane you're looking at. */}
      <div className="sticky top-0 z-30 -mx-5 mb-5 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-3 backdrop-blur sm:-mx-9 sm:px-9 lg:col-span-2">
        {/* hidden, not invisible: invisible kept the toggle's width on desktop
            and pushed the stage name into the middle of an empty bar. */}
        <div className="flex gap-1 rounded-full bg-chip p-1 text-[13px] font-bold lg:hidden">
          {(["edit", "preview"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={pane === option}
              onClick={() => setPane(option)}
              className={
                pane === option
                  ? "rounded-full bg-card px-3.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "rounded-full px-3.5 py-1.5 text-muted-foreground"
              }
            >
              {option === "edit" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>

        {/* The mobile pane toggle is invisible on desktop, which left this bar
            holding three small dashes and a lot of nothing. On a wide screen
            it says where you are instead. */}
        <span className="hidden text-sm font-bold lg:block">
          {STAGES[stage].title}
          {stage === 1 && stepCount > 0 && (
            <span className="ml-2 font-semibold text-muted-foreground tabular-nums">
              step {stepShowing + 1} of {stepCount}
            </span>
          )}
        </span>

        {/* Three segments rather than a Save button. Saving belongs at the
            end of the thing, not permanently in the corner of it. */}
        <div className="flex flex-1 justify-end gap-1">
          {STAGES.map((each, index) => (
            <span
              key={each.title}
              className={`h-1 w-8 rounded-full ${
                index < stage ? "bg-primary" : index === stage ? "bg-ink" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      <div className={`${pane === "edit" ? "block" : "hidden"} space-y-6 lg:block`}>
      {/* Stage 1 - what goes in it. */}
      <div hidden={stage !== 0} className="space-y-6">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
            {STAGES[0].title}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">
            {STAGES[0].hint}
          </p>
        </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-label">
            Ingredients
          </h2>
          <span className="text-xs font-semibold text-muted-foreground">
            {draft.ingredients.length}
          </span>
        </div>

        <div className="space-y-3">
          {draft.ingredients.map((line, index) => (
            <div key={line.key} className={CARD}>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() =>
                      setDraft((c) => ({ ...c, ingredients: move(c.ingredients, index, -1) }))
                    }
                    className={GHOST}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === draft.ingredients.length - 1}
                    onClick={() =>
                      setDraft((c) => ({ ...c, ingredients: move(c.ingredients, index, 1) }))
                    }
                    className={GHOST}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${line.item_name || "ingredient"}`}
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        ingredients: c.ingredients.filter((_, i) => i !== index),
                      }))
                    }
                    className={`${GHOST} text-destructive`}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Pantry names are offered, not required: a recipe can call for
                  something you've never bought, and that line simply shows as
                  not in stock rather than being refused. */}
              {/* Name, amount and unit on one line - the three things every
                  ingredient has. Everything optional goes underneath. */}
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-40 flex-1">
                  <SoftSelect
                    id={`ingredient-name-${line.key}`}
                    name={`ingredient-name-${line.key}`}
                    options={pantryNames}
                    defaultValue={line.item_name}
                    onValueChange={(value) => patchIngredient(index, { item_name: value })}
                    className={`${SMALL} w-full pr-9`}
                  />
                </div>
                {/*
                  A text box, not a number box, so a ~ can be typed into it.

                  "1 medium onion" is roughly 70g and nobody who cooks knows
                  that number. A recipe that will not let you say "about" makes
                  the writer either invent a precision they do not have or give
                  up - and the person most likely to give up is the one writing
                  down a recipe they have cooked for forty years without
                  weighing anything.
                */}
                {line.unit !== UNMEASURED && (
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Quantity, with ~ for about"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(event) =>
                      patchIngredient(index, { quantity: event.target.value })
                    }
                    className={`${SMALL} w-[4.5rem] text-center`}
                  />
                )}
                <select
                  aria-label="Unit"
                  value={line.unit}
                  onChange={(event) => patchIngredient(index, { unit: event.target.value })}
                  className={`${SMALL} w-24`}
                >
                  {(Object.keys(UNITS_BY_DIMENSION) as Dimension[]).map((dimension) => (
                    <optgroup key={dimension} label={DIMENSION_LABEL[dimension]}>
                      {UNITS_BY_DIMENSION[dimension].map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {/* The other half of the same problem: a seasoning that was
                      never measured at all. */}
                  <optgroup label="No amount">
                    <option value={UNMEASURED}>to taste</option>
                  </optgroup>
                </select>
              </div>

              {line.quantity.trim().startsWith("~") && line.unit !== UNMEASURED && (
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  Roughly this much — it will read as{" "}
                  <span className="text-quantity">~{line.quantity.trim().slice(1)}</span>,
                  and still comes off your shelves.
                </p>
              )}
              {line.unit === UNMEASURED && (
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  No amount. Nothing comes off your shelves for this one — say
                  how much in the note below.
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  aria-label="Preparation note"
                  placeholder={line.unit === UNMEASURED ? "to taste" : "finely chopped"}
                  value={line.note}
                  onChange={(event) => patchIngredient(index, { note: event.target.value })}
                  className={`${SMALL} min-w-36 flex-1`}
                />

              {/* A tin is a container, not an amount. Saying how much is in one
                  lets the line work against a pantry that weighs the contents
                  as well as one that counts tins. */}
              {PACKAGE_UNITS.includes(line.unit) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    each one is
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-label={`Size of one ${line.unit}`}
                    placeholder="400"
                    value={line.pack_size}
                    onChange={(event) =>
                      patchIngredient(index, { pack_size: event.target.value })
                    }
                    className={`${SMALL} w-24`}
                  />
                  <select
                    aria-label="Pack size unit"
                    value={line.pack_unit}
                    onChange={(event) =>
                      patchIngredient(index, { pack_unit: event.target.value })
                    }
                    className={`${SMALL} w-24`}
                  >
                    {(Object.keys(UNITS_BY_DIMENSION) as Dimension[]).map((dimension) => (
                      <optgroup key={dimension} label={DIMENSION_LABEL[dimension]}>
                        {UNITS_BY_DIMENSION[dimension].map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <span className="text-xs font-semibold text-muted-foreground">
                    optional
                  </span>
                </div>
              )}

                <input
                  aria-label="Section"
                  placeholder="Section"
                  value={line.section}
                  onChange={(event) => patchIngredient(index, { section: event.target.value })}
                  className={`${SMALL} min-w-28 flex-1`}
                  list="known-sections"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={line.optional}
                    onChange={(event) => patchIngredient(index, { optional: event.target.checked })}
                    className="h-4 w-4"
                  />
                  Optional
                </label>
              </div>
            </div>
          ))}
        </div>

        <datalist id="known-sections">
          {sections.map((section) => (
            <option key={section} value={section} />
          ))}
        </datalist>

        <button
          type="button"
          onClick={() =>
            setDraft((c) => ({
              ...c,
              ingredients: [
                ...c.ingredients,
                {
                  key: makeKey(),
                  item_name: "",
                  quantity: "",
                  pack_size: "",
                  pack_unit: "g",
                  // Grams is the commonest thing to weigh; the picker is right
                  // there when it isn't.
                  unit: "g",
                  note: "",
                  optional: false,
                  // New rows inherit the last section, because ingredients
                  // arrive in groups far more often than they don't.
                  section: c.ingredients.at(-1)?.section ?? "",
                },
              ],
            }))
          }
          className="mt-3 w-full rounded-[14px] border border-dashed border-border py-3 text-sm font-bold text-muted-foreground hover:border-primary hover:text-foreground"
        >
          + Add an ingredient
        </button>
      </section>

      </div>

      {/* Stage 2 - the method, one instruction at a time. */}
      <div hidden={stage !== 1} className="space-y-6">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
            {STAGES[1].title}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">
            {STAGES[1].hint}
          </p>
        </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-label">
            Method
          </h2>
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {stepCount === 0 ? "None yet" : `${stepShowing + 1} of ${stepCount}`}
          </span>
        </div>

        {/* Every instruction, as somewhere to jump to. A method you are part
            way through writing is one you want to reread the middle of, and
            paging back four times to do it is why nobody does. */}
        {stepCount > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {draft.steps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                aria-label={`Go to step ${index + 1}`}
                aria-current={index === stepShowing}
                onClick={() => setStepAt(index)}
                className={`h-7 min-w-7 rounded-full px-2 text-xs font-extrabold tabular-nums ${
                  index === stepShowing
                    ? "bg-ink text-background"
                    : step.body.trim()
                      ? "bg-chip text-muted-foreground"
                      : "border border-dashed border-border text-muted-foreground/60"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        )}

        {/* Hidden, never unmounted: a step you paged away from keeps what was
            typed into it, including the half-finished sentence. */}
        <div>
          {draft.steps.map((step, index) => (
            <div key={step.key} hidden={index !== stepShowing} className={CARD}>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  Step {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  {/* The cursor goes with the step. Reordering without it
                      swaps the card under you and reads as the text changing
                      by itself, which is much worse than the reorder is
                      useful. */}
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => {
                      setDraft((c) => ({ ...c, steps: move(c.steps, index, -1) }));
                      setStepAt(index - 1);
                    }}
                    className={GHOST}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === draft.steps.length - 1}
                    onClick={() => {
                      setDraft((c) => ({ ...c, steps: move(c.steps, index, 1) }));
                      setStepAt(index + 1);
                    }}
                    className={GHOST}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() =>
                      setDraft((c) => ({ ...c, steps: c.steps.filter((_, i) => i !== index) }))
                    }
                    className={`${GHOST} text-destructive`}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                aria-label={`Step ${index + 1}`}
                placeholder="What to do."
                value={step.body}
                onChange={(event) => patchStep(index, { body: event.target.value })}
                className={`${FIELD} resize-y leading-relaxed`}
              />

              <div className="mt-2.5 flex flex-wrap gap-2">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  aria-label="Minutes this step takes"
                  placeholder="Min"
                  value={step.minutes}
                  onChange={(event) => patchStep(index, { minutes: event.target.value })}
                  className={`${SMALL} w-24`}
                />
                <input
                  aria-label="Section"
                  placeholder="Section, e.g. Prep"
                  value={step.section}
                  onChange={(event) => patchStep(index, { section: event.target.value })}
                  className={`${SMALL} min-w-40 flex-1`}
                  list="known-sections"
                />
              </div>

              {recipeId && photos?.stepIds[index] !== undefined && (
                <div className="mt-3">
                  <span className={LABEL}>Step photo</span>
                  <PhotoPicker
                    recipeId={recipeId}
                    stepId={photos.stepIds[index]}
                    kind="step"
                    current={photos.steps[photos.stepIds[index]] ?? null}
                    label="+ Add a photo of this step"
                    aspect="aspect-[16/7]"
                  />
                </div>
              )}

              {ingredientNames.length > 0 && (
                <div className="mt-3">
                  <span className={LABEL}>Uses</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ingredientNames.map((name) => {
                      const on = step.uses.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            patchStep(index, {
                              uses: on
                                ? step.uses.filter((used) => used !== name)
                                : [...step.uses, name],
                            })
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            on
                              ? "bg-primary text-primary-foreground"
                              : "bg-chip text-muted-foreground"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addStep}
          className="mt-3 w-full rounded-[14px] border border-dashed border-border py-3 text-sm font-bold text-muted-foreground hover:border-primary hover:text-foreground"
        >
          {stepCount === 0 ? "+ Add the first step" : "+ Add another step"}
        </button>
      </section>

      </div>

      {/* Stage 3 - what it is called, and everything about it. */}
      <div hidden={stage !== 2} className="space-y-6">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
            {STAGES[2].title}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">
            {STAGES[2].hint}
          </p>
        </div>

      <section className="space-y-4">
        {recipeId && photos ? (
          <div>
            <span className={LABEL}>Photo</span>
            <PhotoPicker
              recipeId={recipeId}
              kind="hero"
              current={photos.hero}
              label="+ Add a photo"
              aspect="aspect-[2/1]"
            />
          </div>
        ) : (
          <p className="rounded-[14px] bg-chip px-4 py-3 text-sm font-semibold text-muted-foreground">
            Save the recipe first and you can add photos to it and to each step.
          </p>
        )}

        <div>
          <label htmlFor="name" className={LABEL}>
            Name
          </label>
          <input
            id="name"
            value={draft.name}
            onChange={(event) => field("name", event.target.value)}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="description" className={LABEL}>
            Description
          </label>
          <textarea
            id="description"
            rows={2}
            value={draft.description}
            onChange={(event) => field("description", event.target.value)}
            className={`${FIELD} resize-y leading-relaxed`}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="base_servings" className={LABEL}>
              Serves
            </label>
            <input
              id="base_servings"
              type="number"
              min="1"
              inputMode="numeric"
              value={draft.base_servings}
              onChange={(event) => field("base_servings", event.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="prep_minutes" className={LABEL}>
              Prep min
            </label>
            <input
              id="prep_minutes"
              type="number"
              min="1"
              inputMode="numeric"
              value={draft.prep_minutes}
              onChange={(event) => field("prep_minutes", event.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="cook_minutes" className={LABEL}>
              Cook min
            </label>
            <input
              id="cook_minutes"
              type="number"
              min="1"
              inputMode="numeric"
              value={draft.cook_minutes}
              onChange={(event) => field("cook_minutes", event.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="source" className={LABEL}>
            Source
          </label>
          <input
            id="source"
            value={draft.source}
            placeholder="A link, a book, a person"
            onChange={(event) => field("source", event.target.value)}
            className={FIELD}
          />
        </div>
      </section>

      <section>
        <label htmlFor="notes" className={LABEL}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          placeholder="What happened last time you made it."
          value={draft.notes}
          onChange={(event) => field("notes", event.target.value)}
          className={`${FIELD} resize-y leading-relaxed`}
        />
      </section>

      </div>

      {/*
        Forward, back, and saving at the end.

        Keyed apart because they are two buttons in one position and React
        reuses the DOM node between them - the add-item form learned that the
        hard way, where a type flipping from button to submit mid-click
        submitted the form on the way into the last stage.
      */}
      <div className="mt-6 flex items-center gap-3">
        {stage > 0 && (
          <button
            key="back"
            type="button"
            onClick={goBack}
            aria-label={
              stage === 1 && stepShowing > 0 ? "Back one instruction" : "Back a stage"
            }
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-chip text-muted-foreground"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={3} />
          </button>
        )}

        {last ? (
          <button
            key="save"
            type="button"
            onClick={onSave}
            disabled={pending}
            className="h-14 flex-1 rounded-[14px] bg-primary px-4 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Saving…" : recipeId ? "Save changes" : "Create recipe"}
          </button>
        ) : (
          <button
            key="next"
            type="button"
            onClick={goNext}
            disabled={!canLeave}
            className="h-14 flex-1 rounded-[14px] bg-primary px-4 text-[15px] font-extrabold text-primary-foreground disabled:opacity-40"
          >
            {moreSteps ? "Next step" : stage === 1 ? "Done with the method" : "Continue"}
          </button>
        )}
      </div>

      {/*
        The way past the stages, for both halves of the job.

        An edit is often one field on the last screen, and walking two screens
        to reach it is worse than the tall page this replaced. This was gated
        on `recipeId` for that reason - which meant it appeared when editing
        and never when writing, and writing is where it is wanted just as
        badly: naming the thing before you make it is how most people start,
        and you had to page through every ingredient and every step before you
        could type a title.

        The wording changes because the sentence does. Editing, you are leaving
        the stages behind; authoring, you are going ahead to a screen you have
        not reached yet and will come back from.
      */}
      {!last && (
        <button
          type="button"
          onClick={() => setStage(STAGES.length - 1)}
          className="mt-2 w-full text-sm font-bold text-muted-foreground underline underline-offset-2"
        >
          {recipeId ? "Skip to the details" : "Name it first"}
        </button>
      )}

      {result && result.problems.length > 0 && (
        <div role="alert" className="rounded-[20px] bg-[oklch(0.96_0.03_40)] p-5">
          <h3 className="text-sm font-extrabold text-destructive">
            Not saved &mdash; {result.problems.length}{" "}
            {result.problems.length === 1 ? "problem" : "problems"}
          </h3>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-[oklch(0.44_0.09_38)]">
            {result.problems.map((problem, index) => (
              <li key={index}>
                {problem.path && <span className="font-mono">{problem.path}: </span>}
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Two different things used to be listed together here, and only one
          of them is a problem. An ingredient this kitchen has never held is
          the normal state of a recipe you have not shopped for yet - making
          somebody read it as a warning, every time they save, taught them to
          skim the list that also carries the real one. */}
      {result?.ok && realWarnings.length > 0 && (
        <div className="rounded-[20px] bg-chip p-5">
          <h3 className="text-sm font-extrabold">Saved, with things worth a look</h3>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-muted-foreground">
            {realWarnings.map((warning, index) => (
              <li key={index}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}

      {result?.ok && notStocked.length > 0 && (
        <p className="text-sm font-semibold text-muted-foreground">
          {notStocked.length === 1
            ? "One ingredient isn't in your kitchen yet."
            : `${notStocked.length} ingredients aren't in your kitchen yet.`}{" "}
          That&rsquo;s fine &mdash; the recipe keeps them, and you can send
          them straight to the shopping list.
        </p>
      )}

      </div>

      {/*
        The preview, as a phone.

        Locked to a handset's width and proportions on a desktop, which is what
        was asked for and is also the honest thing to show: this recipe is read
        on a phone next to a hob, and a preview stretched to half a 1440px
        window is a preview of a page nobody sees. The frame does the work the
        old bare column could not - it says where the editor stops.

        It scrolls inside itself rather than with the page, so the form can be
        long without the preview running out partway down.
      */}
      <div className={`${pane === "preview" ? "block" : "hidden"} lg:block`}>
        <div className="lg:sticky lg:top-24">
          <span className={`${LABEL} hidden lg:block`}>Preview</span>
          <div className="lg:h-[720px] lg:overflow-hidden lg:rounded-[34px] lg:border-[3px] lg:border-ink/85 lg:bg-page lg:p-2 lg:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.25)]">
            <div className="lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:rounded-[26px] [scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
              <RecipePreview draft={draft} photos={photos} />
            </div>
          </div>
          <p className="mt-2 hidden text-xs font-semibold text-muted-foreground lg:block">
            How it reads on a phone.
          </p>
        </div>
      </div>
    </div>
  );
}

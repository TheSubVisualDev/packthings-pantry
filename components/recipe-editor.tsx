"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PhotoPicker } from "@/components/photo-picker";
import { RecipePreview } from "@/components/recipe-preview";
import { SoftSelect } from "@/components/soft-select";
import { saveRecipeDocument, type SaveRecipeResult } from "@/app/recipes/actions";
import { PACKAGE_UNITS, UNITS_BY_DIMENSION } from "@/lib/units";
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
      ingredients: draft.ingredients.map((line) => ({
        item_name: line.item_name,
        quantity: Number(line.quantity),
        unit: line.unit,
        // Only meaningful for package units, and only when actually filled in.
        pack_size:
          PACKAGE_UNITS.includes(line.unit) && line.pack_size.trim()
            ? Number(line.pack_size)
            : undefined,
        pack_unit:
          PACKAGE_UNITS.includes(line.unit) && line.pack_size.trim()
            ? line.pack_unit
            : undefined,
        note: line.note || undefined,
        optional: line.optional,
        section: line.section || undefined,
      })),
      steps: draft.steps.map((step) => ({
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

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      {/* Spans both columns: one bar over the pair, so Save is in the same
          place whichever pane you're looking at. */}
      <div className="sticky top-0 z-30 -mx-5 mb-5 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-3 backdrop-blur sm:-mx-9 sm:px-9 lg:col-span-2">
        <div className="flex gap-1 rounded-full bg-chip p-1 text-[13px] font-bold lg:invisible">
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

        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="shrink-0 rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground transition-opacity disabled:opacity-60"
        >
          {pending ? "Saving…" : recipeId ? "Save changes" : "Create recipe"}
        </button>
      </div>

      {/* Preview left, fields right. */}
      <div className={`${pane === "preview" ? "block" : "hidden"} lg:block`}>
        <div className="lg:sticky lg:top-20">
          <span className={`${LABEL} hidden lg:block`}>Preview</span>
          <RecipePreview draft={draft} photos={photos} />
        </div>
      </div>

      <div className={`${pane === "edit" ? "block" : "hidden"} space-y-6 lg:block`}>
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
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  aria-label="Quantity"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(event) => patchIngredient(index, { quantity: event.target.value })}
                  className={`${SMALL} w-[4.5rem] text-center`}
                />
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
                </select>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  aria-label="Preparation note"
                  placeholder="finely chopped"
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

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-label">
            Method
          </h2>
          <span className="text-xs font-semibold text-muted-foreground">
            {draft.steps.length}
          </span>
        </div>

        <div className="space-y-3">
          {draft.steps.map((step, index) => (
            <div key={step.key} className={CARD}>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  Step {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => setDraft((c) => ({ ...c, steps: move(c.steps, index, -1) }))}
                    className={GHOST}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === draft.steps.length - 1}
                    onClick={() => setDraft((c) => ({ ...c, steps: move(c.steps, index, 1) }))}
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
          onClick={() =>
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
            }))
          }
          className="mt-3 w-full rounded-[14px] border border-dashed border-border py-3 text-sm font-bold text-muted-foreground hover:border-primary hover:text-foreground"
        >
          + Add a step
        </button>
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
    </div>
  );
}

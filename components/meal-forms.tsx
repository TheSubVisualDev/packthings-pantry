"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createMeal,
  linkRecipe,
  saveMeal,
  setMealKind,
  type MealResult,
} from "@/app/meals/actions";
import { MEAL_KINDS, MEAL_KIND_LABEL, type MealKind } from "@/lib/receipts";

const FIELD =
  "min-h-11 w-full min-w-0 rounded-[14px] border border-border bg-card px-4 text-sm font-semibold outline-none focus:border-primary sm:min-h-10";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";
const PRIMARY =
  "shrink-0 rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60";

/**
 * Which kind of cooking a meal is, as a row of segments.
 *
 * Drawn like components/ui/segmented.tsx but made of buttons, because that
 * one is links and this is a write - a kind changed by following a link would
 * be changed again by anything that prefetches it. The pill moves on the tap
 * and the server catches up behind it, the same promise Segmented makes.
 */
export function MealKindPicker({
  id,
  kind,
  canEdit,
}: {
  id: number;
  kind: MealKind;
  canEdit: boolean;
}) {
  const [showing, setShowing] = useState<MealKind>(kind);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="What kind of meal"
        className="-mx-1 flex max-w-full overflow-x-auto px-1 font-bold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex items-center gap-0.5 rounded-full bg-[oklch(0.93_0.02_60)] p-1">
          {MEAL_KINDS.map((option) => {
            const on = option === showing;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!canEdit}
                onClick={() => {
                  if (option === showing) return;
                  const before = showing;
                  setShowing(option);
                  setError(null);
                  startTransition(async () => {
                    const result = await setMealKind(id, option);
                    if (!result.ok) {
                      setShowing(before);
                      setError(result.error ?? "That didn't save.");
                    }
                  });
                }}
                className={`flex h-9 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors sm:h-8 sm:px-3.5 sm:text-[13px] ${
                  on
                    ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-muted-foreground enabled:hover:text-foreground"
                }`}
              >
                {MEAL_KIND_LABEL[option]}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>}
    </div>
  );
}

export function NewMealForm() {
  const [state, action, pending] = useActionState<MealResult, FormData>(createMeal, { ok: true });
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="meal-name" className={LABEL}>
          Name
        </label>
        <input
          id="meal-name"
          name="name"
          required
          maxLength={60}
          placeholder="Ramen, spag bol, work lunches"
          className={`mt-1.5 ${FIELD}`}
        />
      </div>
      <div>
        <label htmlFor="meal-kind" className={LABEL}>
          Kind
        </label>
        <select id="meal-kind" name="kind" defaultValue="riff" className={`mt-1.5 ${FIELD}`}>
          {MEAL_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {MEAL_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Adding…" : "Add the meal"}
      </button>
      {!state.ok && state.error && (
        <p className="text-sm font-semibold text-destructive">{state.error}</p>
      )}
    </form>
  );
}

/** Name and notes, saved together, because they are typed together. */
export function MealDetailsForm({
  id,
  name,
  notes,
}: {
  id: number;
  name: string;
  notes: string | null;
}) {
  const [nameValue, setName] = useState(name);
  const [notesValue, setNotes] = useState(notes ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = nameValue.trim() !== name || notesValue.trim() !== (notes ?? "").trim();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveMeal(id, { name: nameValue, notes: notesValue });
          setMessage(
            result.ok
              ? { ok: true, text: "Saved." }
              : { ok: false, text: result.error ?? "That didn't save." },
          );
        });
      }}
    >
      <div>
        <label htmlFor="meal-rename" className={LABEL}>
          Name
        </label>
        <input
          id="meal-rename"
          value={nameValue}
          onChange={(event) => {
            setName(event.target.value);
            setMessage(null);
          }}
          required
          maxLength={60}
          className={`mt-1.5 ${FIELD}`}
        />
      </div>
      <div>
        <label htmlFor="meal-notes" className={LABEL}>
          Notes
        </label>
        <textarea
          id="meal-notes"
          value={notesValue}
          onChange={(event) => {
            setNotes(event.target.value);
            setMessage(null);
          }}
          rows={3}
          maxLength={2000}
          placeholder="How it usually goes, who makes it"
          className={`mt-1.5 ${FIELD} py-2.5`}
        />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !changed || !nameValue.trim()} className={PRIMARY}>
          {pending ? "Saving…" : "Save"}
        </button>
        {message && (
          <p
            role="status"
            className={`text-sm font-semibold ${message.ok ? "text-muted-foreground" : "text-destructive"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * The real recipe a meal has become, picked from the cookbook.
 *
 * Saved on change: a select has exactly one thing to say, and a Save button
 * beside it would be a second tap to say it again.
 */
export function RecipeLinkSelect({
  id,
  recipeId,
  recipes,
}: {
  id: number;
  recipeId: number | null;
  recipes: { id: number; name: string }[];
}) {
  const [value, setValue] = useState(recipeId === null ? "" : String(recipeId));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <label htmlFor="meal-recipe" className="sr-only">
        Linked recipe
      </label>
      <select
        id="meal-recipe"
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          const before = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await linkRecipe(id, next === "" ? null : Number(next));
            if (!result.ok) {
              setValue(before);
              setError(result.error ?? "That didn't save.");
            }
          });
        }}
        className={FIELD}
      >
        <option value="">No recipe yet</option>
        {recipes.map((recipe) => (
          <option key={recipe.id} value={recipe.id}>
            {recipe.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>}
    </div>
  );
}

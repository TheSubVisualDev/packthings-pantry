"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { addRecipeTag, removeRecipeTag } from "@/app/recipes/[id]/cookbook-actions";
import { MAX_TAG_LENGTH, type RecipeTag } from "@/lib/recipe-tags";
import type { DerivedTag } from "@/lib/recipe-tags";

/**
 * The tags on a recipe: what somebody said about it, and what it says about
 * itself.
 *
 * Drawn in two weights rather than explained. Typed tags are solid chips you
 * can remove, because they are an opinion somebody took responsibility for.
 * Derived ones are outlined and have no remove button, because they are facts
 * about the row - "20 mins" is not a claim you can withdraw, only one you can
 * make untrue by editing the timings. An opinion and a measurement looking
 * identical is how you end up trusting the wrong one.
 *
 * Suggestions sit underneath, one tap each. Never applied on their own: a tag
 * that appeared without being asked for is the app deciding what you cooked.
 */
export function RecipeTags({
  recipeId,
  tags,
  derived,
  suggestions,
  canEdit,
}: {
  recipeId: number;
  tags: RecipeTag[];
  derived: DerivedTag[];
  /** Cuisines the ingredients point at, plus tags used on your other recipes. */
  suggestions: string[];
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState(tags);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const carried = new Set(current.map((tag) => tag.name.toLowerCase()));
  const unused = suggestions.filter((name) => !carried.has(name.toLowerCase())).slice(0, 6);

  function add(name: string) {
    const wanted = name.trim();
    if (!wanted || carried.has(wanted.toLowerCase())) {
      setDraft("");
      return;
    }
    setError(null);
    setDraft("");

    startTransition(async () => {
      const result = await addRecipeTag(recipeId, wanted);
      if (!result.ok || !result.tag) {
        setError(result.error ?? "Couldn't save that tag.");
        return;
      }
      // The server decides the stored name - it may already exist in another
      // case - so the chip shows what was saved, not what was typed.
      const saved = result.tag;
      setCurrent((list) =>
        list.some((tag) => tag.id === saved.id)
          ? list
          : [...list, saved].sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }

  function drop(tag: RecipeTag) {
    setCurrent((list) => list.filter((each) => each.id !== tag.id));
    startTransition(async () => {
      const result = await removeRecipeTag(recipeId, tag.id);
      if (!result.ok) {
        setCurrent((list) =>
          list.some((each) => each.id === tag.id)
            ? list
            : [...list, tag].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setError(result.error ?? "Couldn't remove that tag.");
      }
    });
  }

  if (!canEdit && current.length === 0 && derived.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {current.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-xs font-bold"
          >
            {tag.name}
            {canEdit && (
              <button
                type="button"
                onClick={() => drop(tag)}
                aria-label={`Remove ${tag.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            )}
          </span>
        ))}

        {derived.map((tag) => (
          <span
            key={tag.label}
            title={tag.because}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground"
          >
            {tag.label}
          </span>
        ))}

        {canEdit &&
          (typing ? (
            <input
              autoFocus
              value={draft}
              maxLength={MAX_TAG_LENGTH}
              placeholder="Tag it"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                add(draft);
                setTyping(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add(draft);
                }
                if (event.key === "Escape") {
                  setDraft("");
                  setTyping(false);
                }
              }}
              className="w-28 rounded-full bg-chip px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary"
            />
          ) : (
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
              Tag
            </button>
          ))}
      </div>

      {canEdit && unused.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Maybe:</span>
          {unused.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="rounded-full px-2 py-1 text-xs font-bold text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { BookOpen, BookmarkCheck, Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { describeStock } from "@/lib/containers";
import {
  addRecipeToCookbook,
  previewAdoption,
  removeRecipeFromCookbook,
} from "@/app/recipes/[id]/cookbook-actions";
import type { LinkChoice, ProposedLink } from "@/lib/cookbook";

/**
 * Adding a recipe to the kitchen's cookbook, and answering the one question
 * that can raise.
 *
 * This is the only place the app asks which jar an ingredient means. Every
 * other surface - the stock page, the suggestion cards, the stove - has to
 * already know, because a question asked mid-cook is asked at the worst
 * possible moment. So the confident lines link silently here and whatever is
 * genuinely ambiguous is put in front of somebody once, while they are already
 * deciding whether they want the recipe at all.
 *
 * An ingredient the kitchen has never held is deliberately NOT a question. A
 * recipe you have not shopped for yet is a normal recipe, and making somebody
 * dismiss a prompt about saffron before they can save it is exactly the
 * friction this is supposed to remove.
 */
export function CookbookButton({
  recipeId,
  inCookbook,
}: {
  recipeId: number;
  inCookbook: boolean;
}) {
  const [asking, setAsking] = useState<ProposedLink[] | null>(null);
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function begin() {
    setError(null);
    startTransition(async () => {
      const preview = await previewAdoption(recipeId);
      if (!preview.ok || !preview.lines) {
        setError(preview.error ?? "Couldn't read that recipe.");
        return;
      }

      // Nothing worth asking about: adopt straight away rather than showing a
      // dialog whose only content is an OK button.
      const questions = preview.lines.filter((line) => line.asks);
      if (questions.length === 0) {
        const result = await addRecipeToCookbook(recipeId);
        if (!result.ok) setError(result.error ?? "Couldn't add that.");
        return;
      }

      setChoices(
        Object.fromEntries(
          questions.map((line) => [line.ingredient.id, line.item?.id ?? null]),
        ),
      );
      setAsking(questions);
    });
  }

  function confirm() {
    const decided: LinkChoice[] = Object.entries(choices).map(
      ([ingredientId, itemId]) => ({
        ingredient_id: Number(ingredientId),
        item_id: itemId,
      }),
    );
    startTransition(async () => {
      const result = await addRecipeToCookbook(recipeId, decided);
      if (result.ok) setAsking(null);
      else setError(result.error ?? "Couldn't add that.");
    });
  }

  if (inCookbook) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await removeRecipeFromCookbook(recipeId);
              if (!result.ok) setError(result.error ?? "Couldn't remove that.");
            })
          }
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-chip px-4 py-3 text-sm font-bold disabled:opacity-60"
        >
          <BookmarkCheck className="h-4 w-4" strokeWidth={2.5} />
          {pending ? "Removing…" : "In your cookbook"}
        </button>
        <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
          Taking it out keeps what you linked, so putting it back asks nothing.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={begin}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
      >
        <BookOpen className="h-4 w-4" strokeWidth={2.5} />
        {pending ? "Adding…" : "Add to cookbook"}
      </button>
      <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
        Links it to your shelves, so cooking knows what to take off.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      {asking && (
        <LinkPrompt
          lines={asking}
          choices={choices}
          pending={pending}
          onChoose={(ingredientId, itemId) =>
            setChoices((current) => ({ ...current, [ingredientId]: itemId }))
          }
          onCancel={() => setAsking(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

/**
 * The one prompt. One question per ambiguous line, each pre-answered with the
 * best guess, so the fast path is to read it and press the button.
 */
function LinkPrompt({
  lines,
  choices,
  pending,
  onChoose,
  onCancel,
  onConfirm,
}: {
  lines: ProposedLink[];
  choices: Record<number, number | null>;
  pending: boolean;
  onChoose: (ingredientId: number, itemId: number | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open
      onClose={onCancel}
      title={
        lines.length === 1
          ? "One ingredient to check"
          : `${lines.length} ingredients to check`
      }
      description="Close enough to be worth asking, not close enough to guess. Answered once — cooking will not ask again."
      footer={
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="w-full rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add to cookbook"}
        </button>
      }
    >
      <div className="space-y-4">
        {lines.map((line) => (
          <div key={line.ingredient.id}>
            <p className="mb-2 text-sm font-extrabold">{line.ingredient.item_name}</p>
            <div className="flex flex-wrap gap-2">
              {line.alternatives.map((item) => {
                const picked = choices[line.ingredient.id] === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChoose(line.ingredient.id, item.id)}
                    className={
                      picked
                        ? "flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground"
                        : "flex min-h-11 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold hover:bg-border"
                    }
                  >
                    {picked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    {item.name}
                    <span className="font-semibold opacity-70">{describeStock(item)}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onChoose(line.ingredient.id, null)}
                className={
                  choices[line.ingredient.id] === null
                    ? "flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground"
                    : "flex min-h-11 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold hover:bg-border"
                }
              >
                {choices[line.ingredient.id] === null && (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                )}
                Not in my kitchen
              </button>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Check, ShoppingBasket } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { ChecklistLine, ChecklistPreview } from "@/app/list/actions";
import { formatQuantity, unitSuffix, UNMEASURED } from "@/lib/units";

/**
 * "Shop for it", as a checklist.
 *
 * It used to compare the recipe with the shelves and add the difference in
 * one press. v2 stopped tracking stock (18 Oct 2026), so the app no longer
 * knows what is in the cupboard - and guessing, either way, would put the
 * wrong things on a list somebody takes into a shop. So it asks the one
 * person who does know: every line arrives ticked, because most of a recipe
 * you are shopping for is usually what you need, and you untick what you
 * already have.
 *
 * Used by the recipe page and by the week planner, which hand it their own
 * preview and commit. The lines come from recipeShortfall on the server in
 * both cases, so there is one answer to "what is this recipe short of".
 */
export function ShopChecklist({
  load,
  commit,
  label,
  title,
  tone = "link",
  disabled = false,
}: {
  /** Asks the server what would be added. Writes nothing. */
  load: () => Promise<ChecklistPreview>;
  /** Adds the lines still ticked, by key. */
  commit: (keys: string[]) => Promise<{ ok: boolean; error?: string; message?: string }>;
  label: string;
  title: string;
  /** A quiet link under a list, or a full button on its own. */
  tone?: "link" | "button";
  disabled?: boolean;
}) {
  const [lines, setLines] = useState<ChecklistLine[] | null>(null);
  const [already, setAlready] = useState(0);
  /** Unticked keys. Everything not in here is ticked, which is the default. */
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () =>
    startTransition(async () => {
      setMessage(null);
      const preview = await load();
      if (!preview.ok || !preview.lines) {
        setMessage(preview.error ?? "Couldn't work that out.");
        return;
      }
      if (preview.lines.length === 0) {
        // Nothing to choose between, so no sheet whose only content is a
        // button. Said differently for the two reasons it can be empty.
        setMessage(
          (preview.alreadyListed ?? 0) > 0
            ? "It is all on the list already."
            : "Nothing here needs buying.",
        );
        return;
      }
      setUnticked(new Set());
      setAlready(preview.alreadyListed ?? 0);
      setLines(preview.lines);
    });

  const toggle = (key: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chosen = (lines ?? []).filter((line) => !unticked.has(line.key));
  // Only worth saying which recipe a line is for when there is more than one.
  const manyRecipes = new Set((lines ?? []).map((line) => line.source)).size > 1;

  const confirm = () =>
    startTransition(async () => {
      const result = await commit(chosen.map((line) => line.key));
      setMessage(result.ok ? (result.message ?? "Added.") : (result.error ?? "Couldn't."));
      if (result.ok) setLines(null);
    });

  return (
    <div className="text-center">
      <button
        type="button"
        disabled={pending || disabled}
        onClick={open}
        className={
          tone === "button"
            ? "flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-card text-sm font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.05)] disabled:opacity-40"
            : "text-sm font-semibold text-primary underline underline-offset-2 disabled:opacity-60"
        }
      >
        {tone === "button" && (
          <ShoppingBasket className="h-4 w-4 shrink-0" strokeWidth={2.8} />
        )}
        {pending && !lines ? "Working it out…" : label}
      </button>
      {message && (
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">{message}</p>
      )}

      <Sheet
        open={lines !== null}
        onClose={() => setLines(null)}
        title={title}
        description={
          already > 0
            ? `Untick what you already have. ${already} more ${already === 1 ? "is" : "are"} on the list already.`
            : "Untick what you already have."
        }
        footer={
          <button
            type="button"
            disabled={pending || chosen.length === 0}
            onClick={confirm}
            className="w-full rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {pending
              ? "Adding…"
              : chosen.length === 0
                ? "Nothing ticked"
                : `Add ${chosen.length} to the list`}
          </button>
        }
      >
        <ul className="space-y-1 text-left">
          {(lines ?? []).map((line) => {
            const ticked = !unticked.has(line.key);
            return (
              <li key={line.key}>
                {/* The whole row toggles, not just the circle: this is read
                    standing in a kitchen, often with one hand. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ticked}
                  onClick={() => toggle(line.key)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-1 text-left"
                >
                  <span
                    className={
                      ticked
                        ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border"
                    }
                  >
                    {ticked && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
                  </span>
                  <span className={`min-w-0 flex-1 ${ticked ? "" : "opacity-45"}`}>
                    <span className="block text-sm font-bold break-words">
                      {line.quantity !== null && line.unit !== UNMEASURED && (
                        <span className="font-mono text-quantity">
                          {formatQuantity(line.quantity)}
                          {unitSuffix(line.unit)}{" "}
                        </span>
                      )}
                      {line.name}
                    </span>
                    {manyRecipes && (
                      <span className="block text-xs font-semibold text-muted-foreground">
                        {line.source}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}

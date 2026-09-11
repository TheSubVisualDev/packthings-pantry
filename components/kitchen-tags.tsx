"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { removeKitchenTag, renameKitchenTag } from "@/app/kitchens/actions";
import { MAX_TAG_LENGTH } from "@/lib/tags";
import type { TagInUse } from "@/lib/tags";

/**
 * Every word this kitchen files things under, with how many jars carry each.
 *
 * The count is the useful part: a tag on one item is usually a typo or a
 * second spelling of one that already exists, and seeing "Sauces 7" next to
 * "sauce 1" is what makes that obvious without anyone having to go looking.
 */
export function KitchenTags({
  tags,
  canEdit,
}: {
  tags: TagInUse[];
  canEdit: boolean;
}) {
  const [list, setList] = useState(tags);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(tag: TagInUse) {
    const wanted = draft.trim();
    if (!wanted || wanted === tag.name) {
      setEditing(null);
      return;
    }
    const was = list;
    setList((current) =>
      current.map((entry) => (entry.id === tag.id ? { ...entry, name: wanted } : entry)),
    );
    setEditing(null);
    setError(null);

    startTransition(async () => {
      const result = await renameKitchenTag(tag.id, wanted);
      if (!result.ok) {
        setList(was);
        setError(result.error ?? "Couldn't rename that.");
      }
    });
  }

  function drop(tag: TagInUse) {
    const was = list;
    setList((current) => current.filter((entry) => entry.id !== tag.id));
    setConfirming(null);
    setError(null);

    startTransition(async () => {
      const result = await removeKitchenTag(tag.id);
      if (!result.ok) {
        setList(was);
        setError(result.error ?? "Couldn't remove that.");
      }
    });
  }

  if (list.length === 0) {
    return (
      <p className="text-sm font-semibold text-muted-foreground">
        No tags yet. They appear here as you file stock under them.
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-1.5">
        {list.map((tag) => (
          <li
            key={tag.id}
            className="flex flex-wrap items-center gap-2 rounded-[14px] bg-chip px-3 py-2"
          >
            {editing === tag.id ? (
              <>
                <input
                  autoFocus
                  value={draft}
                  maxLength={MAX_TAG_LENGTH}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      save(tag);
                    }
                    if (event.key === "Escape") setEditing(null);
                  }}
                  aria-label={`Rename ${tag.name}`}
                  className="min-w-32 flex-1 rounded-[10px] border border-border bg-background px-2.5 py-1.5 text-sm font-bold outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => save(tag)}
                  aria-label="Save"
                  className="rounded-full p-1.5 text-primary"
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  aria-label="Cancel"
                  className="rounded-full p-1.5 text-muted-foreground"
                >
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm font-bold break-words">
                  {tag.name}
                </span>
                <span className="shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
                  {tag.item_count}
                </span>

                {canEdit && confirming !== tag.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(tag.name);
                        setEditing(tag.id);
                      }}
                      aria-label={`Rename ${tag.name}`}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(tag.id)}
                      aria-label={`Remove ${tag.name}`}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={3} />
                    </button>
                  </>
                )}

                {canEdit && confirming === tag.id && (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {tag.item_count === 0
                        ? "Nothing carries this."
                        : `Comes off ${tag.item_count} ${tag.item_count === 1 ? "item" : "items"}.`}
                    </span>
                    <button
                      type="button"
                      onClick={() => drop(tag)}
                      className="rounded-[10px] bg-destructive px-3 py-1.5 text-xs font-extrabold text-white"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      Keep
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

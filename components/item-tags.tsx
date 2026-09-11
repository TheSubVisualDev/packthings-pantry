"use client";

import { useState, useTransition } from "react";
import { Star, X } from "lucide-react";
import { addTag, fileUnder, removeTag } from "@/app/pantry/actions";
import { MAX_TAG_LENGTH } from "@/lib/tags";
import type { Tag } from "@/lib/tags";

/**
 * The tags on one item, and the controls to change them.
 *
 * Two different things are shown at once, so they are drawn differently rather
 * than explained: every tag is a chip you can remove, and exactly one of them
 * carries a filled star for the tag the item is *filed* under - the one that
 * decides which group it appears in on the stock page. Tapping another chip's
 * star moves the filing.
 */
export function ItemTags({
  itemId,
  tags,
  primaryTagId,
  suggestions,
  canEdit,
}: {
  itemId: number;
  tags: Tag[];
  primaryTagId: number | null;
  /** Tags already in use in this kitchen, so common ones are one tap away. */
  suggestions: string[];
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState(tags);
  const [primary, setPrimary] = useState(primaryTagId);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const carried = new Set(current.map((tag) => tag.name.toLowerCase()));
  const unused = suggestions.filter((name) => !carried.has(name.toLowerCase()));

  function add(name: string) {
    const wanted = name.trim();
    if (!wanted || carried.has(wanted.toLowerCase())) {
      setDraft("");
      return;
    }
    setError(null);
    setDraft("");

    startTransition(async () => {
      const result = await addTag(itemId, wanted);
      if (!result.ok || !result.tag) {
        setError(result.error ?? "Couldn't save that tag.");
        return;
      }
      // The server decides the stored name - it may already exist in another
      // case - so the chip shows what was actually saved, not what was typed.
      const saved = result.tag;
      setCurrent((list) =>
        list.some((tag) => tag.id === saved.id)
          ? list
          : [...list, { id: saved.id, kitchen_id: 0, name: saved.name }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
      );
      setPrimary((was) => was ?? saved.id);
    });
  }

  function drop(tag: Tag) {
    const was = current;
    const wasPrimary = primary;
    setCurrent((list) => list.filter((entry) => entry.id !== tag.id));
    // Filing falls to whatever is left, matching what the server does, so the
    // chip and the stock page agree before the round trip finishes.
    if (primary === tag.id) {
      const next = was.filter((entry) => entry.id !== tag.id)[0];
      setPrimary(next ? next.id : null);
    }
    setError(null);

    startTransition(async () => {
      const result = await removeTag(itemId, tag.id);
      if (!result.ok) {
        setCurrent(was);
        setPrimary(wasPrimary);
        setError(result.error ?? "Couldn't remove that tag.");
      }
    });
  }

  function file(tag: Tag) {
    const was = primary;
    setPrimary(tag.id);
    setError(null);

    startTransition(async () => {
      const result = await fileUnder(itemId, tag.id);
      if (!result.ok) {
        setPrimary(was);
        setError(result.error ?? "Couldn't file it under that.");
      }
    });
  }

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">Tags</h2>

      {current.length === 0 ? (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          Untagged. The first tag you add is the one it gets filed under.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {current.map((tag) => {
            const isPrimary = tag.id === primary;
            return (
              <li
                key={tag.id}
                className={`flex items-center gap-1 rounded-full py-1.5 pr-1.5 pl-3 text-sm font-bold ${
                  isPrimary ? "bg-primary text-primary-foreground" : "bg-chip"
                }`}
              >
                {canEdit && !isPrimary && (
                  <button
                    type="button"
                    onClick={() => file(tag)}
                    aria-label={`File under ${tag.name}`}
                    title={`File under ${tag.name}`}
                    className="-ml-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Star className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                )}
                {isPrimary && (
                  <Star
                    className="-ml-1 h-3.5 w-3.5"
                    fill="currentColor"
                    strokeWidth={2.5}
                    aria-label="Filed under this"
                  />
                )}
                <span>{tag.name}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => drop(tag)}
                    aria-label={`Remove ${tag.name}`}
                    className={`rounded-full p-1 ${
                      isPrimary
                        ? "text-primary-foreground/70 hover:text-primary-foreground"
                        : "text-muted-foreground hover:text-destructive"
                    }`}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={draft}
              maxLength={MAX_TAG_LENGTH}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add(draft);
                }
              }}
              placeholder="Add a tag"
              aria-label="Add a tag"
              className="min-w-40 flex-1 rounded-[14px] border border-border bg-background px-4 py-2.5 font-semibold outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={draft.trim().length === 0}
              onClick={() => add(draft)}
              className="shrink-0 rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
            >
              Add
            </button>
          </div>

          {unused.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Already used here:
              </span>
              {unused.slice(0, 8).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => add(name)}
                  className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

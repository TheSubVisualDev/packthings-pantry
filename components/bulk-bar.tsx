"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPin, Sliders, Tag, Trash2, X } from "lucide-react";
import {
  bulkDelete,
  bulkLocation,
  bulkOpened,
  bulkTag,
  bulkUntag,
} from "@/app/pantry/actions";
import { MAX_TAG_LENGTH } from "@/lib/tags";
import type { TagInUse } from "@/lib/tags";

type Panel = "place" | "tag" | "untag" | "delete" | null;

const SHEET = "mt-3 rounded-[16px] bg-chip p-3";
const HEADING = "mb-2 text-xs font-bold uppercase tracking-[0.08em] text-label";
const CHIP =
  "rounded-full bg-card px-3 py-1.5 text-xs font-bold shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-border";

/**
 * What you can do to a selection, docked to the bottom of the screen.
 *
 * Fixed rather than inline because a selection is made by scrolling through the
 * list, and an action bar that scrolls away with it is one you have to go
 * looking for. Actions needing a value open a small panel above the bar rather
 * than a dialog, because a dialog would cover the selection you are acting on.
 */
export function BulkBar({
  ids,
  places,
  tags,
  onDone,
}: {
  ids: number[];
  places: string[];
  tags: TagInUse[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const count = ids.length;
  const noun = `${count} ${count === 1 ? "item" : "items"}`;

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error ?? "Couldn't do that.");
        return;
      }
      setPanel(null);
      setDraft("");
      // The server revalidated /pantry; this pulls the new rows in without
      // dropping the selection mode you are still standing in.
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-16px_rgba(60,44,30,0.5)]">
      <div className="mx-auto w-full max-w-[900px]">
        {panel === "place" && (
          <div className={SHEET}>
            <p className={HEADING}>Move {noun} to</p>
            <div className="flex flex-wrap gap-1.5">
              {places.map((place) => (
                <button
                  key={place}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => bulkLocation(ids, place))}
                  className={CHIP}
                >
                  {place}
                </button>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => bulkLocation(ids, ""))}
                className={`${CHIP} text-muted-foreground`}
              >
                Nowhere in particular
              </button>
            </div>
          </div>
        )}

        {panel === "tag" && (
          <div className={SHEET}>
            <p className={HEADING}>Tag {noun} as</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={draft}
                maxLength={MAX_TAG_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && draft.trim()) {
                    event.preventDefault();
                    run(() => bulkTag(ids, draft));
                  }
                }}
                placeholder="New or existing tag"
                aria-label="Tag to add"
                className="min-w-40 flex-1 rounded-[12px] border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={pending || !draft.trim()}
                onClick={() => run(() => bulkTag(ids, draft))}
                className="rounded-[12px] bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.slice(0, 10).map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => bulkTag(ids, tag.name))}
                    className={CHIP}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {panel === "untag" && (
          <div className={SHEET}>
            <p className={HEADING}>Take a tag off {noun}</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => bulkUntag(ids, tag.id))}
                  className={CHIP}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {panel === "delete" && (
          <div className={SHEET}>
            <p className="text-sm font-bold text-destructive">
              Delete {noun}? Recipes that call for them keep the line and simply
              stop being linked to stock.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => bulkDelete(ids))}
                className="rounded-[12px] bg-destructive px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {pending ? "Deleting…" : `Delete ${noun}`}
              </button>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-[12px] px-4 py-2 text-sm font-bold"
              >
                Keep them
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-destructive">
            {error}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-extrabold tabular-nums">{noun}</span>

          <Action
            icon={<MapPin className="h-4 w-4" strokeWidth={2.5} />}
            label="Move"
            active={panel === "place"}
            onClick={() => setPanel(panel === "place" ? null : "place")}
          />
          <Action
            icon={<Tag className="h-4 w-4" strokeWidth={2.5} />}
            label="Tag"
            active={panel === "tag"}
            onClick={() => setPanel(panel === "tag" ? null : "tag")}
          />
          {tags.length > 0 && (
            <Action
              icon={<X className="h-4 w-4" strokeWidth={3} />}
              label="Untag"
              active={panel === "untag"}
              onClick={() => setPanel(panel === "untag" ? null : "untag")}
            />
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => bulkOpened(ids, true))}
            className="rounded-full bg-chip px-3.5 py-2 text-xs font-bold disabled:opacity-50"
          >
            Opened
          </button>

          <button
            type="button"
            onClick={() => router.push(`/pantry/adjust?ids=${ids.join(",")}`)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground"
          >
            <Sliders className="h-4 w-4" strokeWidth={2.5} />
            Adjust these
          </button>

          <button
            type="button"
            onClick={() => setPanel(panel === "delete" ? null : "delete")}
            aria-label={`Delete ${noun}`}
            className="ml-auto rounded-full p-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${
        active ? "bg-ink text-background" : "bg-chip"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

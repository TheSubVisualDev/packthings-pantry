"use client";

import Link from "next/link";
import { useState } from "react";
import { BulkBar } from "@/components/bulk-bar";
import { describeStock, labelSaysOpen } from "@/lib/containers";
import type { TagInUse } from "@/lib/tags";
import type { Item } from "@/lib/types";

/**
 * The stock list, with a selection mode over it.
 *
 * Selecting is a mode rather than a checkbox beside every row: a checkbox on
 * each row would be permanent clutter for something you do occasionally. In
 * normal use a tap opens the item, which is what a tap has always done; in
 * selection mode a tap picks it. Nothing moves position between the two, so the
 * list does not reflow when you switch.
 *
 * Rows, not chips. This was a wrapping row of pills, which reads well with two
 * or three words in each and falls apart with real stock: "Extra thick double
 * cream 1 sealed + 300ml open" is most of a phone's width on its own, so every
 * pill took a line anyway and 29 items came to six screens of scrolling. Rows
 * are shorter, and putting the amount in its own right-aligned column means
 * "how much have I got" can be answered by running an eye down one edge
 * instead of reading every line to its end.
 */
export function StockList({
  groups,
  places,
  tags,
  canEdit,
}: {
  groups: [string, Item[]][];
  places: string[];
  tags: TagInUse[];
  canEdit: boolean;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const all = groups.flatMap(([, items]) => items);

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: Item[]) {
    const ids = items.map((item) => item.id);
    const everyOne = ids.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (everyOne) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function leave() {
    setSelecting(false);
    setSelected(new Set());
  }

  return (
    <>
      {canEdit && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (selecting ? leave() : setSelecting(true))}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
              selecting ? "bg-ink text-background" : "bg-chip text-muted-foreground"
            }`}
          >
            {selecting ? "Done" : "Select"}
          </button>

          {selecting && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground tabular-nums">
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    selected.size === all.length
                      ? new Set()
                      : new Set(all.map((item) => item.id)),
                  )
                }
                className="text-xs font-bold text-primary"
              >
                {selected.size === all.length ? "None" : "All"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([name, groupItems]) => (
          <section
            key={name}
            className="sm:rounded-[20px] sm:bg-card sm:p-5 sm:shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            <div className="mb-2.5 flex items-center justify-between gap-2 sm:mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-label">
                {name}
              </h2>
              {selecting && (
                <button
                  type="button"
                  onClick={() => toggleGroup(groupItems)}
                  className="shrink-0 text-xs font-bold text-primary"
                >
                  {groupItems.every((item) => selected.has(item.id))
                    ? "Clear"
                    : "Pick all"}
                </button>
              )}
            </div>

            <ul className="overflow-hidden rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:rounded-[12px] sm:bg-transparent sm:shadow-none">
              {groupItems.map((item) => {
                const picked = selected.has(item.id);
                const body = (
                  <>
                    <span className="min-w-0 flex-1 truncate">
                      {item.name}
                      {item.opened_at && !labelSaysOpen(item) && (
                        <span
                          title="Opened"
                          className="ml-1.5 text-xs font-bold text-muted-foreground"
                        >
                          open
                        </span>
                      )}
                    </span>
                    {/* Its own column, right-aligned and tabular, so amounts
                        line up down the edge and can be compared without
                        reading the names again. */}
                    <span
                      className={`shrink-0 text-right text-[13px] font-bold tabular-nums ${
                        picked ? "" : "text-quantity"
                      }`}
                    >
                      {describeStock(item)}
                    </span>
                  </>
                );

                // 44px of row, which is the thumb floor, and a hairline rather
                // than a gap between them - a divider reads as one list where
                // gaps read as a pile of separate things.
                const shape =
                  "flex min-h-11 w-full items-center gap-3 border-b border-border px-3.5 py-2 text-left text-sm font-semibold transition-colors last:border-b-0 sm:min-h-0 sm:py-1.5";

                return (
                  <li key={item.id}>
                    {selecting ? (
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() => toggle(item.id)}
                        className={`${shape} ${
                          picked
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-chip"
                        }`}
                      >
                        {body}
                      </button>
                    ) : (
                      <Link
                        href={`/pantry/item/${item.id}`}
                        className={`${shape} hover:bg-chip`}
                      >
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {selecting && selected.size > 0 && (
        <BulkBar
          ids={[...selected]}
          places={places}
          tags={tags}
          onDone={() => setSelected(new Set())}
        />
      )}
    </>
  );
}

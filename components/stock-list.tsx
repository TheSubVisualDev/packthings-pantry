"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { BulkBar } from "@/components/bulk-bar";
import { RowAdjust } from "@/components/row-adjust";
import { SwipeRow } from "@/components/swipe-row";
import { adjustItem } from "@/app/pantry/actions";
import { totalOnHand } from "@/lib/containers";
import { ADJUST_STEP } from "@/lib/units";
import { describeStock, inStock, labelSaysOpen } from "@/lib/containers";
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
  runOut = [],
  groupControl,
}: {
  groups: [string, Item[]][];
  places: string[];
  tags: TagInUse[];
  canEdit: boolean;
  /**
   * Things at zero that nobody has asked to keep in stock.
   *
   * Off the shelf, because a row reading "Tiger Bloomer 0g" is a shelf
   * claiming to hold nothing - but behind a count rather than gone, because an
   * item that vanishes the moment you finish it is one you cannot find again
   * to say you have bought more.
   */
  runOut?: Item[];
  /**
   * The group-by switch, rendered by the page because it is a set of links.
   *
   * It sits on this row rather than a row of its own: "how is this filed" and
   * "let me pick several" are both things you do TO the list, and the design
   * pass deleted a stacked control for every one of them.
   */
  groupControl?: React.ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  /**
   * Which row is open for adjusting - board `1t`.
   *
   * One at a time. Several open steppers would push the row you were aiming
   * at off the screen between deciding and tapping, which is the whole reason
   * this is inline rather than a screen of its own.
   */
  const [adjusting, setAdjusting] = useState<number | null>(null);

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

  function startSelecting() {
    setAdjusting(null);
    setSelecting(true);
  }

  return (
    <>
      {canEdit && !selecting && (
        <div className="mb-3 flex items-center gap-3 print:hidden">
          {groupControl}
          <div className="flex-grow" />
          <button
            type="button"
            onClick={startSelecting}
            className="flex h-9 shrink-0 items-center rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground"
          >
            Select
          </button>
        </div>
      )}

      {/*
        A dark bar in place of the controls, not beside them.

        Selection mode used to announce itself with one chip going dark while
        the group-by row stayed put, so the screen looked the same and a tap
        did something different - the worst way a mode can behave. Replacing
        the row says plainly that this is somewhere else, and the ✕ is the way
        back rather than a button labelled Done that reads like "apply".
      */}
      {canEdit && selecting && (
        <div className="mb-3 flex h-11 items-center gap-3 rounded-full bg-ink px-2 pr-4 text-background">
          <button
            type="button"
            onClick={leave}
            aria-label="Stop selecting"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"
          >
            <X className="h-4 w-4" strokeWidth={3} />
          </button>
          <span className="flex-1 text-sm font-extrabold tabular-nums">
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
            className="shrink-0 text-xs font-bold whitespace-nowrap"
          >
            {selected.size === all.length ? "Select none" : "Select all"}
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([name, groupItems]) => (
          <section
            key={name}
            className="sm:rounded-[20px] sm:bg-card sm:p-5 sm:shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            {/*
              A heading over the only group is a label with nothing to
              distinguish it from. A new kitchen has no tags, so every item
              lands under "UNTAGGED" and the first thing the shelf says is a
              word about filing rather than about food. The heading comes
              back the moment there is a second group to tell apart - and it
              stays while selecting, because "Pick all" needs to say all of
              what.
            */}
            <div
              className={`mb-2.5 items-center justify-between gap-2 sm:mb-3 ${
                groups.length === 1 && !selecting ? "hidden" : "flex"
              }`}
            >
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

            {/* stagger: each row a beat behind the one above. A shelf that
                deals itself out reads as a list being filled rather than a
                screenshot appearing. */}
            <ul className="stagger overflow-hidden rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:rounded-[12px] sm:bg-transparent sm:shadow-none">
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
                    {/* Something you have said to keep in stock, at zero. The
                        one case where an item's absence is the news, so it
                        stays on the shelf and says so rather than printing a
                        quiet "0g" that reads like a rounding error. */}
                    {!inStock(item) ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-[oklch(0.94_0.05_35)] px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-destructive">
                        <AlertTriangle className="h-3 w-3" strokeWidth={3} aria-hidden />
                        none left
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 text-right font-mono text-[13px] font-bold tabular-nums ${
                          picked ? "" : "text-quantity"
                        }`}
                      >
                        {describeStock(item)}
                      </span>
                    )}
                  </>
                );

                // 44px of row, which is the thumb floor, and a hairline rather
                // than a gap between them - a divider reads as one list where
                // gaps read as a pile of separate things.
                /**
                 * Something you asked to keep in stock, and there is none.
                 *
                 * The one case where an item's absence is the news rather than
                 * a tidiness problem, so it stays on the shelf and says so
                 * loudly - a red edge and a wash down the whole row, not just
                 * a chip on the end that scans as another quantity.
                 */
                const wanted = !inStock(item) && item.restock_target !== null;

                const shape = `flex min-h-11 w-full items-center gap-3 border-b border-border px-3.5 text-left text-sm font-semibold transition-colors last:border-b-0 sm:min-h-9 ${
                  wanted
                    ? "border-l-[3px] border-l-destructive bg-[oklch(0.97_0.02_35)] pl-3"
                    : ""
                }`;

                const open = adjusting === item.id;

                return (
                  <li key={item.id}>
                    {selecting ? (
                      /* A circle on every row, filled on the ones you have
                         picked. Tinting the row alone left nothing to aim at
                         and no way to tell a selectable list from a normal
                         one until you had already tapped something. */
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() => toggle(item.id)}
                        className={`${shape} ${picked ? "bg-primary/12" : "hover:bg-chip"}`}
                      >
                        <span
                          aria-hidden
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                            picked
                              ? "bg-primary text-primary-foreground"
                              : "border-2 border-border"
                          }`}
                        >
                          {picked && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
                        </span>
                        {body}
                      </button>
                    ) : (
                      /* A tap adjusts rather than navigates. Opening the item
                         is one chip inside, because changing how much there is
                         happens ten times for every time you want its dates.
                         A swipe left is the shortcut past the stepper for the
                         one answer that needs no number: it is gone. */
                      <SwipeRow
                        enabled={canEdit && !open}
                        label={item.name}
                        addLabel={
                          item.dimension === "count"
                            ? "+1"
                            : `+${ADJUST_STEP[item.dimension]}${item.canonical_unit}`
                        }
                        /* Nothing to use up on a row that is already empty,
                           which leaves only the half that can do something. */
                        onUsedUp={
                          inStock(item)
                            ? () => {
                                const total = totalOnHand(item);
                                // `totalOnHand`, never `quantity` - that is the
                                // open container alone, and taking it would
                                // leave the sealed packs behind on a row the
                                // person has just said is empty. AGENTS.md
                                // counts the bugs.
                                if (total === null || total <= 0) return;
                                void adjustItem(item.id, -total);
                              }
                            : null
                        }
                        onAddOne={() =>
                          void adjustItem(item.id, ADJUST_STEP[item.dimension])
                        }
                      >
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setAdjusting(open ? null : item.id)}
                          className={`${shape} ${open ? "bg-chip/60" : "hover:bg-chip"}`}
                        >
                          {body}
                        </button>
                      </SwipeRow>
                    )}

                    {/*
                      Unfolding, not appearing.

                      The stepper used to pop into existence at full height and
                      shove everything below it down the page - the single
                      jumpiest thing in the app, on the control people use most.
                      AnimatePresence keeps it mounted while it leaves, which is
                      the half CSS cannot do.
                    */}
                    <AnimatePresence initial={false}>
                      {open && !selecting && canEdit && (
                        <motion.div
                          key="adjust"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 36,
                            mass: 0.7,
                          }}
                          className="overflow-hidden"
                        >
                          <RowAdjust item={item} onClose={() => setAdjusting(null)} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* The way back. Not a shelf - these are not on it - but a list of
          things this kitchen knows about and currently has none of. */}
      {runOut.length > 0 && !selecting && (
        <details className="mt-4 print:hidden">
          <summary className="cursor-pointer text-sm font-bold text-muted-foreground">
            {runOut.length} run out
          </summary>
          <ul className="mt-2 overflow-hidden rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {runOut.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/pantry/item/${item.id}`}
                  className="flex min-h-11 w-full items-center gap-3 border-b border-border px-3.5 text-left text-sm font-semibold text-muted-foreground last:border-b-0 hover:bg-chip"
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-xs font-bold">none left</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

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

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, CopyPlus, Settings2, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import {
  copyWeekForward,
  emptySlot,
  putInSlot,
  renameSlots,
  type PlanResult,
} from "@/app/plan/actions";
import { MAX_SLOTS, SLOT_SUGGESTIONS, shortDay, type PlannedDay } from "@/lib/plan";
import { recipeTint } from "@/lib/tint";

/** What can go in a slot, for the picker. */
export interface Pickable {
  id: number;
  name: string;
  /** How much of it this kitchen has, so the week can be planned around it. */
  have: number;
  total: number;
}

/**
 * The week, as seven rows rather than seven columns.
 *
 * A planner is a grid on a desktop and a grid is exactly what does not fit on
 * a phone: seven columns at 400px is 50px a cell, which holds a dot. This app
 * is mobile-first and stays that way, so the week runs down the screen the way
 * a week actually reads - one day after another - and only widens into columns
 * where there is room for them.
 *
 * Each planned meal is drawn in its recipe's own tint, the same colour the
 * listing card gives it. A planned week is a stripe of colour down the page,
 * and you can see at a glance that four days running are the same brown.
 */
export function WeekPlan({
  start,
  days,
  slots,
  today,
  options,
  canEdit,
}: {
  start: string;
  days: PlannedDay[];
  slots: string[];
  today: string;
  /** Everything this kitchen could cook, for the picker. */
  options: Pickable[];
  canEdit: boolean;
}) {
  const [picking, setPicking] = useState<{ date: string; slot: number } | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [pending, startWorking] = useTransition();

  function run(work: () => Promise<PlanResult>) {
    setResult(null);
    startWorking(async () => {
      const done = await work();
      setResult(done);
      if (done.ok) setPicking(null);
    });
  }

  const planned = days.flatMap((day) => day.meals).filter(Boolean).length;

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setSettingUp(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" strokeWidth={2.8} />
            {slots.length === 1 ? slots[0] : `${slots.length} meals a day`}
          </button>

          {/* Most weeks are mostly last week, and typing the same five dinners
              in again is why a planner stops being used in its third week. */}
          {planned > 0 && (
            <button
              type="button"
              onClick={() => run(() => copyWeekForward(start))}
              disabled={pending}
              className="flex h-9 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground disabled:opacity-40"
            >
              <CopyPlus className="h-3.5 w-3.5" strokeWidth={2.8} />
              Repeat next week
            </button>
          )}
        </div>
      )}

      {result?.message && (
        <p className="rounded-[12px] bg-chip px-3.5 py-2.5 text-xs font-bold text-muted-foreground">
          {result.message}
        </p>
      )}
      {result && !result.ok && result.error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {result.error}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {days.map((day) => {
          const { day: name, number } = shortDay(day.date);
          const isToday = day.date === today;
          const past = day.date < today;

          return (
            <section
              key={day.date}
              className={`overflow-hidden rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${
                // Days gone by fade rather than disappear: the week is still
                // the week, and Monday's dinner is why Thursday is not it again.
                past ? "opacity-55" : ""
              }`}
            >
              <div
                className={`flex items-center gap-2 px-3.5 py-2 ${
                  isToday ? "bg-primary text-primary-foreground" : "bg-chip/60"
                }`}
              >
                <span className="text-xs font-extrabold tracking-[0.06em] uppercase">
                  {name}
                </span>
                <span className="text-xs font-bold tabular-nums opacity-80">
                  {number}
                </span>
                {isToday && (
                  <span className="ml-auto text-[11px] font-extrabold tracking-[0.08em] uppercase">
                    Today
                  </span>
                )}
              </div>

              <ul className="lg:flex lg:divide-x lg:divide-border">
                {slots.map((slotName, slot) => {
                  const meal = day.meals[slot] ?? null;

                  return (
                    <li
                      key={slot}
                      className="border-b border-border last:border-b-0 lg:flex-1 lg:border-b-0"
                    >
                      {meal ? (
                        <div
                          className="flex items-center gap-2 px-3.5 py-2.5"
                          // The recipe's own colour, the one its card carries.
                          // A week planned out is a stripe down the page.
                          style={
                            meal.recipe_id
                              ? { background: recipeTint(meal.recipe_id) }
                              : undefined
                          }
                        >
                          <div className="min-w-0 flex-1">
                            {slots.length > 1 && (
                              <p className="text-[10px] font-bold tracking-[0.08em] text-ink/55 uppercase">
                                {slotName}
                              </p>
                            )}
                            {meal.recipe_id ? (
                              <Link
                                href={`/recipes/${meal.recipe_id}`}
                                className="text-sm font-extrabold break-words text-ink hover:underline"
                              >
                                {meal.recipe_name}
                              </Link>
                            ) : (
                              <p className="text-sm font-bold break-words text-ink/70 italic">
                                {meal.note}
                              </p>
                            )}
                          </div>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => run(() => emptySlot(day.date, slot))}
                              disabled={pending}
                              aria-label={`Clear ${slotName} on ${name} ${number}`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink/45 hover:bg-black/8 hover:text-ink print:hidden"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={3} />
                            </button>
                          )}
                        </div>
                      ) : canEdit ? (
                        <button
                          type="button"
                          onClick={() => setPicking({ date: day.date, slot })}
                          className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left text-sm font-semibold text-muted-foreground hover:bg-chip/60"
                        >
                          <span className="text-base leading-none">+</span>
                          {slots.length > 1 ? slotName : "Plan something"}
                        </button>
                      ) : (
                        <p className="px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
                          {slots.length > 1 ? `${slotName} — nothing yet` : "Nothing yet"}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {picking && (
        <Picker
          options={options}
          pending={pending}
          onClose={() => setPicking(null)}
          onChoose={(recipeId) =>
            run(() => putInSlot({ date: picking.date, slot: picking.slot, recipeId }))
          }
          onNote={(note) =>
            run(() => putInSlot({ date: picking.date, slot: picking.slot, note }))
          }
        />
      )}

      {settingUp && (
        <SlotSetup
          current={slots}
          pending={pending}
          onClose={() => setSettingUp(false)}
          onSave={(names) => {
            run(() => renameSlots(names));
            setSettingUp(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Choosing what goes in a slot.
 *
 * Ordered by how much of it is already in, because the whole reason to plan a
 * week in this app rather than on paper is that it knows what is on the
 * shelves. "Something else" is right there at the top rather than buried:
 * "out on Saturday" is a real answer about the week and a planner that only
 * accepts recipes makes people leave a gap that reads as undecided.
 */
function Picker({
  options,
  pending,
  onClose,
  onChoose,
  onNote,
}: {
  options: Pickable[];
  pending: boolean;
  onClose: () => void;
  onChoose: (recipeId: number) => void;
  onNote: (note: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? options.filter((option) => option.name.toLowerCase().includes(needle))
    : options;

  return (
    <Sheet open onClose={onClose} title="What are you having?">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a recipe"
        aria-label="Find a recipe"
        className="w-full rounded-[14px] border border-border bg-page px-4 py-3 font-semibold outline-none placeholder:text-[13px] focus:border-primary"
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Leftovers", "Out", "Takeaway", "Something else"].map((note) => (
          <button
            key={note}
            type="button"
            disabled={pending}
            onClick={() => onNote(note)}
            className="h-9 rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground disabled:opacity-40"
          >
            {note}
          </button>
        ))}
      </div>

      <ul className="mt-3 max-h-[50vh] overflow-y-auto rounded-[16px] bg-card">
        {shown.length === 0 && (
          <li className="p-4 text-sm font-semibold text-muted-foreground">
            {/* A kitchen whose cookbook is empty opens this on nothing at all,
                which is a dead end rather than an empty list. The way out is
                the point of the message. */}
            {options.length === 0 ? (
              <>
                Nothing in this kitchen&apos;s cookbook yet.{" "}
                <Link
                  href="/discover"
                  className="font-bold text-primary underline underline-offset-2"
                >
                  Find one
                </Link>{" "}
                or{" "}
                <Link
                  href="/recipes/new"
                  className="font-bold text-primary underline underline-offset-2"
                >
                  write one
                </Link>
                . You can still plan leftovers and nights out above.
              </>
            ) : (
              "Nothing matches that."
            )}
          </li>
        )}
        {shown.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onChoose(option.id)}
              className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-chip disabled:opacity-40"
            >
              <span className="min-w-0 flex-1 text-sm font-bold break-words">
                {option.name}
              </span>
              {/* What planning it would cost, said before you choose rather
                  than after. The point of planning here rather than on paper. */}
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                  option.have === option.total
                    ? "bg-primary/12 text-primary"
                    : "bg-chip text-muted-foreground"
                }`}
              >
                {option.total === 0
                  ? "no ingredients"
                  : option.have === option.total
                    ? "all in"
                    : `${option.total - option.have} to buy`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** How many meals a day this kitchen plans, and what it calls them. */
function SlotSetup({
  current,
  pending,
  onClose,
  onSave,
}: {
  current: string[];
  pending: boolean;
  onClose: () => void;
  onSave: (names: string[]) => void;
}) {
  const [names, setNames] = useState<string[]>(current);

  return (
    <Sheet open onClose={onClose} title="Meals a day">
      <p className="text-sm font-medium text-muted-foreground">
        Up to {MAX_SLOTS}. Most people plan dinner and nothing else, which is
        why that is what you start with.
      </p>

      <ul className="mt-3 space-y-2">
        {names.map((name, index) => (
          <li key={index} className="flex items-center gap-2">
            <input
              value={name}
              maxLength={24}
              aria-label={`Meal ${index + 1}`}
              onChange={(event) =>
                setNames((current) =>
                  current.map((each, at) => (at === index ? event.target.value : each)),
                )
              }
              className="min-w-0 flex-1 rounded-[12px] border border-border bg-page px-3.5 py-2.5 font-semibold outline-none focus:border-primary"
            />
            {names.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setNames((current) => current.filter((_, at) => at !== index))
                }
                aria-label={`Remove ${name || "this meal"}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground"
              >
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {names.length < MAX_SLOTS && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SLOT_SUGGESTIONS.filter(
            (suggestion) =>
              !names.some((name) => name.toLowerCase() === suggestion.toLowerCase()),
          ).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              /* Inserted in the order the day goes, not appended. Tapping
                 "+ Lunch" on a kitchen that plans dinner gave Dinner then
                 Lunch, which reads as a mistake every time you look at it.
                 A name typed by hand keeps wherever it was put. */
              onClick={() =>
                setNames((current) => {
                  const next = [...current, suggestion];
                  const order = (name: string) => {
                    const at = SLOT_SUGGESTIONS.findIndex(
                      (known) => known.toLowerCase() === name.trim().toLowerCase(),
                    );
                    // Anything the app has no opinion about goes last, in the
                    // order it was added.
                    return at === -1 ? SLOT_SUGGESTIONS.length : at;
                  };
                  return next
                    .map((name, index) => ({ name, index }))
                    .sort((a, b) => order(a.name) - order(b.name) || a.index - b.index)
                    .map((entry) => entry.name);
                })
              }
              className="h-9 rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Said plainly, because it looks like deletion and is not. A meal in a
          slot you remove stays in the table, so putting the slot back brings
          the week back with it. */}
      {names.length < current.length && (
        <p className="mt-3 text-xs font-semibold text-muted-foreground">
          Anything already planned in the meals you removed is kept — add the
          meal back and it reappears.
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => onSave(names)}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-40"
      >
        <Check className="h-4 w-4" strokeWidth={3} />
        Save
      </button>
    </Sheet>
  );
}

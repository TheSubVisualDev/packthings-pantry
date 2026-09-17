"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { putInSlot } from "@/app/plan/actions";

/**
 * Putting this recipe on a day, from the page where you are looking at it.
 *
 * The week planner has never had a single meal put in it - `meal_plan` has
 * held zero rows for its whole life - and it is not because it is hard to
 * find: "The week" sits at the top of the front door. It is that planning
 * happened in the wrong place. You decide you want a thing while you are
 * reading the thing, and the app's answer was to remember that, go to another
 * screen, find an empty slot and search for the recipe again.
 *
 * So the decision is offered where it is made. Seven days, the kitchen's own
 * meal names, one tap. "Not tonight, but Thursday" is a sentence somebody says
 * out loud about a recipe they are already looking at.
 */
export function PlanItButton({
  recipeId,
  slots,
  days,
}: {
  recipeId: number;
  /** This kitchen's meal names, in order. Breakfast, Lunch, Dinner, usually. */
  slots: string[];
  /** The next seven days, as ISO dates with the labels already worked out. */
  days: { date: string; day: string; number: string; today: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(date: string, slot: number, label: string) {
    setError(null);
    startTransition(async () => {
      const result = await putInSlot({ date, slot, recipeId, from: "/recipes" });
      if (!result.ok) {
        setError(result.error ?? "Couldn't put it there.");
        return;
      }
      setDone(label);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDone(null);
          setOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-chip px-4 py-3 text-sm font-extrabold"
      >
        {done ? (
          <>
            <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={3} />
            Planned for {done}
          </>
        ) : (
          <>
            <CalendarPlus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            Plan it for a day
          </>
        )}
      </button>

      {/* One quiet line rather than a toast: it is the answer to a question
          somebody just asked, and it should still be there when they look
          back at the button. */}
      {done && (
        <p className="mt-1.5 text-center text-xs font-semibold text-muted-foreground">
          It will be waiting on the Tonight screen that day.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-center text-xs font-bold text-destructive">
          {error}
        </p>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Plan it for a day"
        description="Pick a meal. It shows up on Tonight when the day comes."
      >
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.date}>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-label">
                {day.today ? "Today" : day.day} {day.number}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      choose(
                        day.date,
                        index,
                        `${day.today ? "today" : day.day} ${name.toLowerCase()}`,
                      )
                    }
                    className="h-10 rounded-full bg-chip px-4 text-sm font-bold disabled:opacity-50"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}

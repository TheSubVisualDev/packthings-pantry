"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { estimateExpiry } from "@/app/pantry/actions";

/**
 * Puts a rough date on everything that has never had one.
 *
 * The sibling of EstimateButton and the same bargain: these are how long bread
 * usually lasts rather than how long yours will, so it is a thing somebody
 * presses on purpose and then sees the list of what was assumed. A background
 * job would put dates on the whole kitchen without anybody agreeing to it, and
 * the one failure that matters here is somebody throwing food away on a number
 * the app made up.
 *
 * It only ever fills blanks - a date you typed and a date already guessed are
 * both left alone - so pressing it twice is safe and pressing it after
 * correcting one by hand does not undo the correction.
 */
export function EstimateDatesButton({ blind }: { blind: number }) {
  const [filled, setFilled] = useState<{ name: string; basis: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (blind === 0 && filled === null) return null;

  if (filled) {
    return (
      <div className="print:hidden mt-3 rounded-[14px] bg-chip p-3">
        <p className="text-sm font-bold">
          {filled.length === 0
            ? "None of those are foods the app knows the shelf life of."
            : `Dated ${filled.length}. Correct any of them by typing a real date.`}
        </p>
        {filled.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs font-semibold text-muted-foreground">
            {filled.map((entry) => (
              <li key={entry.name}>
                {entry.name} — taken as {entry.basis}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await estimateExpiry();
            if (result.ok) setFilled(result.filled ?? []);
            else setError(result.error ?? "Couldn't date those.");
          })
        }
        className="flex items-center gap-2 rounded-full bg-chip px-3.5 py-2 text-xs font-bold hover:bg-border disabled:opacity-60"
      >
        <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.5} />
        {pending ? "Working it out…" : `Date the ${blind} with no date`}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setExpiry } from "@/app/pantry/actions";
import type { OpenedPack } from "@/app/recipes/[id]/actions";

/**
 * Asks for the date on a packet you have just opened.
 *
 * Cooking can finish the open container and break into a sealed one, and the
 * date that was on the item belonged to the packet you have just used up - so
 * it is cleared rather than carried forward, and this asks for the new one.
 *
 * Asked here, immediately after cooking, because that is the only moment the
 * packet is in your hand. Days later it is in the bin and the answer is gone.
 *
 * Skipping is fine and needs no button: an item with no date is an honest
 * state, and plenty of things have nothing printed on them anyway.
 */
export function NewPackDates({ opened }: { opened: OpenedPack[] }) {
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [, startTransition] = useTransition();

  if (opened.length === 0) return null;

  return (
    <div className="mt-4 rounded-[16px] bg-chip p-4">
      <p className="text-sm font-bold">
        {opened.length === 1
          ? "You opened a new one."
          : `You opened ${opened.length} new packs.`}{" "}
        <span className="font-semibold text-muted-foreground">
          What&apos;s the date on {opened.length === 1 ? "it" : "them"}?
        </span>
      </p>

      <ul className="mt-3 space-y-2">
        {opened.map((pack) => (
          <li key={pack.item_id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-32 flex-1 text-sm font-bold break-words">
              {pack.item_name}
            </span>
            <input
              type="date"
              aria-label={`Date on the new ${pack.item_name}`}
              value={saved[pack.item_id] ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setSaved((current) => ({ ...current, [pack.item_id]: value }));
                // Saved as you pick rather than behind a button: there is
                // nothing else to confirm, and a form with one field per pack
                // and a Save at the bottom is a form people abandon.
                startTransition(async () => {
                  await setExpiry(pack.item_id, value);
                });
              }}
              className="rounded-[12px] border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
            />
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-xs font-semibold text-muted-foreground">
        Leave it blank if there isn&apos;t one — the old packet&apos;s date has
        already been cleared either way.
      </p>
    </div>
  );
}

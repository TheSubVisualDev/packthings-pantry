"use client";

import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";

/**
 * The things you do TO an item rather than with it.
 *
 * One entry so far, and it is here because of where the one entry used to be:
 * a grey underlined "Delete" at the bottom of three hundred lines, past the
 * shelf, the packaging, the dates and the paperwork. That is indistinguishable
 * from not existing, and it was duly reported as missing.
 *
 * The same circle in the same corner the recipe page uses, because "where do I
 * delete this" should have one answer across the app.
 */
export function ItemMenu({
  name,
  onDelete,
}: {
  name: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`More for ${name}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        <button
          type="button"
          onClick={() => {
            // Closed before asking, so the confirmation is on the page rather
            // than under a sheet that is about to slide away over it.
            setOpen(false);
            onDelete();
          }}
          className="flex min-h-12 w-full items-center gap-2.5 rounded-[14px] bg-chip px-4 text-left text-sm font-extrabold text-destructive"
        >
          <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          Delete this item
        </button>
      </Sheet>
    </>
  );
}

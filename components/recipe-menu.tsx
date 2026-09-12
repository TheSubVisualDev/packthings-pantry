"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";

/**
 * Everything you do to a recipe rather than with it.
 *
 * Editing it, deciding who can see it, forking it into a variation: three
 * things you do once or twice in a recipe's life, which were three permanent
 * blocks between the cooking and the comments. They are one circle in the
 * corner now, which is where a phone puts this.
 *
 * The contents arrive as children so the server can build them - the
 * visibility control and the remix button are already their own components and
 * neither of them wanted rewriting to live behind a sheet.
 */
export function RecipeMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="More"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18)] backdrop-blur"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2.5} />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="This recipe"
        description="Editing, who can see it, and making your own version."
      >
        <div className="space-y-4">{children}</div>
      </Sheet>
    </>
  );
}

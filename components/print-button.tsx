"use client";

import { Printer } from "lucide-react";

/**
 * Put this screen on paper.
 *
 * A button rather than leaving people to find the browser's own print command,
 * because on a phone that is three taps into a share sheet and most people do
 * not know it is there. What actually prints is decided by `print:hidden` on
 * the controls and by the print block in globals.css.
 */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground print:hidden"
    >
      <Printer className="h-4 w-4" strokeWidth={2.5} />
      {label}
    </button>
  );
}

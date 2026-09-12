"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * The one modal surface: a sheet from the bottom on a phone, a panel in the
 * middle on a desktop.
 *
 * Written because there were three of these, hand-rolled, and they disagreed
 * about everything that matters. Only one of them closed on Escape. None
 * trapped focus, so tabbing walked off into the page behind. None locked the
 * background scroll, so a short sheet over a long recipe scrolled the recipe.
 * None was announced as a dialog.
 *
 * Those are not polish. A modal you cannot dismiss with the keyboard and
 * cannot tab around is a modal that fails the moment somebody is not using a
 * mouse - and this app is used one-handed in a kitchen, which is closer to
 * that case than to a desk.
 *
 * Dismissal is deliberately generous: Escape, the backdrop, and a close
 * button. A sheet that can only be left one way is a trap, and the cost of an
 * accidental dismissal here is re-tapping a button.
 *
 * **Mobile first.** It is a bottom sheet by default - rising from the thumb,
 * full width, with a grab handle and room left for the home indicator - and
 * only becomes a centred panel once there is a wide screen to centre it in.
 * The phone layout is the design; the desktop one is the accommodation.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title. Optional, but most of these want one. */
  description?: string;
  children: React.ReactNode;
  /** Actions, pinned under the content rather than scrolling away with it. */
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Where focus was, so it can go back. Losing your place in the page after
    // dismissing a dialog is disorienting in a way that is hard to name and
    // easy to fix.
    returnTo.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    // The first thing you can act on, rather than the close button - the point
    // of opening this was to do something, not to leave.
    focusable()[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // A cycle rather than a wall: tab past the end and you land at the
      // start, which is what every other dialog on the web does.
      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      // The backdrop only, never a click that started inside the panel and
      // happened to end here - which is what dragging to select text does.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[88vh] w-full max-w-[520px] flex-col rounded-t-[22px] bg-card pb-[env(safe-area-inset-bottom)] shadow-lg sm:max-h-[85vh] sm:rounded-[20px] sm:pb-0"
      >
        {/* Says "this drags up from the bottom" without a word, and gives a
            thumb somewhere safe to land. Phones only: on a centred desktop
            panel it would be describing a gesture that does not exist. */}
        <div aria-hidden className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>

        <div className="flex items-start justify-between gap-3 p-5 pb-0">
          <div className="min-w-0">
            <h2 className="text-[19px] font-extrabold tracking-[-0.02em] break-words">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {/* 44px of thumb, pulled out by its own margin so it still reads
              as sitting in the corner. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-chip"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        {/* Only the content scrolls, so the actions stay reachable however
            long the list gets - which matters most on the sheet that asks
            about every unmatched line of a receipt. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="border-t border-border p-5 pt-4 pb-6 sm:pb-5">{footer}</div>
        )}
      </div>
    </div>
  );
}

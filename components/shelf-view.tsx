import Link from "next/link";
import { ShelfVessel } from "@/components/shelf-vessel";
import { fillFor } from "@/lib/vessel";
import type { Item } from "@/lib/types";

/**
 * The shelves, as shelves.
 *
 * A list of forty-seven rows answers "is there any X" and nothing else. This
 * answers the question people actually open the app holding a pan to ask -
 * what have I got - by drawing the kitchen instead of tabulating it.
 *
 * Grouped by where things live rather than by tag, because that is the
 * grouping the picture needs to be true: a fridge shelf with the spices on it
 * is not a fridge. Tags stay the list view's business, and they are messy
 * anyway - "Milks liquid and powder" is a real tag in this database.
 *
 * Everything here is data the app has had since containers arrived. Nothing
 * was added to draw it.
 */

/** Things with no location, which is a third of the kitchen and has to go somewhere. */
const HOMELESS = "Not put away";

export function ShelfView({
  items,
  places,
  canEdit,
}: {
  items: Item[];
  /** The kitchen's own list, so shelves appear in the order it uses. */
  places: string[];
  canEdit: boolean;
}) {
  const byPlace = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.location ?? HOMELESS;
    const bucket = byPlace.get(key);
    if (bucket) bucket.push(item);
    else byPlace.set(key, [item]);
  }

  /**
   * Known places in the kitchen's order, then anything else alphabetically,
   * then the homeless pile last.
   *
   * Last on purpose: it is the biggest group here and it is the one nobody
   * arranged, so leading with it would make a tidy kitchen look like a mess.
   */
  const ordered = [
    ...places.filter((place) => byPlace.has(place)),
    ...[...byPlace.keys()]
      .filter((key) => key !== HOMELESS && !places.includes(key))
      .sort((a, b) => a.localeCompare(b)),
    ...(byPlace.has(HOMELESS) ? [HOMELESS] : []),
  ];

  const known = items.filter((item) => fillFor(item) !== null).length;

  return (
    <div className="flex flex-col gap-3">
      {/*
        The honest headline, and the reason this view earns its place twice.

        Thirteen of forty-seven have a level. Said out loud rather than papered
        over, because a hollow outline is the only thing on this screen that
        asks to be filled in - and a shelf full of them is a better argument
        for saying how much is left than any prompt would be.
      */}
      {known < items.length && (
        <div className="flex items-center gap-3 rounded-[18px] bg-card px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="flex shrink-0 items-end gap-[3px]" aria-hidden>
            <span className="h-6 w-[7px] rounded-[2px] bg-primary" />
            <span className="h-6 w-[7px] rounded-[2px] bg-primary" />
            <span className="h-6 w-[7px] rounded-[2px] border border-dashed border-border" />
            <span className="h-6 w-[7px] rounded-[2px] border border-dashed border-border" />
          </div>
          <p className="text-xs font-bold leading-relaxed">
            <span className="font-extrabold">
              {known} of {items.length} have a level.
            </span>{" "}
            <span className="text-muted-foreground">
              The outlines are things nobody has said the amount of.
            </span>
          </p>
        </div>
      )}

      {ordered.map((place) => {
        const shelf = byPlace.get(place) ?? [];
        const blind = shelf.every((item) => fillFor(item) === null);

        return (
          <section
            key={place}
            className="flex flex-col gap-1 rounded-[20px] bg-card px-3.5 pt-3 pb-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2
                  className={`text-xs font-bold uppercase tracking-[0.08em] ${
                    blind ? "text-muted-foreground" : "text-label"
                  }`}
                >
                  {place}
                </h2>
                {blind && (
                  <span className="rounded-full bg-quantity px-2 py-0.5 text-[10px] font-extrabold text-card">
                    all unknown
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-quantity">
                {shelf.length} {shelf.length === 1 ? "thing" : "things"}
              </span>
            </div>

            {/*
              Wraps rather than scrolls sideways: a shelf you have to drag to
              read is a shelf you cannot take in at a glance, which is the one
              thing this view is for.

              **The ledge is each tile's bottom border, not one line under the
              card.** A shelf of seven wraps to two rows, and a single line at
              the bottom left the first row floating in mid-air - which is the
              one thing that has to be right, because standing on something is
              the whole reason these read as a shelf rather than as icons.
              Tiles sit flush horizontally so their borders join into one
              continuous line per row, which then works at any width without
              anybody having to know how many fit.
            */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(62px,1fr))] items-end gap-y-3">
              {shelf.map((item) => (
                <Link
                  key={item.id}
                  href={`/pantry/item/${item.id}`}
                  data-track="stock.open"
                  className={`card-press flex flex-col items-center gap-0.5 px-0.5 pb-1.5 ${
                    blind ? "border-b-[3px] border-border/50" : "border-b-[3px] border-border"
                  }`}
                >
                  <ShelfVessel item={item} size={44} />
                  <span
                    className={`line-clamp-2 text-center text-[10px] leading-[1.2] font-extrabold ${
                      fillFor(item) === null ? "text-quantity" : ""
                    }`}
                  >
                    {item.name}
                  </span>
                </Link>
              ))}
            </div>

            {canEdit && place === HOMELESS && (
              <Link
                href="/pantry?by=location"
                className="mt-2 flex min-h-11 items-center justify-center rounded-[14px] bg-chip text-[13px] font-extrabold hover:bg-border"
              >
                Give these a shelf
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}

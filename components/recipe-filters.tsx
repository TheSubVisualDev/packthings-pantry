import Link from "next/link";

/**
 * The filters over a cookbook: what kind of thing, and how long you have.
 *
 * Links rather than a form, so a filtered cookbook is a URL - shareable,
 * bookmarkable, and back-button-able, which a piece of component state is not.
 * "Asian" and "30 mins" as two taps is the whole interaction.
 *
 * Time is minutes rather than a tag on purpose. The derived tags read as
 * promises about an upper bound ("20 mins"), so filtering by them as strings
 * would mean asking for half an hour and not being shown the ten minute one.
 * Comparing the numbers is what anybody actually means.
 */
export function RecipeFilters({
  tags,
  activeTag,
  activeWithin,
  term,
  basePath = "/recipes",
}: {
  tags: string[];
  activeTag: string | null;
  activeWithin: number | null;
  term: string;
  /** Which list is being filtered - the cookbook, or tonight's shortlist. */
  basePath?: string;
}) {
  /** Keeps whatever else is set while changing one thing. */
  function href(next: { tag?: string | null; within?: number | null }) {
    const params = new URLSearchParams();
    if (term) params.set("q", term);

    const tag = next.tag === undefined ? activeTag : next.tag;
    const within = next.within === undefined ? activeWithin : next.within;
    if (tag) params.set("tag", tag);
    if (within) params.set("within", String(within));

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  // The time chips need no tags to be useful - every recipe has timings, or
  // admits it does not - so the bar earns its place as soon as there is a
  // cookbook to filter.
  const times = [15, 30, 45];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const on = activeTag?.toLowerCase() === tag.toLowerCase();
        return (
          <Link
            key={tag}
            href={href({ tag: on ? null : tag })}
            aria-current={on ? "true" : undefined}
            className={
              on
                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                : "rounded-full bg-chip px-3 py-1.5 text-xs font-bold hover:bg-border"
            }
          >
            {tag}
          </Link>
        );
      })}

      {tags.length > 0 && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}

      {times.map((minutes) => {
        const on = activeWithin === minutes;
        return (
          <Link
            key={minutes}
            href={href({ within: on ? null : minutes })}
            aria-current={on ? "true" : undefined}
            className={
              on
                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                : "rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
            }
          >
            under {minutes} min
          </Link>
        );
      })}
    </div>
  );
}

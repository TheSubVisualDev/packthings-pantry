import { FilterChips } from "@/components/ui/filter-chips";

/**
 * The filters over a cookbook: what kind of thing, and how long you have.
 *
 * Links rather than a form, so a filtered cookbook is a URL - shareable,
 * bookmarkable, and back-button-able, which a piece of component state is not.
 * "Asian" and "30 mins" as two taps is the whole interaction.
 *
 * Time filters on minutes rather than on the derived "20 mins" tags. Those
 * labels read as promises about an upper bound, so matching them as strings
 * would mean asking for half an hour and not being shown the ten minute one.
 * Comparing the numbers is what anybody actually means.
 *
 * The time chips are drawn quietly, as outlines rather than solids, because
 * they are a fact the recipe computed about itself while the tags beside them
 * are somebody's opinion - the same distinction the recipe page makes.
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
  // admits it does not - so the row earns its place as soon as there is a
  // cookbook to filter.
  const times = [15, 30, 45];

  return (
    <FilterChips
      label="Filter recipes"
      className="mb-4"
      chips={[
        ...tags.map((tag) => {
          const on = activeTag?.toLowerCase() === tag.toLowerCase();
          return {
            key: `tag-${tag}`,
            label: tag,
            href: href({ tag: on ? null : tag }),
            active: on,
          };
        }),
        ...times.map((minutes) => {
          const on = activeWithin === minutes;
          return {
            key: `within-${minutes}`,
            label: `under ${minutes} min`,
            href: href({ within: on ? null : minutes }),
            active: on,
            quiet: true,
          };
        }),
      ]}
    />
  );
}

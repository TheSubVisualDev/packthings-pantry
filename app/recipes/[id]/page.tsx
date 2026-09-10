import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipe, getItems } from "@/lib/queries";
import { formatQuantity, toCanonical } from "@/lib/units";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

type LineStatus =
  | { kind: "in-stock"; needed: number; available: number; unit: string }
  | { kind: "short"; needed: number; available: number; unit: string }
  | { kind: "not-in-pantry" }
  | { kind: "needs-manual"; reason: string };

/**
 * Resolves a recipe line against pantry stock at base servings. Lines that
 * can't be matched - unknown ingredient, or a unit from a different dimension -
 * are surfaced for manual handling rather than silently skipped.
 */
function resolveLine(
  itemName: string,
  quantity: number,
  unit: string,
  itemsByName: Map<string, Item>,
): LineStatus {
  const item = itemsByName.get(itemName.toLowerCase());
  if (!item) return { kind: "not-in-pantry" };

  const converted = toCanonical(quantity, unit, item.dimension);
  if (!converted.ok) {
    return {
      kind: "needs-manual",
      reason:
        converted.reason === "dimension-mismatch"
          ? `${unit} can't convert to ${item.canonical_unit}`
          : `unknown unit "${unit}"`,
    };
  }

  const kind = item.quantity >= converted.quantity ? "in-stock" : "short";
  return {
    kind,
    needed: converted.quantity,
    available: item.quantity,
    unit: item.canonical_unit,
  };
}

function StatusBadge({ status }: { status: LineStatus }) {
  const base = "shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap";
  switch (status.kind) {
    case "in-stock":
      return (
        <span className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300`}>
          In stock
        </span>
      );
    case "short":
      return (
        <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`}>
          Low
        </span>
      );
    case "not-in-pantry":
      return (
        <span className={`${base} bg-muted text-muted-foreground`}>
          Not in pantry
        </span>
      );
    case "needs-manual":
      return (
        <span
          className={`${base} bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300`}
          title={status.reason}
        >
          Manual
        </span>
      );
  }
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isInteger(recipeId)) notFound();

  const [recipe, items] = await Promise.all([getRecipe(recipeId), getItems()]);
  if (!recipe) notFound();

  const itemsByName = new Map(
    items.map((item) => [item.name.toLowerCase(), item]),
  );

  const lines = recipe.ingredients.map((line) => ({
    ...line,
    status: resolveLine(line.item_name, line.quantity, line.unit, itemsByName),
  }));

  const unresolved = lines.filter(
    (line) =>
      line.status.kind === "not-in-pantry" || line.status.kind === "needs-manual",
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/recipes"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Recipes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {recipe.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>Serves {recipe.base_servings}</span>
          <span>
            {recipe.rating === null ? "Unrated" : `Rated ${recipe.rating}/5`}
          </span>
          <span>Cooked {recipe.times_cooked}&times;</span>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ingredients &mdash; at base {recipe.base_servings} servings
        </h2>
        <ul className="divide-y rounded-lg border">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="break-words font-medium">{line.item_name}</div>
                <div className="text-sm text-muted-foreground">
                  {formatQuantity(line.quantity)}
                  {line.unit === "count" ? "" : ` ${line.unit}`}
                </div>
              </div>
              <StatusBadge status={line.status} />
            </li>
          ))}
        </ul>
      </section>

      {unresolved.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Needs manual handling
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300">
            {unresolved.map((line) => (
              <li key={line.id}>
                {line.item_name}
                {line.status.kind === "needs-manual" &&
                  ` - ${line.status.reason}`}
                {line.status.kind === "not-in-pantry" && " - not in pantry"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.notes && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notes
          </h2>
          <p className="rounded-lg border p-4 text-sm leading-relaxed">
            {recipe.notes}
          </p>
        </section>
      )}
    </div>
  );
}

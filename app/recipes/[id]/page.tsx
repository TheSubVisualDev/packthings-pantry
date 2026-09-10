import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Stars } from "@/components/recipe-suggestion";
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
  const base =
    "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap";
  switch (status.kind) {
    case "in-stock":
      return (
        <span className={`${base} bg-chip text-muted-foreground`}>In stock</span>
      );
    case "short":
      return (
        <span className={`${base} bg-[oklch(0.94_0.06_75)] text-[oklch(0.42_0.1_60)]`}>
          Low
        </span>
      );
    case "not-in-pantry":
      return (
        <span className={`${base} bg-[oklch(0.94_0.05_35)] text-destructive`}>
          Not in pantry
        </span>
      );
    case "needs-manual":
      return (
        <span
          className={`${base} bg-[oklch(0.94_0.05_35)] text-destructive`}
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
    <>
      <SiteHeader active="recipes" />

      <div className="mx-auto w-full max-w-[760px] px-5 pt-6 pb-32 sm:px-9 sm:py-8">
        <Link
          href="/recipes"
          className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; Recipes
        </Link>

        <h1 className="mt-3 text-[28px] font-extrabold tracking-[-0.02em] break-words sm:text-[32px]">
          {recipe.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted-foreground">
          <Stars rating={recipe.rating} className="text-primary" />
          <span>serves {recipe.base_servings}</span>
          <span>cooked {recipe.times_cooked}&times;</span>
        </div>

        <section className="mt-7">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
            Ingredients &mdash; at base {recipe.base_servings} servings
          </h2>
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <div className="font-bold break-words">{line.item_name}</div>
                  <div className="text-sm font-semibold text-quantity">
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
          <section className="mt-5 rounded-[20px] bg-[oklch(0.96_0.03_40)] p-5">
            <h2 className="text-sm font-extrabold text-destructive">
              Needs manual handling
            </h2>
            <ul className="mt-2 space-y-1 text-sm font-semibold text-[oklch(0.44_0.09_38)]">
              {unresolved.map((line) => (
                <li key={line.id}>
                  {line.item_name}
                  {line.status.kind === "needs-manual" &&
                    ` — ${line.status.reason}`}
                  {line.status.kind === "not-in-pantry" && " — not in pantry"}
                </li>
              ))}
            </ul>
          </section>
        )}

        {recipe.notes && (
          <section className="mt-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-label">
              Notes
            </h2>
            <p className="rounded-[20px] bg-card p-5 text-sm leading-relaxed font-medium shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {recipe.notes}
            </p>
          </section>
        )}
      </div>
    </>
  );
}

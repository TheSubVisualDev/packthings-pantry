import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SiteHeader } from "@/components/site-header";
import { Page, PageTitle } from "@/components/ui/page";
import { MealDetailsForm, MealKindPicker, RecipeLinkSelect } from "@/components/meal-forms";
import { getBoughtLines, getMeal } from "@/lib/receipt-db";
import { getCookbookRecipes } from "@/lib/queries";
import { MEAL_KIND_LABEL, moodboard, type MoodboardEntry } from "@/lib/receipts";
import { currentKitchen } from "@/lib/session";
import { removeMeal } from "../actions";

export const dynamic = "force-dynamic";

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const context = await currentKitchen();
  const meal =
    context.ok && context.kitchen ? await getMeal(context.kitchen.id, Number(id)) : null;
  return { title: `${meal?.name ?? "Meal"} · Pantry` };
}

function Board({ title, entries }: { title: string; entries: MoodboardEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className={CARD}>
      <h2 className={LABEL}>{title}</h2>
      <ul className="mt-2 divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.name.toLowerCase()}>
            {/* To the receipts it came from - a ranking you cannot check is
                one nobody should believe. */}
            <Link
              href={`/receipts?q=${encodeURIComponent(entry.name)}`}
              className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-chip"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{entry.name}</span>
                {entry.category && (
                  <span className="block truncate text-xs font-semibold text-muted-foreground">
                    {entry.category}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                {entry.times === 1 ? "once" : `${entry.times} times`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One meal: what it is, and what has gone into it.
 *
 * The moodboard is the point and the settings are the furniture, so the
 * moodboard comes first on a phone and the settings sit below it.
 */
export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const context = await currentKitchen();
  if (!context.ok) redirect(`/login?next=${encodeURIComponent(`/meals/${raw}`)}`);
  if (!context.kitchen) redirect("/kitchens");
  const { kitchen, user } = context;
  const canEdit = kitchen.role !== "viewer";

  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const meal = await getMeal(kitchen.id, id);
  if (!meal) notFound();

  const [lines, cookbook] = await Promise.all([
    getBoughtLines(kitchen.id, id),
    canEdit ? getCookbookRecipes(kitchen.id, user.id) : Promise.resolve([]),
  ]);
  const board = moodboard(lines);
  const fresh = board.filter((entry) => !entry.cupboard);
  const cupboard = board.filter((entry) => entry.cupboard);

  /**
   * The linked recipe stays in the list even when it has dropped out of the
   * cookbook, so the select shows what is stored rather than quietly reading
   * "No recipe yet" over a link that is still there.
   */
  const recipes = cookbook.map((recipe) => ({ id: recipe.id, name: recipe.name }));
  if (meal.recipe_id !== null && meal.recipe_name && !recipes.some((r) => r.id === meal.recipe_id)) {
    recipes.unshift({ id: meal.recipe_id, name: meal.recipe_name });
  }

  return (
    <>
      <SiteHeader active="none" />
      <Page width="read">
        <BackLink
          href="/meals"
          label="Meals"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        />
        <div className="mt-2">
          <PageTitle
            title={meal.name}
            subtitle={`${MEAL_KIND_LABEL[meal.kind]} · ${
              meal.lines === 0 ? "nothing tagged yet" : `${meal.lines} ${meal.lines === 1 ? "line" : "lines"} tagged`
            }`}
          />
        </div>

        <div className="space-y-3">
          {meal.recipe_id !== null && meal.recipe_name && (
            <Link
              href={`/recipes/${meal.recipe_id}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-[16px] bg-chip px-4 py-3 text-sm font-bold hover:bg-border"
            >
              <span className="min-w-0 truncate">The recipe: {meal.recipe_name}</span>
              <span aria-hidden>→</span>
            </Link>
          )}

          {board.length === 0 ? (
            <p className="rounded-[16px] bg-chip p-4 text-sm font-semibold text-muted-foreground">
              Nothing here yet. Tag lines on a{" "}
              <Link href="/receipts" className="font-bold text-primary underline underline-offset-2">
                receipt
              </Link>{" "}
              with {meal.name} and they fill this in, most-bought first.
            </p>
          ) : (
            <>
              <Board title="Bought fresh for it" entries={fresh} />
              <Board title="From the cupboard" entries={cupboard} />
            </>
          )}

          {meal.notes && !canEdit && (
            <section className={CARD}>
              <h2 className={LABEL}>Notes</h2>
              <p className="mt-2 text-sm font-medium whitespace-pre-line">{meal.notes}</p>
            </section>
          )}

          {canEdit && (
            <>
              <section className={CARD}>
                <h2 className={LABEL}>Kind</h2>
                <div className="mt-3">
                  <MealKindPicker id={meal.id} kind={meal.kind} canEdit={canEdit} />
                </div>
              </section>

              <section className={CARD}>
                <h2 className={LABEL}>Recipe</h2>
                <p className="mt-2 mb-3 text-sm font-medium text-muted-foreground">
                  Once somebody has written it down, link the real recipe from the cookbook.
                </p>
                <RecipeLinkSelect id={meal.id} recipeId={meal.recipe_id} recipes={recipes} />
              </section>

              <section className={CARD}>
                <MealDetailsForm key={`${meal.name}\n${meal.notes ?? ""}`} id={meal.id} name={meal.name} notes={meal.notes} />
              </section>

              <div className="px-1 pt-2">
                <ConfirmDelete
                  action={removeMeal.bind(null, meal.id)}
                  label="Delete this meal"
                  question={`Delete ${meal.name}? The receipt lines stay; they just stop being tagged with it.`}
                />
              </div>
            </>
          )}
        </div>
      </Page>
    </>
  );
}

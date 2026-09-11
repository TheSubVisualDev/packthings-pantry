import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { apiContext } from "@/lib/session";
import { getItems, getRecipe } from "@/lib/queries";
import { parseRecipeDocument } from "@/lib/recipe-schema";
import { deleteRecipe, saveRecipe } from "@/lib/recipe-store";

export const dynamic = "force-dynamic";

/**
 * One recipe, in the same shape POST accepts.
 *
 * Deliberately round-trippable: what comes out of here can be edited and sent
 * straight back to PUT, which is what lets a Claude session say "halve the
 * chilli" without anyone retyping the document.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await apiContext(request);
  if (!context.ok) {
    return NextResponse.json({ error: "No account for this request" }, { status: 401 });
  }

  // A recipe you may not see is reported as missing rather than forbidden, so
  // the endpoint doesn't confirm that someone else's private recipe exists.
  const recipe = await getRecipe(Number((await params).id), context.user.id);
  if (!recipe) return NextResponse.json({ error: "No such recipe" }, { status: 404 });

  const byId = new Map(recipe.ingredients.map((line) => [line.id, line.item_name]));

  return NextResponse.json(
    {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      base_servings: recipe.base_servings,
      prep_minutes: recipe.prep_minutes,
      cook_minutes: recipe.cook_minutes,
      source: recipe.source,
      notes: recipe.notes,

      // History, not document: these are read-only here and a PUT ignores them.
      rating: recipe.rating,
      times_cooked: recipe.times_cooked,

      ingredients: recipe.ingredients.map((line) => ({
        item_name: line.item_name,
        quantity: line.quantity,
        unit: line.unit,
        pack_size: line.pack_size,
        pack_unit: line.pack_unit,
        note: line.note,
        optional: line.optional === 1,
        section: line.section,
        in_pantry: line.item_id !== null,
      })),

      steps: recipe.steps.map((step) => ({
        body: step.body,
        minutes: step.minutes,
        section: step.section,
        uses: step.uses.map((line) => byId.get(line.id) ?? line.item_name),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Replaces a recipe's contents. Rating and times_cooked are left alone. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const context = await apiContext(request);
  if (!context.ok) {
    return NextResponse.json({ error: "No account for this request" }, { status: 401 });
  }

  const existing = await getRecipe(id, context.user.id);
  if (!existing) return NextResponse.json({ error: "No such recipe" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { problems: [{ path: "", message: "Body isn't valid JSON." }] },
      { status: 400 },
    );
  }

  const parsed = parseRecipeDocument(body, await getItems(context.kitchen?.id ?? null));
  if (!parsed.ok || !parsed.recipe) {
    return NextResponse.json(
      { problems: parsed.problems, warnings: parsed.warnings },
      { status: 422 },
    );
  }

  await saveRecipe(parsed.recipe, id);

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);

  return NextResponse.json({ id, url: `/recipes/${id}`, warnings: parsed.warnings });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  if (!(await deleteRecipe(id))) {
    return NextResponse.json({ error: "No such recipe" }, { status: 404 });
  }

  revalidatePath("/recipes");
  return new NextResponse(null, { status: 204 });
}

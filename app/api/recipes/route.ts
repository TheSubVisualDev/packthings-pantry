import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { apiContext } from "@/lib/session";
import { parseRecipeDocument } from "@/lib/recipe-schema";
import { saveRecipe } from "@/lib/recipe-store";

export const dynamic = "force-dynamic";

/**
 * Accepts a recipe document and writes it.
 *
 * The parse is the whole job: units checked against the table this app
 * actually converts, and steps tied to the lines they use. A document that
 * isn't a recipe is refused with the reasons; one that is, but has something
 * worth a second look, is saved with warnings.
 */
export async function POST(request: Request) {
  const context = await apiContext(request);
  if (!context.ok) {
    return NextResponse.json({ error: "No account for this request" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { problems: [{ path: "", message: "Body isn't valid JSON." }] },
      { status: 400 },
    );
  }

  const parsed = parseRecipeDocument(body);

  if (!parsed.ok || !parsed.recipe) {
    return NextResponse.json(
      { problems: parsed.problems, warnings: parsed.warnings },
      { status: 422 },
    );
  }

  const id = await saveRecipe(parsed.recipe);

  revalidatePath("/recipes");

  return NextResponse.json(
    { id, url: `/recipes/${id}`, warnings: parsed.warnings },
    { status: 201 },
  );
}

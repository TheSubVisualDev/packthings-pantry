import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { forgetPhoto, storePhoto, type PhotoKind } from "@/lib/photos";
import { getRecipe } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const KINDS: PhotoKind[] = ["hero", "step"];

/**
 * Uploads a photo and attaches it to a recipe or one of its steps.
 *
 * A route handler rather than a server action because it carries a file, and
 * because the browser's own multipart encoding is the least fiddly way to move
 * one. Authorship is checked here, not in the client: the id of the thing being
 * decorated arrives from the page and is therefore not to be trusted.
 */
export async function POST(request: Request) {
  const session = await requireUser();
  if (!session.ok) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "") as PhotoKind;
  const recipeId = Number(form.get("recipe_id"));
  const stepId = form.get("step_id") ? Number(form.get("step_id")) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file." }, { status: 400 });
  }
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  }

  const recipe = await getRecipe(recipeId, session.user.id);
  if (!recipe || recipe.author_id !== session.user.id) {
    return NextResponse.json({ error: "Not your recipe." }, { status: 404 });
  }

  const stored = await storePhoto(file, kind, `recipes/${recipeId}`);
  if (!stored.ok || !stored.url) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }

  if (kind === "hero") {
    await forgetPhoto(recipe.photo_url);
    await getDb().execute({
      sql: "UPDATE recipes SET photo_url = ? WHERE id = ? AND author_id = ?",
      args: [stored.url, recipeId, session.user.id],
    });
  } else {
    const step = recipe.steps.find((candidate) => candidate.id === stepId);
    if (!step) return NextResponse.json({ error: "No such step." }, { status: 404 });

    await forgetPhoto(step.photo_url);
    await getDb().execute({
      sql: "UPDATE recipe_steps SET photo_url = ? WHERE id = ? AND recipe_id = ?",
      args: [stored.url, stepId, recipeId],
    });
  }

  return NextResponse.json({ url: stored.url });
}

/** Removes a photo. The row is cleared first; the blob goes after, quietly. */
export async function DELETE(request: Request) {
  const session = await requireUser();
  if (!session.ok) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const recipeId = Number(searchParams.get("recipe_id"));
  const stepId = searchParams.get("step_id") ? Number(searchParams.get("step_id")) : null;

  const recipe = await getRecipe(recipeId, session.user.id);
  if (!recipe || recipe.author_id !== session.user.id) {
    return NextResponse.json({ error: "Not your recipe." }, { status: 404 });
  }

  if (stepId === null) {
    await getDb().execute({
      sql: "UPDATE recipes SET photo_url = NULL WHERE id = ? AND author_id = ?",
      args: [recipeId, session.user.id],
    });
    await forgetPhoto(recipe.photo_url);
  } else {
    const step = recipe.steps.find((candidate) => candidate.id === stepId);
    if (!step) return NextResponse.json({ error: "No such step." }, { status: 404 });

    await getDb().execute({
      sql: "UPDATE recipe_steps SET photo_url = NULL WHERE id = ? AND recipe_id = ?",
      args: [stepId, recipeId],
    });
    await forgetPhoto(step.photo_url);
  }

  return new NextResponse(null, { status: 204 });
}

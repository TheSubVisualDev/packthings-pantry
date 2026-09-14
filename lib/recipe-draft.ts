import type { RecipeDraft } from "@/components/recipe-editor";
import type { RecipeWithIngredients } from "./types";
import { writeQuantity } from "./units";

/**
 * A recipe opens in the editor with one empty line of each, ready to type into.
 *
 * `servings` is what onboarding asked for - "usually cooking for" - and this is
 * the one place it belongs. It used to be applied to every recipe page instead,
 * where it overruled what the recipe said about itself and made a sixteen-piece
 * tray of flapjacks open as two. A number YOU are about to type is a sensible
 * thing to guess at; one somebody else already typed is not.
 */
export function emptyDraft(servings?: number | null): RecipeDraft {
  return {
    name: "",
    description: "",
    base_servings: String(servings && servings > 0 ? servings : 4),
    prep_minutes: "",
    cook_minutes: "",
    source: "",
    notes: "",
    ingredients: [
      {
        item_name: "",
        quantity: "",
        unit: "g",
        pack_size: "",
        pack_unit: "g",
        note: "",
        optional: false,
        section: "",
      },
    ],
    steps: [{ body: "", minutes: "", section: "", uses: [] }],
  };
}

/**
 * An existing recipe as editor state.
 *
 * Numbers become strings because that is what an input holds: an empty
 * "Prep min" box is "", not 0, and turning it back into a number is the
 * document builder's job at save time.
 */
export function draftFromRecipe(recipe: RecipeWithIngredients): RecipeDraft {
  return {
    name: recipe.name,
    description: recipe.description ?? "",
    base_servings: String(recipe.base_servings),
    prep_minutes: recipe.prep_minutes ? String(recipe.prep_minutes) : "",
    cook_minutes: recipe.cook_minutes ? String(recipe.cook_minutes) : "",
    source: recipe.source ?? "",
    notes: recipe.notes ?? "",
    ingredients: recipe.ingredients.map((line) => ({
      item_name: line.item_name,
      // The tilde goes back in the box it was typed into.
      quantity: writeQuantity(line.quantity, line.approx === 1),
      unit: line.unit,
      pack_size: line.pack_size ? String(line.pack_size) : "",
      pack_unit: line.pack_unit ?? "g",
      note: line.note ?? "",
      optional: line.optional === 1,
      section: line.section ?? "",
    })),
    steps: recipe.steps.map((step) => ({
      body: step.body,
      minutes: step.minutes ? String(step.minutes) : "",
      section: step.section ?? "",
      // Referenced by name, the same way the document does it.
      uses: step.uses.map((line) => line.item_name),
    })),
  };
}

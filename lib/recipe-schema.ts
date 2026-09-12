import type { Item } from "./types";
import { dimensionOf, UNITS_BY_DIMENSION } from "./units";

/**
 * The recipe document: one JSON shape, used by the Claude endpoint, the paste
 * box and the editor alike.
 *
 * Everything that writes a recipe goes through parseRecipeDocument, so there is
 * exactly one definition of what a valid recipe is. The endpoint hands the
 * schema below to callers rather than making them guess, which is the whole
 * reason a machine can use this at all.
 */

export const RECIPE_SCHEMA_VERSION = 1;

/** Hard stop: the document is not a recipe. */
export interface RecipeProblem {
  path: string;
  message: string;
}

/** Accepted, but the human should look. */
/**
 * Why a line wants a second look, which is not always a complaint.
 *
 * `not-stocked` is the normal state of a recipe you have not shopped for yet -
 * writing one down before you own any of it is a thing people do, and the app
 * should not treat it as a mistake to be cleared. It stays in the API response
 * because a machine caller is guessing at names and genuinely needs telling,
 * but no screen renders it as a problem.
 *
 * `unit-mismatch` is a real one: a tablespoon against a gram-canonical item
 * cannot be decremented, and finding that out mid-cook is the worst time.
 * `unknown-reference` is a real one too - a step naming an ingredient the
 * recipe does not list is a typo somebody wants to hear about.
 */
export type WarningKind = "not-stocked" | "unit-mismatch" | "unknown-reference";

export interface RecipeWarning extends RecipeProblem {
  kind: WarningKind;
}

export interface ParsedIngredient {
  /** Resolved against items.name; null when the pantry has no such thing. */
  item_id: number | null;
  item_name: string;
  quantity: number;
  unit: string;
  /** "1 tin (400 g)": what one `unit` amounts to, for package units. */
  pack_size: number | null;
  pack_unit: string | null;
  note: string | null;
  optional: boolean;
  section: string | null;
  position: number;
}

export interface ParsedStep {
  position: number;
  section: string | null;
  body: string;
  minutes: number | null;
  /** Indexes into the ingredients array, not ids: nothing is written yet. */
  uses: number[];
}

export interface ParsedRecipe {
  name: string;
  description: string | null;
  base_servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source: string | null;
  notes: string | null;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
}

export interface ParseResult {
  ok: boolean;
  problems: RecipeProblem[];
  warnings: RecipeWarning[];
  recipe?: ParsedRecipe;
}

const MAX_INGREDIENTS = 60;
const MAX_STEPS = 60;

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPositiveInt(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return null;
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

/**
 * Validates a recipe document and resolves its ingredients against stock.
 *
 * Two kinds of finding, kept apart on purpose. A problem means the document
 * isn't a recipe and nothing is written - a missing name, a unit that doesn't
 * exist. A warning means it is a recipe but something wants a human eye: an
 * ingredient the pantry has never heard of, or a line measured in a dimension
 * the matching item can't be decremented in. Refusing those outright would
 * make the importer useless for anything you haven't bought yet.
 */
export function parseRecipeDocument(input: unknown, items: Item[]): ParseResult {
  const problems: RecipeProblem[] = [];
  const warnings: RecipeWarning[] = [];

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      problems: [{ path: "", message: "Expected a JSON object." }],
      warnings,
    };
  }

  const document = input as Record<string, unknown>;

  const name = asTrimmedString(document.name);
  if (!name) problems.push({ path: "name", message: "A recipe needs a name." });
  else if (name.length > 120) {
    problems.push({ path: "name", message: "Name is longer than 120 characters." });
  }

  const baseServings = asPositiveInt(document.base_servings);
  if (baseServings === null) {
    problems.push({
      path: "base_servings",
      message: "base_servings must be a whole number of servings, 1 or more.",
    });
  } else if (baseServings > 100) {
    problems.push({ path: "base_servings", message: "base_servings is above 100." });
  }

  const byName = new Map(items.map((item) => [item.name.toLowerCase(), item]));

  // Ingredients
  const rawIngredients = document.ingredients;
  const ingredients: ParsedIngredient[] = [];

  if (!Array.isArray(rawIngredients) || rawIngredients.length === 0) {
    problems.push({
      path: "ingredients",
      message: "ingredients must be a non-empty array.",
    });
  } else if (rawIngredients.length > MAX_INGREDIENTS) {
    problems.push({
      path: "ingredients",
      message: `More than ${MAX_INGREDIENTS} ingredients.`,
    });
  } else {
    rawIngredients.forEach((raw, index) => {
      const path = `ingredients[${index}]`;
      if (typeof raw !== "object" || raw === null) {
        problems.push({ path, message: "Expected an object." });
        return;
      }

      const line = raw as Record<string, unknown>;
      const itemName = asTrimmedString(line.item_name);
      if (!itemName) {
        problems.push({ path: `${path}.item_name`, message: "Missing item_name." });
        return;
      }

      const quantity =
        typeof line.quantity === "string" ? Number(line.quantity) : line.quantity;
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
        problems.push({
          path: `${path}.quantity`,
          message: "quantity must be a number greater than zero.",
        });
        return;
      }

      const unit = asTrimmedString(line.unit)?.toLowerCase();
      if (!unit) {
        problems.push({ path: `${path}.unit`, message: "Missing unit." });
        return;
      }

      const dimension = dimensionOf(unit);
      if (!dimension) {
        problems.push({
          path: `${path}.unit`,
          message: `"${unit}" is not a unit this pantry uses. Legal units: ${legalUnits().join(", ")}.`,
        });
        return;
      }

      // A package size, when the unit is a container rather than a measure.
      // Accepted only as a pair: a size with no unit means nothing, and a unit
      // with no size is just noise.
      const rawPackSize =
        typeof line.pack_size === "string" ? Number(line.pack_size) : line.pack_size;
      const packUnit = asTrimmedString(line.pack_unit)?.toLowerCase() ?? null;

      let packSize: number | null = null;
      if (rawPackSize !== undefined && rawPackSize !== null) {
        if (typeof rawPackSize !== "number" || !Number.isFinite(rawPackSize) || rawPackSize <= 0) {
          problems.push({
            path: `${path}.pack_size`,
            message: "pack_size must be a number greater than zero.",
          });
          return;
        }
        if (!packUnit || !dimensionOf(packUnit)) {
          problems.push({
            path: `${path}.pack_unit`,
            message: `pack_size needs a pack_unit this pantry uses. Legal units: ${legalUnits().join(", ")}.`,
          });
          return;
        }
        packSize = rawPackSize;
      }

      const item = byName.get(itemName.toLowerCase()) ?? null;

      if (!item) {
        warnings.push({
          kind: "not-stocked",
          path: `${path}.item_name`,
          // Stated flatly. This is information about the cupboard, not a fault
          // in the recipe, and the wording should not suggest otherwise.
          message: `"${itemName}" isn't in this kitchen yet.`,
        });
      } else if (
        item.dimension !== dimension &&
        !(packSize && packUnit && dimensionOf(packUnit) === item.dimension)
      ) {
        // Caught here rather than at the stove: a tablespoon against a
        // gram-canonical item can't be decremented, and finding that out
        // mid-cook is the worst time to find it out. A package size that does
        // reach the item's dimension rescues the line, which is the whole point
        // of "1 tin (400 g)" against a pantry that weighs tomatoes.
        warnings.push({
          kind: "unit-mismatch",
          path: `${path}.unit`,
          message: `"${itemName}" is measured in ${item.canonical_unit}, so ${unit} can't be taken out of stock when you cook this.`,
        });
      }

      ingredients.push({
        item_id: item?.id ?? null,
        item_name: itemName,
        quantity,
        unit,
        pack_size: packSize,
        pack_unit: packSize ? packUnit : null,
        note: asTrimmedString(line.note),
        optional: line.optional === true,
        section: asTrimmedString(line.section),
        position: ingredients.length,
      });
    });
  }

  // Steps. A recipe without them is still a recipe - a shopping-list entry
  // with quantities is useful on its own - so an absent array is not an error.
  const rawSteps = document.steps;
  const steps: ParsedStep[] = [];

  if (rawSteps !== undefined && !Array.isArray(rawSteps)) {
    problems.push({ path: "steps", message: "steps must be an array." });
  } else if (Array.isArray(rawSteps)) {
    if (rawSteps.length > MAX_STEPS) {
      problems.push({ path: "steps", message: `More than ${MAX_STEPS} steps.` });
    } else {
      rawSteps.forEach((raw, index) => {
        const path = `steps[${index}]`;

        // A plain string is allowed: it's the shape people reach for first.
        const step: Record<string, unknown> =
          typeof raw === "string" ? { body: raw } : (raw as Record<string, unknown>);

        if (typeof step !== "object" || step === null) {
          problems.push({ path, message: "Expected an object or a string." });
          return;
        }

        const body = asTrimmedString(step.body);
        if (!body) {
          problems.push({ path: `${path}.body`, message: "Step has no text." });
          return;
        }

        const minutesRaw = step.minutes;
        let minutes: number | null = null;
        if (minutesRaw !== undefined && minutesRaw !== null) {
          const parsed = asPositiveInt(minutesRaw);
          if (parsed === null) {
            problems.push({
              path: `${path}.minutes`,
              message: "minutes must be a whole number of minutes, or omitted.",
            });
            return;
          }
          minutes = parsed;
        }

        // `uses` names ingredients rather than indexing them, because a name is
        // what the writer has in front of them and an index is a thing to get
        // wrong. Unknown names are dropped with a warning, not refused.
        const uses: number[] = [];
        if (Array.isArray(step.uses)) {
          for (const reference of step.uses) {
            const wanted = asTrimmedString(reference)?.toLowerCase();
            if (!wanted) continue;

            const found = ingredients.findIndex(
              (ingredient) => ingredient.item_name.toLowerCase() === wanted,
            );
            if (found === -1) {
              warnings.push({
                kind: "unknown-reference",
                path: `${path}.uses`,
                message: `Step mentions "${reference}", which isn't one of this recipe's ingredients.`,
              });
              continue;
            }
            if (!uses.includes(found)) uses.push(found);
          }
        }

        steps.push({
          position: steps.length,
          section: asTrimmedString(step.section),
          body,
          minutes,
          uses,
        });
      });
    }
  }

  if (problems.length > 0) return { ok: false, problems, warnings };

  return {
    ok: true,
    problems,
    warnings,
    recipe: {
      name: name!,
      description: asTrimmedString(document.description),
      base_servings: baseServings!,
      prep_minutes: asPositiveInt(document.prep_minutes),
      cook_minutes: asPositiveInt(document.cook_minutes),
      source: asTrimmedString(document.source),
      notes: asTrimmedString(document.notes),
      ingredients,
      steps,
    },
  };
}

/** Every unit a recipe line may use, flat. */
export function legalUnits(): string[] {
  return Object.values(UNITS_BY_DIMENSION).flat();
}

/**
 * The contract, served alongside the pantry so a caller is told what it may
 * send instead of inferring it from examples. Hand-written rather than
 * generated: it is the documentation as much as the validation.
 */
export function recipeJsonSchema() {
  return {
    version: RECIPE_SCHEMA_VERSION,
    type: "object",
    required: ["name", "base_servings", "ingredients"],
    properties: {
      name: { type: "string", maxLength: 120 },
      description: { type: "string", description: "A line or two about the dish." },
      base_servings: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description:
          "How many people the quantities below serve. Cooking scales from this; the stored quantities never change.",
      },
      prep_minutes: { type: "integer", minimum: 1 },
      cook_minutes: { type: "integer", minimum: 1 },
      source: { type: "string", description: "A URL, a book, a person, or \"Claude\"." },
      notes: { type: "string", description: "Anything worth remembering next time." },
      ingredients: {
        type: "array",
        minItems: 1,
        maxItems: MAX_INGREDIENTS,
        items: {
          type: "object",
          required: ["item_name", "quantity", "unit"],
          properties: {
            item_name: {
              type: "string",
              description:
                "Matched against pantry item names, case-insensitively. A name the pantry doesn't have is accepted with a warning, not rejected.",
            },
            quantity: { type: "number", exclusiveMinimum: 0 },
            unit: {
              type: "string",
              enum: legalUnits(),
              description:
                "Must be one of these. Conversion only happens within a dimension - grams never become millilitres.",
            },
            pack_size: {
              type: "number",
              exclusiveMinimum: 0,
              description:
                "What one of `unit` amounts to, when the unit is a package: 1 tin is 400 g. Lets the line work against a pantry that weighs the contents as well as one that counts tins.",
            },
            pack_unit: {
              type: "string",
              enum: legalUnits(),
              description: "The unit pack_size is measured in. Required if pack_size is given.",
            },
            note: { type: "string", description: "\"finely chopped\", \"at room temperature\"." },
            optional: { type: "boolean", default: false },
            section: { type: "string", description: "\"For the sauce\"." },
          },
        },
      },
      steps: {
        type: "array",
        maxItems: MAX_STEPS,
        description: "The method, in order. Omit it and the recipe is still valid.",
        items: {
          oneOf: [
            { type: "string" },
            {
              type: "object",
              required: ["body"],
              properties: {
                body: { type: "string" },
                minutes: {
                  type: "integer",
                  minimum: 1,
                  description: "Unattended time this step takes, so it can offer a timer.",
                },
                section: { type: "string", description: "\"Prep\", \"The stew\"." },
                uses: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "item_name values from this recipe's ingredients, so the step can show what it needs.",
                },
              },
            },
          ],
        },
      },
    },
  };
}

import { NextResponse } from "next/server";
import {
  browseRecipes,
  getCookbookRecipes,
  getMyRecipes,
  getRecipe,
} from "@/lib/queries";
import { getList } from "@/lib/shopping";
import { parseRecipeDocument, recipeJsonSchema, legalUnits } from "@/lib/recipe-schema";
import { saveRecipe } from "@/lib/recipe-store";
import { currentKitchenFor } from "@/lib/kitchens";
import { getUserByApiToken, type User } from "@/lib/users";
import type { KitchenMembership } from "@/lib/kitchens";

export const dynamic = "force-dynamic";

/**
 * The pantry as a remote MCP server, so the Claude apps can use it directly.
 *
 * The REST API underneath this was built on the assumption that a Claude
 * session could make authenticated HTTP calls. It can't - the apps have no
 * such tool - so the endpoints were only ever reachable from a terminal. MCP is
 * the interface those apps actually speak: Claude gets real tools rather than
 * instructions for calls it cannot make.
 *
 * The token is in the URL because claude.ai custom connectors can be added by
 * URL alone, with OAuth optional. That makes the connector URL itself the
 * credential - treat it like a password, and rotating the key in settings
 * invalidates it. It is deliberately the same key as the REST API's, so there
 * is one thing to revoke rather than two.
 *
 * Stateless JSON-RPC over POST: every request carries everything it needs, so
 * there is no session to keep, expire, or lose.
 */

const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED = new Set([PROTOCOL_VERSION, "2025-03-26", "2024-11-05"]);

interface Rpc {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function result(id: Rpc["id"], value: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result: value });
}

function failure(id: Rpc["id"], code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

/** Tool results are text; JSON is the most useful text for a model to read. */
function text(value: unknown) {
  return {
    content: [
      { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
    ],
  };
}

function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

const TOOLS = [
  /**
   * Still called get_pantry, because connectors already added in somebody's
   * Claude call it by that name and renaming it would break them silently.
   *
   * What it returns changed with v2 (18 Oct 2026). It was the stock list -
   * every item, its quantity and use-by date - and the app no longer keeps
   * one. The honest replacement is what the kitchen does know: the recipes
   * in its cookbook and what is on the shopping list. The description says
   * so, because a model told "what's in the kitchen" would treat the
   * shopping list as the cupboard.
   */
  {
    name: "get_pantry",
    description:
      "The kitchen's cookbook (the recipes it cooks, with how often) and its open shopping list, plus the units this app accepts. This app does not track what is in the cupboard, so nothing here says what the kitchen has in stock - ask the person if it matters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_recipes",
    description:
      "The recipes this account has written, with how often each has been cooked.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_recipes",
    description:
      "Search recipes this account can see - its own plus anything shared with it - by name, description or ingredient.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_recipe",
    description:
      "One recipe in full: ingredients with quantities and units, and the method step by step.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number", description: "The recipe's id." } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_recipe",
    description:
      "Write a new recipe into the app. Units must be ones it accepts (get_pantry lists them). Returns warnings worth fixing, such as a step naming an ingredient the recipe does not list.",
    inputSchema: recipeJsonSchema(),
  },
] as const;

async function run(
  name: string,
  args: Record<string, unknown>,
  user: User,
  kitchen: KitchenMembership | null,
) {
  switch (name) {
    case "get_pantry": {
      const [cookbook, list] = await Promise.all([
        getCookbookRecipes(kitchen?.id ?? null, user.id),
        // The same list the person sees: the kitchen's, or their own when
        // they have no kitchen.
        getList(kitchen ? { kitchen: kitchen.id } : { owner: user.id }),
      ]);

      return text({
        kitchen: kitchen ? { name: kitchen.name, your_role: kitchen.role } : null,
        stock_tracked: false,
        note: kitchen
          ? "This app does not record what is in the cupboard. The shopping list is what somebody means to buy, not what is there."
          : "This account has no kitchen, so there is no cookbook - only a personal shopping list. Recipes can still be written.",
        cookbook: cookbook.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          times_cooked: recipe.times_cooked,
        })),
        shopping_list: list
          .filter((line) => !line.bought_at)
          .map((line) => ({
            name: line.item_name,
            quantity: line.quantity,
            unit: line.unit,
            for: line.source,
          })),
        legal_units: legalUnits(),
        units_note: "Conversion only happens within a dimension - grams never become millilitres.",
      });
    }

    case "list_recipes": {
      const recipes = await getMyRecipes(user.id);
      return text(
        recipes.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          serves: recipe.base_servings,
          times_cooked: recipe.times_cooked,
        })),
      );
    }

    case "search_recipes": {
      const found = await browseRecipes(user.id, { limit: 20 });
      const needle = String(args.query ?? "").toLowerCase();
      return text(
        found
          .filter(
            (recipe) =>
              recipe.name.toLowerCase().includes(needle) ||
              (recipe.description ?? "").toLowerCase().includes(needle),
          )
          .map((recipe) => ({
            id: recipe.id,
            name: recipe.name,
            by: recipe.author_handle,
            description: recipe.description,
          })),
      );
    }

    case "get_recipe": {
      const recipe = await getRecipe(Number(args.id), user.id);
      if (!recipe) return toolError("No recipe with that id, or it isn't shared with you.");

      return text({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        base_servings: recipe.base_servings,
        prep_minutes: recipe.prep_minutes,
        cook_minutes: recipe.cook_minutes,
        notes: recipe.notes,
        ingredients: recipe.ingredients.map((line) => ({
          item_name: line.item_name,
          quantity: line.quantity,
          unit: line.unit,
          pack_size: line.pack_size,
          pack_unit: line.pack_unit,
          note: line.note,
          optional: line.optional === 1,
          section: line.section,
        })),
        steps: recipe.steps.map((step) => ({
          body: step.body,
          minutes: step.minutes,
          section: step.section,
          uses: step.uses.map((line) => line.item_name),
        })),
      });
    }

    case "create_recipe": {
      const parsed = parseRecipeDocument(args);

      if (!parsed.ok || !parsed.recipe) {
        return toolError(
          `That isn't a valid recipe yet:\n${parsed.problems
            .map((problem) => `- ${problem.path}: ${problem.message}`)
            .join("\n")}`,
        );
      }

      const id = await saveRecipe(parsed.recipe, undefined, user.id);

      return text({
        saved: true,
        id,
        url: `/recipes/${id}`,
        visibility: "private",
        // The kind travels with the message, so a caller can tell one kind of
        // finding from another as more are added.
        warnings: parsed.warnings.map((warning) => ({
          kind: warning.kind,
          message: warning.message,
        })),
        next: "It's saved privately. The owner can share it from the recipe page.",
      });
    }

    default:
      return toolError(`No tool called ${name}.`);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getUserByApiToken((await params).token);
  if (!user) return failure(null, -32001, "That connector link isn't valid.");

  let rpc: Rpc;
  try {
    rpc = await request.json();
  } catch {
    return failure(null, -32700, "Parse error");
  }

  // Notifications have no id and expect no reply.
  if (rpc.id === undefined || rpc.id === null) {
    return new NextResponse(null, { status: 202 });
  }

  switch (rpc.method) {
    case "initialize": {
      const asked = String(rpc.params?.protocolVersion ?? "");
      return result(rpc.id, {
        protocolVersion: SUPPORTED.has(asked) ? asked : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "pantry", version: "1.0.0" },
        instructions:
          "This is someone's recipe book and shopping list. get_pantry shows the kitchen's cookbook and what is on its shopping list; the app does not track what is in the cupboard, so ask before assuming anything is in. Recipes you create are saved privately.",
      });
    }

    case "tools/list":
      return result(rpc.id, { tools: TOOLS });

    case "tools/call": {
      const name = String(rpc.params?.name ?? "");
      const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>;

      try {
        return result(rpc.id, await run(name, args, user, await currentKitchenFor(user.id)));
      } catch (error) {
        return result(
          rpc.id,
          toolError(error instanceof Error ? error.message : "Something went wrong."),
        );
      }
    }

    case "ping":
      return result(rpc.id, {});

    default:
      return failure(rpc.id, -32601, `Unknown method: ${rpc.method}`);
  }
}

/** Some clients probe with GET before connecting. */
export async function GET() {
  return NextResponse.json(
    { error: "This is an MCP endpoint. Add it as a custom connector in Claude." },
    { status: 405 },
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PasteRecipe } from "@/components/paste-recipe";
import { SiteHeader } from "@/components/site-header";
import { getItems } from "@/lib/queries";
import { legalUnits } from "@/lib/recipe-schema";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paste a recipe · Pantry",
};

/**
 * The briefing handed to a Claude that has no connector.
 *
 * It carries the two things that can't be guessed - the units this pantry
 * accepts and what the items are actually called - because those are what a
 * pasted recipe gets rejected for. Everything else is shape.
 */
function briefingFor(items: { name: string; quantity: number; canonical_unit: string }[]) {
  const stock = items.length
    ? items.map((item) => `- ${item.name} (${item.quantity}${item.canonical_unit})`).join("\n")
    : "- (nothing tracked yet)";

  return `I want a recipe written as JSON so I can paste it into my pantry app.

Reply with ONLY the JSON object, no explanation and no code fences.

Shape:
{
  "name": "Recipe name",
  "description": "One line, optional",
  "base_servings": 2,
  "prep_minutes": 10,
  "cook_minutes": 25,
  "source": "Claude",
  "notes": "Anything worth remembering, optional",
  "ingredients": [
    { "item_name": "Firm tofu", "quantity": 400, "unit": "g", "note": "pressed", "optional": false }
  ],
  "steps": [
    { "body": "One action per step, short enough to read next to a hot pan.", "minutes": 5, "uses": ["Firm tofu"] }
  ]
}

Rules:
- "unit" must be one of: ${legalUnits().join(", ")}. Nothing else — no cups, no oz.
- Units only convert within a dimension. Grams never become millilitres.
- "uses" lists item_name values from the ingredients above, so the app can show
  them beside the step.
- Copy item names below verbatim where you mean the thing I already have.

What's in my kitchen:
${stock}
`;
}

export default async function PasteRecipePage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Frecipes%2Fpaste");

  const items = await getItems(context.kitchen?.id ?? null);

  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/recipes"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Recipes
        </Link>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-[-0.02em]">
          Paste a recipe from Claude
        </h1>
        <p className="mt-2 mb-6 text-[15px] leading-relaxed font-medium text-muted-foreground">
          Works in any chat, on any device, with nothing to set up. If you can{" "}
          <Link href="/claude" className="font-bold text-primary underline underline-offset-2">
            add the connector
          </Link>
          , that&apos;s less fiddly — this is the way in when you can&apos;t.
        </p>

        <PasteRecipe briefing={briefingFor(items)} />
      </main>
    </>
  );
}

import { getDb } from "./db";

/**
 * Section names already in use, offered to the editor so a recipe's groups
 * match the ones beside it instead of drifting into "For the sauce", "Sauce"
 * and "the sauce".
 */
export async function getSectionNames(): Promise<string[]> {
  const result = await getDb().execute(`
    SELECT DISTINCT section FROM recipe_ingredients WHERE section IS NOT NULL AND section <> ''
    UNION
    SELECT DISTINCT section FROM recipe_steps WHERE section IS NOT NULL AND section <> ''
    ORDER BY section
  `);
  return (result.rows as unknown as { section: string }[]).map((row) => row.section);
}

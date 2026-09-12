"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { rate, unrate } from "@/lib/products";

export interface RateResult {
  ok: boolean;
  error?: string;
}

/**
 * What you thought of one product.
 *
 * Needs an account rather than a kitchen role: a rating is a person's opinion
 * about a tin, it travels with them between kitchens, and somebody who can
 * only read a pantry can still have eaten the beans.
 *
 * Null takes the rating back, which is a different act from giving it one
 * star and the only way to say "I have no opinion" once you have had one.
 */
export async function rateProduct(
  barcode: string,
  rating: number | null,
): Promise<RateResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const code = barcode.trim();
  if (!code) return { ok: false, error: "Unknown product" };

  if (rating === null) {
    await unrate(code, session.user.id);
  } else {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { ok: false, error: "Rating must be 1-5" };
    }
    await rate(code, session.user.id, rating, null);
  }

  revalidatePath("/pantry");
  return { ok: true };
}

"use client";

import { useState, useTransition } from "react";
import { rateProduct } from "@/app/pantry/product-actions";
import { formatQuantity } from "@/lib/units";
import type { ProductForItem } from "@/lib/products";

/**
 * Which one to buy next time.
 *
 * Every barcode this kitchen has filed under one stock row, with what it is,
 * what it costs you in calories, and what you thought of it. The pantry has
 * held this since phase 3 and never shown it, so "Baked beans" was one line
 * whether you had bought Heinz once or four own-brands over a year.
 *
 * Stars are per person and stored against the barcode, not the row: the tin is
 * the thing two households can compare, and your row is called whatever you
 * call it.
 */
export function ProductPicker({
  products,
  canEdit,
}: {
  products: ProductForItem[];
  canEdit: boolean;
}) {
  const [scores, setScores] = useState<Record<string, number | null>>(
    Object.fromEntries(products.map((product) => [product.barcode, product.yours])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (products.length === 0) return null;

  function score(barcode: string, stars: number) {
    const was = scores[barcode] ?? null;
    // A second tap on the same star takes the rating back, which is a
    // different thing from giving it one.
    const next = was === stars ? null : stars;
    setScores((current) => ({ ...current, [barcode]: next }));
    setError(null);

    startTransition(async () => {
      const result = await rateProduct(barcode, next);
      if (!result.ok) {
        setScores((current) => ({ ...current, [barcode]: was }));
        setError(result.error ?? "Couldn't save that.");
      }
    });
  }

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
        {products.length === 1
          ? "The one you buy"
          : `${products.length} you have bought`}
      </h2>

      <ul className="mt-3 space-y-3">
        {products.map((product) => {
          const yours = scores[product.barcode] ?? null;
          return (
            <li key={product.barcode} className="border-t border-border pt-3 first:border-0 first:pt-0">
              <p className="font-bold break-words">
                {product.brand ?? product.name ?? "Unnamed product"}
              </p>
              <p className="mt-0.5 font-mono text-xs font-semibold text-muted-foreground">
                {[
                  product.barcode,
                  product.pack_size !== null
                    ? `${formatQuantity(product.pack_size)}${product.pack_unit ?? ""}`
                    : null,
                  product.kcal_100 !== null ? `${Math.round(product.kcal_100)} kcal/100` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      disabled={!canEdit || pending}
                      aria-label={`Rate ${product.brand ?? product.name ?? "it"} ${star} out of 5`}
                      onClick={() => score(product.barcode, star)}
                      className={`px-0.5 text-xl leading-none disabled:opacity-60 ${
                        yours !== null && star <= yours ? "text-primary" : "text-border"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                {/* Everyone's, and only when somebody other than you has
                    voted - "★ 4 · 1 vote" next to your own four stars is the
                    app telling you what you just said. */}
                {product.average !== null && product.votes > 1 && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    ★ {product.average} across {product.votes}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      <p className="mt-3 text-xs font-semibold text-muted-foreground">
        Scanning a barcode into this row adds it here. Stars are yours; the
        average is everybody who has ever rated that exact product.
      </p>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ShoppingBasket, Star, X } from "lucide-react";
import { addShop, preferShop, removeShop } from "@/app/pantry/actions";
import { MAX_SHOP_LENGTH } from "@/lib/shops";
import type { Shop } from "@/lib/shops";

/**
 * Where this gets bought, and which of those is the usual place.
 *
 * Deliberately the same controls as tags - chips, a star for the one that
 * counts, an X to remove - because they behave the same way and learning one
 * should teach you the other. What differs is what they are FOR: the starred
 * shop decides which group a line lands in on the shopping list, while every
 * shop here decides whether the line survives a filter for that shop.
 */
export function ItemShops({
  itemId,
  shops,
  preferredShopId,
  suggestions,
  canEdit,
}: {
  itemId: number;
  shops: Shop[];
  preferredShopId: number | null;
  /** Shops this kitchen already buys from, so the names stay consistent. */
  suggestions: string[];
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState(shops);
  const [preferred, setPreferred] = useState(preferredShopId);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const known = new Set(current.map((shop) => shop.name.toLowerCase()));
  const unused = suggestions.filter((name) => !known.has(name.toLowerCase()));

  function add(name: string) {
    const wanted = name.trim();
    if (!wanted || known.has(wanted.toLowerCase())) {
      setDraft("");
      return;
    }
    setError(null);
    setDraft("");

    startTransition(async () => {
      const result = await addShop(itemId, wanted);
      if (!result.ok || !result.shop) {
        setError(result.error ?? "Couldn't save that.");
        return;
      }
      const saved = result.shop;
      setCurrent((list) =>
        list.some((shop) => shop.id === saved.id)
          ? list
          : [...list, { id: saved.id, kitchen_id: 0, name: saved.name }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
      );
      setPreferred((was) => was ?? saved.id);
    });
  }

  function drop(shop: Shop) {
    const was = current;
    const wasPreferred = preferred;
    setCurrent((list) => list.filter((entry) => entry.id !== shop.id));
    if (preferred === shop.id) {
      const next = was.filter((entry) => entry.id !== shop.id)[0];
      setPreferred(next ? next.id : null);
    }
    setError(null);

    startTransition(async () => {
      const result = await removeShop(itemId, shop.id);
      if (!result.ok) {
        setCurrent(was);
        setPreferred(wasPreferred);
        setError(result.error ?? "Couldn't remove that.");
      }
    });
  }

  function prefer(shop: Shop) {
    const was = preferred;
    setPreferred(shop.id);
    setError(null);

    startTransition(async () => {
      const result = await preferShop(itemId, shop.id);
      if (!result.ok) {
        setPreferred(was);
        setError(result.error ?? "Couldn't save that.");
      }
    });
  }

  return (
    <div>
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-label">
        <ShoppingBasket className="h-3.5 w-3.5" strokeWidth={2.5} />
        Bought from
      </h2>

      {current.length === 0 ? (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          Nowhere in particular. Say where and the shopping list will sort itself
          into trips.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {current.map((shop) => {
            const usual = shop.id === preferred;
            return (
              <li
                key={shop.id}
                className={`flex items-center gap-1 rounded-full py-1.5 pr-1.5 pl-3 text-sm font-bold ${
                  usual ? "bg-primary text-primary-foreground" : "bg-chip"
                }`}
              >
                {canEdit && !usual && (
                  <button
                    type="button"
                    onClick={() => prefer(shop)}
                    aria-label={`Usually buy it at ${shop.name}`}
                    title={`Usually buy it at ${shop.name}`}
                    className="-ml-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Star className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                )}
                {usual && (
                  <Star
                    className="-ml-1 h-3.5 w-3.5"
                    fill="currentColor"
                    strokeWidth={2.5}
                    aria-label="Where you usually buy it"
                  />
                )}
                <span>{shop.name}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => drop(shop)}
                    aria-label={`Remove ${shop.name}`}
                    className={`rounded-full p-1 ${
                      usual
                        ? "text-primary-foreground/70 hover:text-primary-foreground"
                        : "text-muted-foreground hover:text-destructive"
                    }`}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={draft}
              maxLength={MAX_SHOP_LENGTH}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add(draft);
                }
              }}
              placeholder="Tesco, the Asian supermarket…"
              aria-label="Add a shop"
              className="min-w-40 flex-1 rounded-[14px] border border-border bg-background px-4 py-2.5 font-semibold outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={draft.trim().length === 0}
              onClick={() => add(draft)}
              className="shrink-0 rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
            >
              Add
            </button>
          </div>

          {unused.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                You also shop at:
              </span>
              {unused.slice(0, 8).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => add(name)}
                  className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import {
  linkBarcode,
  lookupBarcode,
  restockBarcode,
  type ScanMatch,
} from "@/app/pantry/scan/actions";
import { dimensionOf, formatQuantity } from "@/lib/units";
import type { Item } from "@/lib/types";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";
const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

/** Suffix a canonical unit only when it isn't a bare count. */
function withUnit(quantity: number, unit: string | undefined): string {
  return `${formatQuantity(quantity)}${!unit || unit === "count" ? "" : unit}`;
}

export function ScanPanel({ items }: { items: Item[] }) {
  const [match, setMatch] = useState<ScanMatch | null>(null);
  const [manual, setManual] = useState("");
  const [chosenItem, setChosenItem] = useState("");
  const [addPack, setAddPack] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function look(barcode: string) {
    setError(null);
    setNote(null);

    startTransition(async () => {
      const result = await lookupBarcode(barcode);
      if (!result.ok || !result.match) {
        setError(result.error ?? "Lookup failed.");
        return;
      }

      setMatch(result.match);
      // A confident match starts selected so linking is one tap. A weaker one
      // is listed but left unchosen - the whole point is that a person decides.
      const top = result.match.suggestions[0];
      setChosenItem(top?.confident ? String(top.id) : "");
    });
  }

  function reset() {
    setMatch(null);
    setManual("");
    setNote(null);
    setError(null);
  }

  function onRestock(barcode: string) {
    startTransition(async () => {
      const result = await restockBarcode(barcode);
      if (!result.ok) {
        setError(result.error ?? "Couldn't restock.");
        return;
      }
      setNote(
        `Added ${withUnit(result.added ?? 0, result.unit)} — ${withUnit(result.quantity ?? 0, result.unit)} in stock.`,
      );
    });
  }

  function onLink() {
    if (!match) return;

    const itemId = Number(chosenItem);
    if (!itemId) {
      setError("Pick an item to link it to.");
      return;
    }

    startTransition(async () => {
      const result = await linkBarcode(
        match.barcode,
        itemId,
        { name: match.name, brand: match.brand, pack: match.pack },
        addPack && packFits,
      );
      if (!result.ok) {
        setError(result.error ?? "Couldn't link that.");
        return;
      }

      const item = items.find((candidate) => candidate.id === itemId);
      setNote(
        addPack && packFits && item
          ? `Linked to ${item.name}, now ${withUnit(result.quantity ?? 0, item.canonical_unit)}.`
          : `Linked to ${item?.name ?? "that item"}.`,
      );
    });
  }

  if (!match) {
    return (
      <div className="space-y-5">
        <BarcodeScanner onDetected={look} />

        {pending && (
          <p className="text-center text-sm font-bold text-muted-foreground">
            Looking it up…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-bold text-destructive">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="manual" className={LABEL}>
            Or type the number under the bars
          </label>
          <div className="flex gap-2">
            <input
              id="manual"
              type="text"
              inputMode="numeric"
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="5000169005248"
              className={FIELD}
            />
            <button
              type="button"
              onClick={() => look(manual)}
              disabled={pending || manual.trim().length === 0}
              className="shrink-0 rounded-[14px] bg-primary px-5 font-extrabold text-primary-foreground disabled:opacity-40"
            >
              Look up
            </button>
          </div>
        </div>
      </div>
    );
  }

  const packLabel = match.pack
    ? withUnit(match.pack.quantity, match.pack.unit)
    : null;
  const topSuggestion = match.suggestions[0];

  // Whether a pack can actually be added depends on the item chosen: 400g of
  // something can't go onto a row counted in whole loaves. Offering the tick
  // box anyway would just produce a link that half-worked.
  const chosen = items.find((item) => String(item.id) === chosenItem);
  const packDimension = match.pack ? dimensionOf(match.pack.unit) : null;
  const packFits = Boolean(
    packLabel && chosen && packDimension && packDimension === chosen.dimension,
  );

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <p className="font-mono text-xs font-semibold text-muted-foreground">
          {match.barcode}
        </p>
        <h2 className="mt-1 text-lg font-extrabold">
          {match.name ?? "Not in the catalogue"}
        </h2>
        {(match.brand || packLabel) && (
          <p className="text-sm font-semibold text-muted-foreground">
            {[match.brand, packLabel].filter(Boolean).join(" · ")}
          </p>
        )}
        {!match.known && (
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            Open Food Facts has never heard of this one. You can still add it by
            hand.
          </p>
        )}
      </section>

      {note && (
        <p className="rounded-[14px] bg-chip px-4 py-3 text-sm font-bold">{note}</p>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      {match.linked ? (
        <section className={CARD}>
          <h3 className="text-sm font-extrabold">
            Already linked to {match.linked.name}
          </h3>
          <p className="mt-1 text-sm font-semibold text-quantity">
            {withUnit(match.linked.quantity, match.linked.unit)} in stock
          </p>
          <button
            type="button"
            onClick={() => onRestock(match.barcode)}
            disabled={pending}
            className="mt-4 w-full rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Adding…" : "Put one pack in"}
          </button>
        </section>
      ) : (
        <>
          <section className={CARD}>
            <h3 className="text-sm font-extrabold">
              {topSuggestion?.confident
                ? `Looks like your ${topSuggestion.name}`
                : "Link it to something you have"}
            </h3>
            <p className="mt-1 mb-4 text-sm font-semibold text-muted-foreground">
              {topSuggestion?.confident
                ? "Picked out below. Own-brand linguine sometimes deserves its own row, so change it if that's the case."
                : "Own-brand linguine might belong on your generic pasta row, or deserve its own. Nothing in the barcode says which."}
            </p>

            {match.suggestions.length > 0 && (
              <ul className="mb-4 space-y-2">
                {match.suggestions.map((suggestion) => {
                  const selected = chosenItem === String(suggestion.id);
                  return (
                    <li key={suggestion.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setChosenItem(String(suggestion.id))}
                        className={`flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors ${
                          selected
                            ? "border-primary bg-[oklch(0.96_0.02_35)]"
                            : "border-border bg-background"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block font-bold break-words">
                            {suggestion.name}
                          </span>
                          <span className="block text-sm font-semibold text-quantity">
                            {withUnit(suggestion.quantity, suggestion.unit)} in stock
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                            suggestion.confident
                              ? "bg-primary text-primary-foreground"
                              : "bg-chip text-muted-foreground"
                          }`}
                        >
                          {suggestion.confident ? "Close match" : "Maybe"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <label htmlFor="link-item" className={LABEL}>
              {match.suggestions.length > 0 ? "Or something else" : "Item"}
            </label>
            <select
              id="link-item"
              value={chosenItem}
              onChange={(event) => setChosenItem(event.target.value)}
              className={FIELD}
            >
              <option value="">Choose an item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({withUnit(item.quantity, item.canonical_unit)})
                </option>
              ))}
            </select>

            {packFits && (
              <label className="mt-3 flex items-center gap-2.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={addPack}
                  onChange={(event) => setAddPack(event.target.checked)}
                  className="h-4 w-4"
                />
                Put one {packLabel} pack in now
              </label>
            )}
            {packLabel && chosen && !packFits && (
              <p className="mt-3 text-sm font-semibold text-muted-foreground">
                The pack is {packLabel} but {chosen.name} is measured in{" "}
                {chosen.canonical_unit === "count" ? "whole things" : chosen.canonical_unit}
                , so linking won&apos;t change the count.
              </p>
            )}

            <button
              type="button"
              onClick={onLink}
              disabled={pending}
              className="mt-4 w-full rounded-[14px] bg-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
            >
              {pending ? "Linking…" : "Link"}
            </button>
          </section>

          <Link
            href={{
              pathname: "/pantry/add",
              query: {
                barcode: match.barcode,
                name: match.prefill.name,
                quantity: match.prefill.quantity,
                unit: match.prefill.unit,
                category: match.prefill.category,
                location: match.prefill.location,
              },
            }}
            className="block w-full rounded-[14px] bg-ink px-4 py-3.5 text-center text-[15px] font-extrabold text-background"
          >
            Add as a new item
          </Link>
        </>
      )}

      <button
        type="button"
        onClick={reset}
        className="w-full text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Scan another
      </button>
    </div>
  );
}

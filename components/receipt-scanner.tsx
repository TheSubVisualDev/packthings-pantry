"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Camera, Check, CheckCircle2, ImageUp, X } from "lucide-react";
import {
  applyReceipt,
  matchReceipt,
  type ApplyResult,
  type ReceiptMatch,
} from "@/app/pantry/receipt/actions";
import { addItem } from "@/app/pantry/actions";
import { prepareReceipt } from "@/lib/scan-image";
import { UNITS_BY_DIMENSION } from "@/lib/units";

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

/**
 * Photograph a receipt, check what it found, put it away.
 *
 * Built around the fact that OCR is wrong sometimes: confident matches arrive
 * already accepted and can be left alone, while anything the matcher is unsure
 * about sits above them waiting for a tap. Confirming a whole shop should be a
 * glance and one button, and only the doubtful lines should cost attention.
 *
 * Nothing is written until Add. A receipt that read badly is thrown away by
 * starting over, which is the right cost for a bad photo.
 */
export function ReceiptScanner() {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [matches, setMatches] = useState<ReceiptMatch[] | null>(null);
  const [chosen, setChosen] = useState<Record<number, number | null>>({});
  const [done, setDone] = useState<ApplyResult | null>(null);
  // Recognition takes seconds, and the first one on a device downloads the
  // language data. Silence would read as a hang - which is precisely what the
  // server-side version turned out to be.
  const [progress, setProgress] = useState<string | null>(null);
  /**
   * How far along, 0 to 1, or null for the steps that cannot say.
   *
   * Separate from the words rather than parsed back out of them: straightening
   * the photo and matching against the shelves have no percentage, and a bar
   * that invents one for them is a bar that lies twice per scan.
   */
  const [fraction, setFraction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  function read(file: File) {
    setError(null);
    setDone(null);

    startReading(async () => {
      try {
        setProgress("Straightening it out…");
        setFraction(null);
        const canvas = await prepareReceipt(file);

        // Imported here rather than at the top so the recogniser and its
        // WebAssembly are fetched the first time somebody actually scans
        // something, not by everyone who opens the pantry.
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, {
          logger: (message: { status: string; progress: number }) => {
            const percent = Math.round(message.progress * 100);
            if (message.status === "recognizing text") {
              setProgress(`Reading it — ${percent}%`);
              setFraction(message.progress);
            } else if (message.status.includes("loading language")) {
              setProgress(`Getting ready — ${percent}% (first time only)`);
              setFraction(message.progress);
            }
          },
        });

        let text: string;
        try {
          /**
           * A canvas carries no DPI, so Tesseract guesses one - and its
           * guidance is written in terms of 300dpi. Telling it outright costs
           * nothing and removes the guess. It made no measurable difference on
           * the test receipts; it is here so that a strange photo cannot make
           * one.
           */
          await worker.setParameters({ user_defined_dpi: "300" });
          const { data } = await worker.recognize(canvas);
          text = data.text;
        } finally {
          await worker.terminate();
        }

        setProgress("Matching it to your shelves…");
        setFraction(null);
        const result = await matchReceipt(text);
        if (!result.ok || !result.matches) {
          setError(result.error ?? "Couldn't read that.");
          return;
        }
        setMatches(result.matches);
        setChosen(
          Object.fromEntries(
            result.matches.map((match) => [match.index, match.itemId]),
          ),
        );
      } catch (problem) {
        console.error("receipt scan failed", problem);
        setError(
          "Something went wrong reading that. A flatter, brighter photo often works — or try again in a moment.",
        );
      } finally {
        setProgress(null);
        setFraction(null);
      }
    });
  }

  function submit() {
    if (!matches) return;
    const decisions = matches
      .map((match) => ({
        itemId: chosen[match.index],
        count: match.count,
        // The price and the line it was read from travel together, so a
        // surprising figure can be checked against the paper rather than
        // taken on faith.
        pence: match.price,
        raw: match.raw,
      }))
      .filter(
        (decision): decision is {
          itemId: number;
          count: number;
          pence: number | null;
          raw: string;
        } => Number.isInteger(decision.itemId),
      );

    startSaving(async () => {
      const result = await applyReceipt(decisions);
      if (!result.ok) {
        setError(result.error ?? "Couldn't add those.");
        return;
      }
      setDone(result);
      setMatches(null);
    });
  }

  if (done) {
    return (
      <section className={CARD}>
        <h2 className="text-[19px] font-extrabold tracking-[-0.01em]">Put away</h2>
        <ul className="mt-2 space-y-1 text-sm font-semibold text-muted-foreground">
          <li>
            {done.stocked} {done.stocked === 1 ? "thing" : "things"} restocked.
          </li>
          {done.ticked ? <li>{done.ticked} ticked off the shopping list.</li> : null}
          {done.unpackaged && done.unpackaged.length > 0 && (
            <li>
              No pack size on {done.unpackaged.join(", ")}, so there was no amount
              to add. Set one and the next receipt will stock it.
            </li>
          )}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDone(null)}
            className="rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground"
          >
            Another receipt
          </button>
          <Link
            href="/tonight"
            className="rounded-[14px] bg-chip px-5 py-2.5 text-sm font-bold"
          >
            Back to the shelf
          </Link>
        </div>
      </section>
    );
  }

  if (!matches) {
    return (
      <section className={CARD}>
        {/* Two inputs, because `capture` is a demand rather than a hint: with
            it the phone opens the camera and offers no way to reach a photo
            you already took, which is exactly what you want when the receipt
            is in your pocket and exactly wrong when it is in your photos. */}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) read(file);
            event.target.value = "";
          }}
        />
        <input
          ref={library}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) read(file);
            event.target.value = "";
          }}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={reading}
            onClick={() => camera.current?.click()}
            className="flex min-w-44 flex-1 items-center justify-center gap-2.5 rounded-[14px] bg-primary px-4 py-4 text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
          >
            <Camera className="h-5 w-5" strokeWidth={2.5} />
            {reading ? "Working…" : "Photograph one"}
          </button>
          <button
            type="button"
            disabled={reading}
            onClick={() => library.current?.click()}
            className="flex min-w-36 flex-1 items-center justify-center gap-2.5 rounded-[14px] bg-chip px-4 py-4 text-[15px] font-extrabold disabled:opacity-60"
          >
            <ImageUp className="h-5 w-5" strokeWidth={2.5} />
            Upload
          </button>
        </div>
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          Flat, bright, and just the items. Reading happens on this device, so
          nothing leaves it but the words — and the first receipt takes a little
          longer while it gets set up.
        </p>

        {progress && (
          <div className="mt-3">
            <p className="text-sm font-bold text-primary" role="status">
              {progress}
            </p>
            {/*
              A bar as well as the words, because of where this is used: in a
              car park or a kitchen doorway, phone in one hand, holding a
              receipt - and small grey type in daylight is the first thing to
              stop being readable. A shape moving across the screen survives
              conditions the sentence does not.
            */}
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-chip"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              {...(fraction === null
                ? {}
                : { "aria-valuenow": Math.round(fraction * 100) })}
              aria-label={progress}
            >
              <div
                className={`h-full rounded-full bg-primary ${
                  // The steps with no percentage still have to look like work
                  // is happening, so the bar sweeps rather than sitting at a
                  // number it does not know.
                  fraction === null ? "w-1/3 animate-pulse" : "transition-[width] duration-300"
                }`}
                style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
              />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-bold text-destructive">
            {error}
          </p>
        )}
      </section>
    );
  }

  /**
   * A line that had nothing to match, now that it does.
   *
   * The new row is put into that line's options and chosen, so the receipt
   * carries on exactly where it was - which is the whole point: the review
   * screen holds every other line's decision in component state, and sending
   * somebody to /pantry/add to fix one unknown item threw all of them away.
   */
  function created(index: number, item: { id: number; name: string }) {
    setMatches((current) =>
      (current ?? []).map((match) =>
        match.index === index
          ? {
              ...match,
              options: [{ id: item.id, name: item.name, score: 1 }, ...match.options],
            }
          : match,
      ),
    );
    setChosen((current) => ({ ...current, [index]: item.id }));
  }

  const unsure = matches.filter((match) => !match.confident);
  const sure = matches.filter((match) => match.confident);
  const picked = matches.filter((match) => chosen[match.index] != null).length;

  return (
    <div className="space-y-3">
      {/*
        What happened, before what to do about it - board 1l.

        The matcher is right about most of a receipt, and the old screen still
        opened on two lists of equal weight and made you read both to find out
        whether it had gone well. This says the outcome in one line: the number
        that needs you, and the number that does not.
      */}
      <section className={CARD}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" strokeWidth={2.5} />
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold tracking-[-0.01em]">
              {sure.length} matched, ready to go in
            </p>
            <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
              {unsure.length === 0
                ? "Nothing needs a decision."
                : `${unsure.length} ${unsure.length === 1 ? "line needs" : "lines need"} a quick look.`}
            </p>
          </div>
        </div>
      </section>

      {unsure.length > 0 && (
        <section className={CARD}>
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
            Needs a look
          </h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Nothing on your shelves clearly matches these.
          </p>
          <ul className="mt-3 space-y-3">
            {unsure.map((match) => (
              <Row
                key={match.index}
                match={match}
                chosenId={chosen[match.index] ?? null}
                onChoose={(id) =>
                  setChosen((current) => ({ ...current, [match.index]: id }))
                }
                onCreated={created}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Folded, because they are already accepted: a list of things the app
          got right is a list nobody needs to read, and putting it on screen at
          the same weight as the questions is what made a good scan look like
          twenty decisions. */}
      {sure.length > 0 && (
        <section className={CARD}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-label">
                {sure.length} matched
              </span>
              <span className="text-sm font-bold text-muted-foreground">
                <span className="group-open:hidden">review if you like</span>
                <span className="hidden group-open:inline">hide</span>
              </span>
            </summary>
            <ul className="mt-3 space-y-3">
              {sure.map((match) => (
                <Row
                  key={match.index}
                  match={match}
                  chosenId={chosen[match.index] ?? null}
                  onChoose={(id) =>
                    setChosen((current) => ({ ...current, [match.index]: id }))
                  }
                  onCreated={created}
                />
              ))}
            </ul>
          </details>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={saving || picked === 0}
          onClick={submit}
          className="min-h-14 w-full rounded-[14px] bg-primary px-5 text-[15px] font-extrabold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Adding…" : `Add ${picked} to stock`}
        </button>
        <button
          type="button"
          onClick={() => {
            setMatches(null);
            setError(null);
          }}
          className="text-sm font-semibold text-muted-foreground underline underline-offset-2"
        >
          Start over
        </button>
      </div>
    </div>
  );
}

/**
 * One receipt line and what it might be.
 *
 * The receipt's own wording stays visible under the choice, because the whole
 * question here is "did it read that right" - and a row that shows only the
 * pantry name it matched gives you no way to answer.
 */
function Row({
  match,
  chosenId,
  onChoose,
  onCreated,
}: {
  match: ReceiptMatch;
  chosenId: number | null;
  onChoose: (id: number | null) => void;
  /** Called with a row this line has just created, to match it against. */
  onCreated: (index: number, item: { id: number; name: string }) => void;
}) {
  /**
   * Making the missing item here rather than sending somebody to the add form.
   *
   * Three fields, because the rest of what the add form asks - tags, shops,
   * packaging, dates - is not what somebody is doing at this moment. They are
   * standing over a carrier bag confirming a shop, and the row can be filled
   * in properly later from the item's own page. It posts to the same `addItem`
   * the form posts to, so what a valid item is stays written down once.
   */
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState(match.name);
  const [newAmount, setNewAmount] = useState(String(match.count || 1));
  const [newUnit, setNewUnit] = useState("count");
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  return (
    <li className="border-t border-border pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 font-bold break-words">
          {match.count > 1 && (
            <span className="mr-1.5 text-muted-foreground">{match.count} ×</span>
          )}
          {match.name}
        </span>
        {match.price !== null && (
          <span className="shrink-0 font-mono text-sm font-semibold text-muted-foreground tabular-nums">
            £{(match.price / 100).toFixed(2)}
          </span>
        )}
      </div>

      {/* What the paper actually said, in mono, under the tidied-up name. The
          comment above this component has claimed for a while that it was
          here, and it was not: the question on this screen is "did it read
          that right", and the only evidence is the line it read. */}
      {match.raw && match.raw.toLowerCase() !== match.name.toLowerCase() && (
        <p className="mt-0.5 font-mono text-[11px] font-semibold break-words text-quantity">
          {match.raw}
        </p>
      )}

      {match.options.length === 0 ? (
        adding ? (
          <div className="mt-2 space-y-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={80}
              aria-label="What to call it"
              className="w-full rounded-[12px] border border-border bg-page px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
            />
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={newAmount}
                onChange={(event) => setNewAmount(event.target.value)}
                aria-label={`How much ${newName}`}
                className="w-24 rounded-[12px] border border-border bg-page px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
              <select
                value={newUnit}
                onChange={(event) => setNewUnit(event.target.value)}
                aria-label="Unit"
                className="rounded-[12px] border border-border bg-page px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              >
                {Object.values(UNITS_BY_DIMENSION)
                  .flat()
                  .map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={() => {
                  setFailed(null);
                  startSaving(async () => {
                    const form = new FormData();
                    form.set("name", newName.trim());
                    form.set("quantity", newAmount || "0");
                    form.set("unit", newUnit);
                    // Answer rather than redirect: a redirect here would
                    // unmount the receipt, which is the bug being fixed.
                    form.set("again", "1");

                    const result = await addItem({}, form);
                    if (!result.addedId) {
                      setFailed(result.error ?? "Couldn't add that.");
                      return;
                    }
                    onCreated(match.index, {
                      id: result.addedId,
                      name: newName.trim(),
                    });
                    setAdding(false);
                  });
                }}
                className="rounded-[12px] bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-40"
              >
                {saving ? "Adding…" : "Add to shelves"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setFailed(null);
                }}
                className="rounded-[12px] px-3 py-2 text-xs font-bold text-muted-foreground"
              >
                Cancel
              </button>
            </div>
            {failed && (
              <p role="alert" className="text-xs font-bold text-destructive">
                {failed}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
            Not on your shelves.{" "}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="font-bold text-primary underline underline-offset-2"
            >
              Add it
            </button>
          </p>
        )
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {match.options.map((option) => {
            const active = chosenId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChoose(active ? null : option.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                  active ? "bg-primary text-primary-foreground" : "bg-chip"
                }`}
              >
                {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                {option.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChoose(null)}
            aria-label={`Skip ${match.name}`}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              chosenId === null ? "bg-ink text-background" : "text-muted-foreground"
            }`}
          >
            <X className="h-3.5 w-3.5" strokeWidth={3} />
            Skip
          </button>
        </div>
      )}
    </li>
  );
}

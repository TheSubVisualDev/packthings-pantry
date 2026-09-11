"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Camera, Check, ImageUp, X } from "lucide-react";
import {
  applyReceipt,
  matchReceipt,
  type ApplyResult,
  type ReceiptMatch,
} from "@/app/pantry/receipt/actions";
import { prepareReceipt } from "@/lib/scan-image";

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
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  function read(file: File) {
    setError(null);
    setDone(null);

    startReading(async () => {
      try {
        setProgress("Straightening it out…");
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
            } else if (message.status.includes("loading language")) {
              setProgress(`Getting ready — ${percent}% (first time only)`);
            }
          },
        });

        let text: string;
        try {
          const { data } = await worker.recognize(canvas);
          text = data.text;
        } finally {
          await worker.terminate();
        }

        setProgress("Matching it to your shelves…");
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
      }
    });
  }

  function submit() {
    if (!matches) return;
    const decisions = matches
      .map((match) => ({ itemId: chosen[match.index], count: match.count }))
      .filter((decision): decision is { itemId: number; count: number } =>
        Number.isInteger(decision.itemId),
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
            href="/pantry"
            className="rounded-[14px] bg-chip px-5 py-2.5 text-sm font-bold"
          >
            Back to stock
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
          <p className="mt-3 text-sm font-bold text-primary" role="status">
            {progress}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-bold text-destructive">
            {error}
          </p>
        )}
      </section>
    );
  }

  const unsure = matches.filter((match) => !match.confident);
  const sure = matches.filter((match) => match.confident);
  const picked = matches.filter((match) => chosen[match.index] != null).length;

  return (
    <div className="space-y-3">
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
              />
            ))}
          </ul>
        </section>
      )}

      {sure.length > 0 && (
        <section className={CARD}>
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-label">
            Ready to go in
          </h2>
          <ul className="mt-3 space-y-3">
            {sure.map((match) => (
              <Row
                key={match.index}
                match={match}
                chosenId={chosen[match.index] ?? null}
                onChoose={(id) =>
                  setChosen((current) => ({ ...current, [match.index]: id }))
                }
              />
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || picked === 0}
          onClick={submit}
          className="rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
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
}: {
  match: ReceiptMatch;
  chosenId: number | null;
  onChoose: (id: number | null) => void;
}) {
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
          <span className="shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">
            £{(match.price / 100).toFixed(2)}
          </span>
        )}
      </div>

      {match.options.length === 0 ? (
        <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
          Not on your shelves.{" "}
          <Link
            href={`/pantry/add?name=${encodeURIComponent(match.name)}`}
            className="font-bold text-primary underline underline-offset-2"
          >
            Add it
          </Link>
        </p>
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

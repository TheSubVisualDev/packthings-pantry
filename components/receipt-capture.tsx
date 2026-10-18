"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Camera, ClipboardPaste, ImageUp, Keyboard, Sparkles } from "lucide-react";
import {
  saveReceiptPhoto,
  saveReceiptText,
  startTypedReceipt,
} from "@/app/receipts/actions";
import { downscale } from "@/lib/downscale";
import { prepareReceipt } from "@/lib/scan-image";

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";
const PRIMARY = "flex items-center justify-center gap-2 rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60";
const SECONDARY = "flex items-center justify-center gap-2 rounded-[14px] bg-chip px-5 py-3 text-sm font-bold disabled:opacity-60";

/**
 * Three ways a receipt gets in: a photo, its text, or typing it.
 *
 * The photo is read on the phone, as it always was (Tesseract cannot run in a
 * serverless function - AGENTS.md). What changed is what happens next: v1
 * matched every line against the shelves and wrote nothing until each was
 * confirmed, because a wrong line was rubbish on a shelf. A wrong line now is
 * a line on a receipt, fixed on the receipt's own page, so the receipt is
 * saved straight away and the checking happens there.
 *
 * When the phone's reading comes back with nothing usable and the deployment
 * has an OpenRouter key, the same photo can be sent to a vision model instead.
 * Offered, never automatic: it costs money, and whether a crumpled receipt is
 * worth a fifth of a penny is the person's call, not the app's.
 */
export function ReceiptCapture({ visionReady }: { visionReady: boolean }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [fraction, setFraction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [busy, start] = useTransition();

  function open(id: number) {
    router.push(`/receipts/${id}`);
  }

  function read(file: File) {
    setError(null);
    setPhoto(file);
    start(async () => {
      try {
        setProgress("Straightening it out…");
        setFraction(null);
        const canvas = await prepareReceipt(file);

        // Fetched the first time somebody scans, not by everyone who opens
        // the app: the recogniser and its language data are megabytes.
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

        let recognised: string;
        try {
          await worker.setParameters({ user_defined_dpi: "300" });
          const { data } = await worker.recognize(canvas);
          recognised = data.text;
        } finally {
          await worker.terminate();
        }

        setProgress("Saving it…");
        setFraction(null);
        const result = await saveReceiptText(recognised);
        if (result.ok && result.id) return open(result.id);
        setError(result.error ?? "Couldn't read that.");
      } catch (problem) {
        console.error("receipt read failed", problem);
        setError("Something went wrong reading that. A flatter, brighter photo often works.");
      } finally {
        setProgress(null);
        setFraction(null);
      }
    });
  }

  function readWithModel() {
    if (!photo) return;
    setError(null);
    start(async () => {
      setProgress("Sending it to be read…");
      try {
        // Taller than the default: a long receipt shrunk to 1600px on its long
        // edge has print too small for anything to read.
        const small = await downscale(photo, 2400);
        const form = new FormData();
        form.set("photo", small);
        const result = await saveReceiptPhoto(form);
        if (result.ok && result.id) return open(result.id);
        setError(result.error ?? "Couldn't read that.");
      } finally {
        setProgress(null);
      }
    });
  }

  function savePasted() {
    setError(null);
    start(async () => {
      const result = await saveReceiptText(text);
      if (result.ok && result.id) return open(result.id);
      setError(result.error ?? "Couldn't read that.");
    });
  }

  function typeIt() {
    setError(null);
    start(async () => {
      const result = await startTypedReceipt();
      if (result.ok && result.id) return open(result.id);
      setError(result.error ?? "Couldn't start one.");
    });
  }

  return (
    <div className="space-y-4">
      <section className={CARD}>
        {/* Two inputs, because `capture` is a demand rather than a hint: with
            it the phone opens the camera and offers no way to reach a photo
            already taken. */}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) read(file);
          }}
        />
        <input
          ref={library}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) read(file);
          }}
        />
        <h2 className="text-[19px] font-extrabold tracking-[-0.01em]">Photograph it</h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Flat, bright, and just the receipt in the frame. The date, shop, card and total are read
          off it too.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={PRIMARY}>
            <Camera className="h-4 w-4" /> Camera
          </button>
          <button type="button" disabled={busy} onClick={() => library.current?.click()} className={SECONDARY}>
            <ImageUp className="h-4 w-4" /> A photo
          </button>
        </div>

        {progress && (
          <div className="mt-4" role="status" aria-live="polite">
            <p className="text-sm font-bold">{progress}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip">
              <div
                className={`h-full rounded-full bg-primary transition-[width] ${fraction === null ? "w-1/3 animate-pulse" : ""}`}
                style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-[14px] bg-chip p-4">
            <p className="text-sm font-bold">{error}</p>
            {photo && visionReady && (
              <button type="button" disabled={busy} onClick={readWithModel} className={`${PRIMARY} mt-3 w-full`}>
                <Sparkles className="h-4 w-4" /> Read it with AI instead
              </button>
            )}
          </div>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-[19px] font-extrabold tracking-[-0.01em]">Or</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => setPasting((now) => !now)} className={SECONDARY}>
            <ClipboardPaste className="h-4 w-4" /> Paste text
          </button>
          <button type="button" disabled={busy} onClick={typeIt} className={SECONDARY}>
            <Keyboard className="h-4 w-4" /> Type it in
          </button>
        </div>
        {pasting && (
          <div className="mt-4">
            <label htmlFor="receipt-text" className="text-sm font-bold">
              The receipt, a line per item with its price at the end
            </label>
            <textarea
              id="receipt-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={"TESCO\nSPAGHETTI 500G   0.75\nDARK SOY SAUCE   2.20\nTOTAL            2.95"}
              className="mt-2 w-full rounded-[14px] border border-border bg-background p-3 font-mono text-sm"
            />
            <button
              type="button"
              disabled={busy || text.trim().length === 0}
              onClick={savePasted}
              className={`${PRIMARY} mt-2 w-full`}
            >
              Read it
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

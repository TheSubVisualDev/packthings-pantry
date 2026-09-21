"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bug, Check, Lightbulb, X } from "lucide-react";
import { submitReport, type FileReportResult } from "@/app/report/actions";
import { downscale } from "@/lib/downscale";

/**
 * Writing in from inside the app.
 *
 * One line is the whole requirement. Everything else on this form is optional,
 * because the alternative to a two-field form is not a better-filled-in form,
 * it is a tester who describes the bug in a chat three days later when nobody
 * can remember which screen it was on.
 *
 * Which screen it was on is filled in automatically, along with the browser.
 * Those are the two fields that answer half of all reports and the two nobody
 * ever thinks to include.
 */
export function ReportForm({ from }: { from: string | null }) {
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  /**
   * The chosen pictures, each with the object URL that shows it.
   *
   * The URL is made once, when the file is picked, and lives exactly as long
   * as the file does. It was derived from `photos` with useMemo and revoked in
   * an effect, which is tidier and wrong: React runs an effect's cleanup on
   * the extra mount it does in development, so every URL was revoked
   * immediately after being created and no preview ever appeared.
   */
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [result, setResult] = useState<FileReportResult | null>(null);
  const [pending, startSending] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  /**
   * Where they came from, read when the form is sent rather than on mount.
   *
   * Both of these are browser-only facts, and pulling them into state on mount
   * means a render whose only job is to record something the submit handler
   * could have read for itself. `from` is the server's answer when a link
   * carried one - "something's wrong here" - and the referrer covers the case
   * where somebody found this page through the menu instead.
   */
  function whereFrom(): string {
    if (from) return from;
    try {
      const url = new URL(document.referrer);
      return url.origin === window.location.origin ? url.pathname + url.search : "";
    } catch {
      // No referrer, or one that will not parse. It tells us nothing either way.
      return "";
    }
  }

  /**
   * Let go of the URLs when the form goes, and only then.
   *
   * A preview left behind holds the whole image in memory for as long as the
   * tab is open. Read through a ref so the cleanup sees what is there when it
   * actually runs rather than what was there when it was written.
   */
  const held = useRef<{ file: File; url: string }[]>([]);
  useEffect(() => {
    held.current = photos;
  }, [photos]);
  useEffect(
    () => () => held.current.forEach(({ url }) => URL.revokeObjectURL(url)),
    [],
  );

  /**
   * Shrinks each picture before it is held, not at submit time.
   *
   * A report with a photo on it used to fail with a 403 and take the words
   * with it: a Next server action refuses any body over 1MB and a phone
   * screenshot is several. Doing it here rather than in `send` means the
   * preview is of what will actually be sent, and the wait happens while
   * somebody is still typing rather than after they press the button.
   */
  const [shrinking, setShrinking] = useState(false);

  async function addPhotos(chosen: FileList | null) {
    if (!chosen) return;

    /**
     * Taken out of the FileList before the picker is reset, and that order is
     * the whole point.
     *
     * A FileList is live: clearing `input.value` empties the very object that
     * was handed to this function, so a reset done first leaves nothing to
     * read and every photo is silently dropped. It happened - the reset moved
     * to the top of the function while fixing the 403, and no bug report
     * carried a picture for three days without anybody seeing an error.
     */
    const chosenFiles = Array.from(chosen);
    if (picker.current) picker.current.value = "";

    setShrinking(true);
    try {
      const added = await Promise.all(
        chosenFiles
          .slice(0, 4)
          .map(async (original) => {
            const file = await downscale(original);
            return { file, url: URL.createObjectURL(file) };
          }),
      );

      setPhotos((current) => {
        const next = [...current, ...added];
        // Anything over the limit never gets shown, so its URL is dead weight.
        for (const spare of next.slice(4)) URL.revokeObjectURL(spare.url);
        return next.slice(0, 4);
      });
    } finally {
      setShrinking(false);
    }
  }

  function dropPhoto(at: number) {
    setPhotos((current) => {
      const going = current[at];
      if (going) URL.revokeObjectURL(going.url);
      return current.filter((_, index) => index !== at);
    });
  }

  function send() {
    setResult(null);
    startSending(async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("title", title);
      form.set("body", body);
      form.set("page", whereFrom());
      form.set("agent", navigator.userAgent);
      for (const { file } of photos) form.append("photos", file);

      const sent = await submitReport(form);
      setResult(sent);
      if (sent.ok) {
        setTitle("");
        setBody("");
        setPhotos([]);
      }
    });
  }

  if (result?.ok) {
    return (
      <div className="rise rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-6 w-6" strokeWidth={3} />
        </div>
        <h2 className="mt-3 text-[17px] font-extrabold">Got it, thank you.</h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          It goes in a queue that gets read. You will not hear back on every
          one, but nothing is thrown away.
        </p>

        {result.photoErrors && result.photoErrors.length > 0 && (
          /* Said afterwards rather than instead. The words were the report and
             they are safely filed; the picture was corroboration. */
          <p className="mt-3 rounded-[12px] bg-chip p-3 text-xs font-semibold text-muted-foreground">
            Your note is saved, but{" "}
            {result.photoErrors.length === 1
              ? "a photo did not upload"
              : `${result.photoErrors.length} photos did not upload`}
            : {result.photoErrors.join(" ")}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setResult(null)}
            className="rounded-[12px] bg-chip px-4 py-2.5 text-sm font-extrabold"
          >
            Write another
          </button>
          <Link
            href={from ?? "/pantry"}
            className="rounded-[12px] bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground"
          >
            Back to it
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            { key: "bug", label: "Something's broken", Icon: Bug },
            { key: "idea", label: "I wish it did", Icon: Lightbulb },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={kind === key}
            onClick={() => setKind(key)}
            // 13px and a floor on the height, because at body size
            // "Something's broken" wrapped to two lines and "I wish it did"
            // did not - so the pair sat at different heights, which is the
            // exact complaint that started this whole round.
            className={`flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] px-2.5 py-3 text-[13px] font-extrabold ${
              kind === key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
        <label
          htmlFor="report-title"
          className="text-xs font-bold tracking-[0.08em] text-label uppercase"
        >
          {kind === "bug" ? "What went wrong" : "What you want"}
        </label>
        <input
          id="report-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder={
            kind === "bug"
              ? "The Save button paints twice when I press it"
              : "A weekly meal planner"
          }
          className="mt-2 w-full rounded-[14px] border border-border bg-page px-4 py-3 font-semibold outline-none focus:border-primary"
        />

        <label
          htmlFor="report-body"
          className="mt-4 block text-xs font-bold tracking-[0.08em] text-label uppercase"
        >
          Anything else <span className="normal-case">(optional)</span>
        </label>
        <textarea
          id="report-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          placeholder="What you were doing, what you expected, what happened instead."
          className="mt-2 w-full rounded-[14px] border border-border bg-page px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary"
        />

        <div className="mt-4">
          <span className="text-xs font-bold tracking-[0.08em] text-label uppercase">
            Pictures <span className="normal-case">(up to 4)</span>
          </span>
          {/* A screenshot IS the report, most of the time. Every useful thing
              the testers sent came with one. */}
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map(({ file, url }, index) => (
              <div
                key={url}
                className="relative h-24 w-20 overflow-hidden rounded-[12px] bg-chip"
              >
                {/*
                  A plain img, not next/image.

                  next/image routes everything through the optimizer, which
                  only accepts the hostnames next.config allows - and a blob:
                  URL is not a hostname at all, so the request failed and the
                  frame stayed empty. There is nothing to optimise here anyway:
                  the file is already on this device.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={file.name}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => dropPhoto(index)}
                  aria-label={`Remove ${file.name}`}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              </div>
            ))}

            {photos.length < 4 && (
              <button
                type="button"
                disabled={shrinking}
                onClick={() => picker.current?.click()}
                className="flex h-24 w-20 items-center justify-center rounded-[12px] border-2 border-dashed border-border text-xs font-bold text-muted-foreground disabled:opacity-50"
              >
                {shrinking ? "…" : "+ Add"}
              </button>
            )}
          </div>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => addPhotos(event.target.files)}
            className="hidden"
          />
        </div>

        {from && (
          <p className="mt-4 text-xs font-semibold text-muted-foreground">
            Sent along with this: you were on{" "}
            <code className="font-[family-name:var(--font-plex-mono)]">{from}</code>,
            and which browser you are using.
          </p>
        )}

        {result && !result.ok && result.error && (
          <p role="alert" className="mt-3 text-sm font-bold text-destructive">
            {result.error}
          </p>
        )}

        <button
          type="button"
          onClick={send}
          disabled={pending || shrinking || title.trim().length === 0}
          className="mt-4 min-w-[112px] rounded-[12px] bg-primary px-5 py-3 text-center text-sm font-extrabold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send it"}
        </button>
      </div>
    </div>
  );
}

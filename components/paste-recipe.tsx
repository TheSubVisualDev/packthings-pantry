"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import {
  readPastedText,
  saveRecipeDocument,
  type ReadPastedResult,
  type SaveRecipeResult,
} from "@/app/recipes/actions";

/**
 * Getting a recipe in by pasting it.
 *
 * There are two kinds of paste and they used to be one. The box only ever
 * accepted JSON, which meant it only worked if you had first persuaded a chat
 * to write some - and a tester asked for the obvious thing instead: paste the
 * wall of text off a website or out of a message, and have the app pick it
 * apart. That is the front door now. The JSON path is still here, because it
 * is exact and the reader is not, but it is the second option rather than the
 * only one.
 *
 * Reading is separated from saving on purpose. Every line the reader produces
 * is a guess, and a guess wants looking at before it becomes a recipe - so it
 * shows what it understood, says what it had to assume, and waits. Both paths
 * end at the same saveRecipeDocument, so a pasted recipe is validated exactly
 * like a typed one.
 */
export function PasteRecipe({ briefing }: { briefing: string }) {
  const router = useRouter();
  const [how, setHow] = useState<"text" | "json">("text");

  const [text, setText] = useState("");
  const [read, setRead] = useState<ReadPastedResult | null>(null);
  const [reading, startReading] = useTransition();

  const [json, setJson] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<SaveRecipeResult | null>(null);
  const [saving, startSaving] = useTransition();

  async function copyBriefing() {
    try {
      await navigator.clipboard.writeText(briefing);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused clipboard access isn't worth an error state - the text is on
      // the page and can be selected by hand.
    }
  }

  function readIt() {
    setRead(null);
    setResult(null);
    startReading(async () => setRead(await readPastedText(text)));
  }

  /**
   * Lands in the editor rather than on the recipe.
   *
   * A read recipe is a draft by definition - the tester who asked for this
   * said so, "there may need to be a few corrections" - and putting it on the
   * page you read a finished recipe on invites nobody to make them.
   */
  function keepIt(document: Record<string, unknown>) {
    setResult(null);
    startSaving(async () => {
      const saved = await saveRecipeDocument(document);
      if (saved.ok && saved.id) {
        router.push(`/recipes/${saved.id}/edit`);
        return;
      }
      setResult(saved);
    });
  }

  function saveJson() {
    setResult(null);
    startSaving(async () => {
      let document: unknown;
      try {
        document = JSON.parse(json);
      } catch {
        setResult({
          ok: false,
          problems: [
            {
              path: "",
              message:
                "That isn't valid JSON. Paste the whole block, from the first { to the last }, without the ``` fences.",
            },
          ],
          warnings: [],
        });
        return;
      }

      const saved = await saveRecipeDocument(document);
      if (saved.ok && saved.id) {
        router.push(`/recipes/${saved.id}`);
        return;
      }
      setResult(saved);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-full bg-chip p-1 text-[13px] font-bold">
        {(["text", "json"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={how === option}
            onClick={() => setHow(option)}
            className={
              how === option
                ? "flex-1 rounded-full bg-card px-3.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "flex-1 rounded-full px-3.5 py-2 text-muted-foreground"
            }
          >
            {option === "text" ? "Written out" : "JSON from Claude"}
          </button>
        ))}
      </div>

      {how === "text" ? (
        <div className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
          <h2 className="text-xs font-bold tracking-[0.08em] text-label uppercase">
            Paste the whole thing
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed font-medium text-muted-foreground">
            Title, ingredients, method — however it was written. Headings help
            but are not needed, and nothing is saved until you have looked at
            what it made of it.
          </p>

          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setRead(null);
            }}
            rows={12}
            placeholder={`Creamy Tomato Tortellini
Serves 4 · Prep 10 mins · Cook 25 mins

Ingredients
2 x 300g packs fresh tortellini
1 large brown onion, diced
Salt and pepper to taste

Method
1. Fry the onion until soft.`}
            aria-label="The recipe, as written"
            className="mt-3 w-full rounded-[14px] border border-border bg-page px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary"
          />

          <button
            type="button"
            onClick={readIt}
            disabled={reading || text.trim().length === 0}
            className="mt-3 min-w-[124px] rounded-[12px] bg-primary px-5 py-2.5 text-center text-sm font-extrabold text-primary-foreground disabled:opacity-40"
          >
            {reading ? "Reading…" : "Read it"}
          </button>

          {read && !read.ok && read.problems.length > 0 && (
            <div role="alert" className="mt-4 rounded-[14px] bg-[oklch(0.96_0.03_40)] p-4">
              <p className="text-sm font-bold text-destructive">
                Couldn&apos;t make a recipe out of that.
              </p>
              <ul className="mt-2 space-y-1 text-sm font-semibold text-[oklch(0.44_0.09_38)]">
                {read.problems.map((problem, index) => (
                  <li key={`${problem.path}-${index}`}>{problem.message}</li>
                ))}
              </ul>
            </div>
          )}

          {read?.ok && read.preview && (
            <div className="mt-4 rounded-[16px] bg-chip p-4">
              <h3 className="text-sm font-extrabold break-words">
                {read.preview.name}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                {read.preview.lines.length}{" "}
                {read.preview.lines.length === 1 ? "ingredient" : "ingredients"}
                {" · "}
                {read.preview.steps}{" "}
                {read.preview.steps === 1 ? "step" : "steps"}
                {" · serves "}
                {read.preview.servings}
              </p>

              <ul className="mt-3 space-y-1 text-sm font-semibold">
                {read.preview.lines.map((line, index) => (
                  <li key={index} className="break-words">
                    {line.amount && (
                      <span className="text-quantity">{line.amount} </span>
                    )}
                    {line.name}
                    {line.note && (
                      <span className="font-medium text-muted-foreground">
                        {" "}
                        &middot; {line.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* What it guessed at, said plainly. A reader that quietly
                  assumed four servings and moved on is a reader nobody can
                  check. */}
              {read.notes.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {read.notes.map((note, index) => (
                    <li
                      key={index}
                      className="flex gap-1.5 text-xs font-semibold text-muted-foreground"
                    >
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              )}

              {read.unread.length > 0 && (
                <div className="mt-3 rounded-[12px] bg-card p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[oklch(0.46_0.1_60)]">
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={3} />
                    Couldn&apos;t place {read.unread.length}{" "}
                    {read.unread.length === 1 ? "line" : "lines"}
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs font-medium text-muted-foreground">
                    {read.unread.map((line, index) => (
                      <li key={index} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => keepIt(read.document!)}
                  disabled={saving}
                  className="min-w-[164px] rounded-[12px] bg-primary px-5 py-2.5 text-center text-sm font-extrabold text-primary-foreground disabled:opacity-40"
                >
                  {saving ? "Adding…" : "Keep it and tidy up"}
                </button>
                <span className="text-xs font-semibold text-muted-foreground">
                  Opens in the editor. Saves private.
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
            <h2 className="text-xs font-bold tracking-[0.08em] text-label uppercase">
              1. Ask Claude
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed font-medium text-muted-foreground">
              Copy this, paste it into a chat, and say what you fancy. It tells
              Claude what&apos;s on your shelves and what shape to write in.
            </p>
            <button
              type="button"
              onClick={copyBriefing}
              className="mt-3 rounded-[12px] bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground"
            >
              {copied ? "Copied" : "Copy the briefing"}
            </button>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-bold text-muted-foreground">
                See what it says
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-[12px] bg-chip p-3 font-[family-name:var(--font-plex-mono)] text-xs leading-relaxed whitespace-pre-wrap">
                {briefing}
              </pre>
            </details>
          </div>

          <div className="rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
            <h2 className="text-xs font-bold tracking-[0.08em] text-label uppercase">
              2. Paste what it wrote
            </h2>
            <textarea
              value={json}
              onChange={(event) => setJson(event.target.value)}
              rows={12}
              spellCheck={false}
              placeholder={'{\n  "name": "…",\n  "ingredients": [ … ],\n  "steps": [ … ]\n}'}
              aria-label="Recipe JSON"
              className="mt-3 w-full rounded-[14px] border border-border bg-page px-4 py-3 font-[family-name:var(--font-plex-mono)] text-sm leading-relaxed outline-none focus:border-primary"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveJson}
                disabled={saving || json.trim().length === 0}
                className="min-w-[92px] rounded-[12px] bg-primary px-5 py-2.5 text-center text-sm font-extrabold text-primary-foreground disabled:opacity-40"
              >
                {saving ? "Adding…" : "Add it"}
              </button>
              <span className="text-sm font-semibold text-muted-foreground">
                Saves private. You can edit it straight after.
              </span>
            </div>
          </div>
        </>
      )}

      {/* One error block for both paths: a save that fails, fails the same way
          whichever box it came from. */}
      {result && !result.ok && (
        <div role="alert" className="rounded-[14px] bg-[oklch(0.96_0.03_40)] p-4">
          <p className="text-sm font-bold text-destructive">
            Not saved —{" "}
            {result.problems.length === 1
              ? "one thing"
              : `${result.problems.length} things`}{" "}
            to fix:
          </p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-[oklch(0.44_0.09_38)]">
            {result.problems.map((problem, index) => (
              <li key={`${problem.path}-${index}`}>
                {problem.path && (
                  <code className="font-[family-name:var(--font-plex-mono)]">
                    {problem.path}
                  </code>
                )}{" "}
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRecipeDocument, type SaveRecipeResult } from "@/app/recipes/actions";

/**
 * Getting a recipe in by pasting it, for when the connector isn't an option.
 *
 * The connector is better when it works, but it needs a Claude that can add
 * one. This path needs nothing: ask for JSON in a chat, paste it here. It goes
 * through the same parse as the editor and the API, so a pasted recipe is
 * validated identically to a typed one - the error messages people see here are
 * the same ones Claude sees over MCP.
 *
 * The briefing is the load-bearing half. Claude can't guess which units this
 * pantry accepts or what the items are called, so the copy button hands it
 * both, and the paste stops failing on "cups".
 */
export function PasteRecipe({ briefing }: { briefing: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<SaveRecipeResult | null>(null);
  const [pending, startTransition] = useTransition();

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

  function save() {
    setResult(null);
    startTransition(async () => {
      let document: unknown;
      try {
        document = JSON.parse(text);
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
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          spellCheck={false}
          placeholder={'{\n  "name": "…",\n  "ingredients": [ … ],\n  "steps": [ … ]\n}'}
          aria-label="Recipe JSON"
          className="mt-3 w-full rounded-[14px] border border-border bg-page px-4 py-3 font-[family-name:var(--font-plex-mono)] text-sm leading-relaxed outline-none focus:border-primary"
        />

        {result && !result.ok && (
          <div role="alert" className="mt-3 rounded-[14px] bg-[oklch(0.96_0.03_40)] p-4">
            <p className="text-sm font-bold text-destructive">
              Not saved — {result.problems.length === 1 ? "one thing" : `${result.problems.length} things`}{" "}
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
            <p className="mt-2 text-sm font-medium text-[oklch(0.44_0.09_38)]">
              Paste those back to Claude and it&apos;ll correct them.
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || text.trim().length === 0}
            className="rounded-[12px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
          >
            {pending ? "Adding…" : "Add it"}
          </button>
          <span className="text-sm font-semibold text-muted-foreground">
            Saves private. You can edit it straight after.
          </span>
        </div>
      </div>
    </div>
  );
}

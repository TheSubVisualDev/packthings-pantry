"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { MAX_TAG_LENGTH, cleanTagName } from "@/lib/tags";

/**
 * Picks several tags before the item exists.
 *
 * Not SoftSelect: that holds one value and replaces it when you choose, which
 * on a comma-separated field meant picking a suggestion wiped what you had
 * already typed, and the suggestion list went empty after the first comma
 * because it was matching against the whole string. Tags are a set, so they get
 * a control that holds a set.
 *
 * Nothing here talks to the server - there is no item to tag yet. The chips are
 * posted as one comma-separated hidden field, which is what addItem reads.
 */
export function TagPicker({
  name,
  options,
  defaultValue = "",
}: {
  name: string;
  /** Tags already used in this kitchen. */
  options: string[];
  /** Comma separated, as a barcode scan arrives with. */
  defaultValue?: string;
}) {
  const [chosen, setChosen] = useState<string[]>(() =>
    [...new Set(defaultValue.split(",").map(cleanTagName).filter(Boolean))],
  );
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLInputElement>(null);

  const taken = new Set(chosen.map((tag) => tag.toLowerCase()));
  const needle = draft.trim().toLowerCase();
  const suggestions = options
    .filter((option) => !taken.has(option.toLowerCase()))
    .filter((option) => !needle || option.toLowerCase().includes(needle))
    .slice(0, 8);

  function add(raw: string) {
    const tag = cleanTagName(raw);
    setDraft("");
    if (!tag || taken.has(tag.toLowerCase())) return;
    setChosen((current) => [...current, tag]);
  }

  function drop(tag: string) {
    setChosen((current) => current.filter((entry) => entry !== tag));
  }

  return (
    <div>
      <input type="hidden" name={name} value={chosen.join(", ")} />

      {chosen.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {chosen.map((tag, index) => (
            <li
              key={tag}
              className={`flex items-center gap-1 rounded-full py-1.5 pr-1.5 pl-3 text-sm font-bold ${
                index === 0 ? "bg-primary text-primary-foreground" : "bg-chip"
              }`}
            >
              {tag}
              <button
                type="button"
                onClick={() => drop(tag)}
                aria-label={`Remove ${tag}`}
                className={`rounded-full p-1 ${
                  index === 0
                    ? "text-primary-foreground/70 hover:text-primary-foreground"
                    : "text-muted-foreground hover:text-destructive"
                }`}
              >
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen.length > 1 && (
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Filed under <strong className="text-foreground">{chosen[0]}</strong> — the
          first one. Remove it to file under another.
        </p>
      )}

      <input
        ref={field}
        value={draft}
        maxLength={MAX_TAG_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        // Comma finishes a tag, matching how the field reads; Enter does too,
        // without submitting the form around it.
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
          }
          if (event.key === "Backspace" && draft === "" && chosen.length > 0) {
            drop(chosen[chosen.length - 1]);
          }
        }}
        onBlur={() => add(draft)}
        placeholder={chosen.length === 0 ? "Asian, sauce, soya…" : "Add another"}
        aria-label="Tags"
        className="w-full rounded-[14px] border border-border bg-background px-4 py-3 font-semibold outline-none focus:border-primary"
      />

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {needle ? "Matching:" : "Used here:"}
          </span>
          {suggestions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                add(option);
                field.current?.focus();
              }}
              className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

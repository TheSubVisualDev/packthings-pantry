"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Search, without a Search button.
 *
 * It had one, in the primary colour, at the same weight as "Cook it" - a
 * quarter of the width of a phone spent on a word the magnifying glass already
 * says, next to the only field on the page. Results arrive as you type now, so
 * there is nothing left to press.
 *
 * Still a plain form and still a query string, so a search is a link you can
 * share and the back button goes back to the unfiltered list. Enter submits
 * immediately for anybody who expects it to.
 */
export function SearchBox({
  basePath,
  placeholder,
}: {
  basePath: string;
  placeholder: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [term, setTerm] = useState(params.get("q") ?? "");

  const go = (value: string) =>
    router.push(value.trim() ? `${basePath}?q=${encodeURIComponent(value.trim())}` : basePath);

  /**
   * Waits for a pause in typing before asking the server.
   *
   * 250ms: long enough that "tomatoes" is one request rather than eight, short
   * enough that it still feels like the list is following you. Skipped
   * entirely when the box already matches the URL, so arriving at a shared
   * search link does not immediately navigate to itself.
   */
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (term.trim() === current.trim()) return;

    const timer = setTimeout(() => go(term), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        go(term);
      }}
      className="relative mb-4"
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.5}
      />
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        // The native clear affordance is suppressed so it cannot sit next to
        // ours; a search field with two crosses in it is a puzzle.
        className="min-h-12 w-full rounded-[14px] border border-border bg-card pr-11 pl-11 font-semibold outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
      />
      {term && (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            router.push(basePath);
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-chip"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </form>
  );
}

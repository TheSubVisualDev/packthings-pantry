"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** Plain form, plain query string - so a search is a link you can share. */
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        router.push(
          term.trim() ? `${basePath}?q=${encodeURIComponent(term.trim())}` : basePath,
        );
      }}
      className="mb-6 flex gap-2"
    >
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="min-w-44 flex-1 rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
      />
      <button
        type="submit"
        className="shrink-0 rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
      >
        Search
      </button>
    </form>
  );
}

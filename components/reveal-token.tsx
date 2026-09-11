"use client";

import { useState } from "react";

/**
 * Shows the API token, masked until asked for, with a copy button.
 *
 * The token reaches the browser because the page it sits on is behind the same
 * auth gate as the rest of the app - anyone who can read it can already read
 * the pantry. Masking is for shoulders and screen shares, not for secrecy from
 * the person looking at it.
 */
export function RevealToken({ token }: { token: string | null }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!token) {
    return (
      <p className="rounded-[14px] bg-[oklch(0.96_0.03_40)] px-4 py-3 text-sm font-bold text-destructive">
        No PANTRY_API_TOKEN is set on this deployment, so the API can&apos;t be
        used yet.
      </p>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(token!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; revealing it still lets them select it.
      setShown(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-[12px] bg-chip px-3 py-2.5 font-[family-name:var(--font-plex-mono)] text-sm font-semibold whitespace-nowrap">
        {shown ? token : "•".repeat(32)}
      </code>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="rounded-[12px] bg-card px-3.5 py-2.5 text-sm font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
      >
        {shown ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        onClick={copy}
        className="rounded-[12px] bg-primary px-3.5 py-2.5 text-sm font-extrabold text-primary-foreground"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

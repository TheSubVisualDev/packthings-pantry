"use client";

import { useActionState, useState, useTransition } from "react";
import { dropInvite, newInvite, type ActionResult } from "@/app/settings/actions";
import type { Invite } from "@/lib/users";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";

/**
 * Issuing and revoking invite links.
 *
 * The full link is shown rather than the bare code, because what you actually
 * want is something to paste into a message.
 */
export function InviteManager({
  invites,
  origin,
}: {
  /** Already filtered to the live ones; expiry is the server's question. */
  invites: Invite[];
  origin: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    newInvite,
    { ok: true },
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [, startDrop] = useTransition();

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(`${origin}/invite/${code}`);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Refused clipboard access; the link is on screen to select by hand.
    }
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          name="note"
          placeholder="Who's it for?"
          aria-label="Who the invite is for"
          className={`${FIELD} min-w-40 flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Making…" : "New invite"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {state.error}
        </p>
      )}

      {invites.length === 0 ? (
        <p className="text-sm font-semibold text-muted-foreground">
          No invites outstanding. They last 14 days and work once.
        </p>
      ) : (
        <ul className="space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.code}
              className="rounded-[14px] border border-border bg-background p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">
                  {invite.note ?? "Unlabelled"}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => copy(invite.code)}
                    className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold"
                  >
                    {copied === invite.code ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startDrop(async () => { await dropInvite(invite.code); })}
                    className="rounded-full px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-destructive"
                  >
                    Revoke
                  </button>
                </div>
              </div>
              <code className="mt-1.5 block overflow-x-auto font-[family-name:var(--font-plex-mono)] text-xs font-semibold whitespace-nowrap text-muted-foreground">
                {origin}/invite/{invite.code}
              </code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

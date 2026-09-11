"use client";

import { useActionState } from "react";
import { changePassword, type ActionResult } from "@/app/settings/actions";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";

export function PasswordChange() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    changePassword,
    { ok: true },
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="current_password" className={LABEL}>
          Current password
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="new_password" className={LABEL}>
          New password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={FIELD}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="text-sm font-bold text-muted-foreground">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-[14px] bg-card px-5 py-3 text-sm font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)] disabled:opacity-60"
      >
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

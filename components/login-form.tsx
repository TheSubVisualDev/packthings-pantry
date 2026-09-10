"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/login/actions";

/**
 * A real form with named fields and autocomplete hints, which is the whole
 * point of it over the browser's native Basic auth dialog: password managers
 * can see these and fill them.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label
          htmlFor="username"
          className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          className="w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[14px] bg-primary px-4 py-4 text-[15px] font-extrabold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

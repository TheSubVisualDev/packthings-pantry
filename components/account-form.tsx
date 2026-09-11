"use client";

import { useActionState } from "react";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";

export interface AccountFormState {
  error?: string;
}

/**
 * Choosing a handle, a name and a password.
 *
 * Shared by first-run setup and invite redemption, which ask for exactly the
 * same three things and differ only in what happens afterwards. The autocomplete
 * hints say "new-password" so a password manager offers to generate one rather
 * than filling in an existing login.
 */
export function AccountForm({
  action,
  hidden,
  submitLabel,
  askDeploymentPassword = false,
}: {
  action: (state: AccountFormState, formData: FormData) => Promise<AccountFormState>;
  /** Extra fields carried through, such as an invite code. */
  hidden?: Record<string, string>;
  submitLabel: string;
  /**
   * First run only. The very first account is what makes this pantry someone's,
   * so it asks for the deployment's own password to prove you're the person who
   * set it up rather than the first stranger to find the URL.
   */
  askDeploymentPassword?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {askDeploymentPassword && (
        <div>
          <label htmlFor="deployment_password" className={LABEL}>
            Pantry password
          </label>
          <input
            id="deployment_password"
            name="deployment_password"
            type="password"
            required
            autoComplete="off"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
            The one from your environment settings, proving this pantry is yours.
            Asked for once, and never again.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="handle" className={LABEL}>
          Handle
        </label>
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold text-muted-foreground">@</span>
          <input
            id="handle"
            name="handle"
            type="text"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            maxLength={24}
            placeholder="luna"
            className={FIELD}
          />
        </div>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
          Lowercase letters, numbers and underscores. This is how people find you.
        </p>
      </div>

      <div>
        <label htmlFor="display_name" className={LABEL}>
          Name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          autoComplete="name"
          maxLength={60}
          placeholder="Luna"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="password" className={LABEL}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={FIELD}
        />
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
          At least 10 characters. There is no reset email — let a password
          manager make one and save it.
        </p>
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
        {pending ? "Creating…" : submitLabel}
      </button>
    </form>
  );
}

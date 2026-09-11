"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { saveProfile, type ActionResult } from "@/app/settings/actions";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";

/** Your picture. Uploaded straight away, like recipe photos. */
function AvatarPicker({ current }: { current: string | null }) {
  const [url, setUrl] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch("/api/avatar", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Upload failed.");
      else setUrl(result.url);
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />

      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-chip">
        {url && <Image src={url} alt="" fill sizes="64px" className="object-cover" />}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-[12px] bg-card px-4 py-2.5 text-sm font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)] disabled:opacity-60"
        >
          {busy ? "Uploading…" : url ? "Replace" : "Add a photo"}
        </button>
        {url && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await fetch("/api/avatar", { method: "DELETE" });
              setUrl(null);
              setBusy(false);
            }}
            className="rounded-[12px] px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:text-destructive"
          >
            Remove
          </button>
        )}
        {error && (
          <p role="alert" className="w-full text-sm font-bold text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function ProfileSettings({
  displayName,
  handle,
  avatarUrl,
}: {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveProfile, {
    ok: true,
  });

  return (
    <div className="space-y-4">
      <AvatarPicker current={avatarUrl} />

      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="display_name" className={LABEL}>
            Name
          </label>
          <input
            id="display_name"
            name="display_name"
            defaultValue={displayName}
            maxLength={60}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="handle" className={LABEL}>
            Handle
          </label>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-muted-foreground">@</span>
            <input
              id="handle"
              name="handle"
              defaultValue={handle}
              maxLength={24}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={FIELD}
            />
          </div>
          <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
            Changing this breaks any link anyone saved to your profile. Recipe
            credits follow you.
          </p>
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
          className="rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useRef, useState } from "react";

/**
 * Picks a photo, uploads it, and shows what's there.
 *
 * Uploading happens immediately rather than on save. A photo isn't part of the
 * recipe document - it's a file that has to get somewhere before it can be
 * referenced - and holding one in the browser until the form is submitted only
 * creates a way to lose it.
 */
export function PhotoPicker({
  recipeId,
  stepId,
  current,
  kind,
  label,
  aspect,
}: {
  recipeId: number;
  stepId?: number;
  current: string | null;
  kind: "hero" | "step";
  label: string;
  /** Tailwind aspect class for the frame, so hero and step differ in shape. */
  aspect: string;
}) {
  const [url, setUrl] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("recipe_id", String(recipeId));
    if (stepId !== undefined) body.set("step_id", String(stepId));

    try {
      const response = await fetch("/api/photo", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Upload failed.");
      else setUrl(result.url);
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const query = new URLSearchParams({ recipe_id: String(recipeId) });
    if (stepId !== undefined) query.set("step_id", String(stepId));

    try {
      await fetch(`/api/photo?${query}`, { method: "DELETE" });
      setUrl(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
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

      {url ? (
        <div className={`relative ${aspect} overflow-hidden rounded-[14px] bg-chip`}>
          <Image src={url} alt="" fill sizes="(max-width: 640px) 100vw, 480px" className="object-cover" />
          <div className="absolute right-2 bottom-2 flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-lg bg-black/50 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={`flex ${aspect} w-full items-center justify-center rounded-[14px] border border-dashed border-border text-sm font-bold text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-60`}
        >
          {busy ? "Uploading…" : label}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs font-bold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

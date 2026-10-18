"use client";

import { useState, useTransition } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { dropCategory, newCategory, saveCategoryName } from "@/app/receipts/settings/actions";

const FIELD =
  "min-h-11 w-full min-w-0 rounded-[14px] border border-border bg-card px-4 text-sm font-semibold outline-none focus:border-primary sm:min-h-9";

/**
 * One category, renamed where it stands.
 *
 * Saved on Enter or on leaving the field, and only when it changed - a rename
 * form with its own Save button per row is ten Save buttons, and tabbing
 * through a list should not write ten identical names back.
 */
function CategoryRow({ id, name, canEdit }: { id: number; name: string; canEdit: boolean }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = value.replace(/\s+/g, " ").trim();
    if (next === name) return;
    if (!next) {
      setValue(name);
      return;
    }
    startTransition(async () => {
      const result = await saveCategoryName(id, next);
      if (!result.ok) {
        setError(result.error ?? "That didn't save.");
        setValue(name);
      } else {
        setError(null);
      }
    });
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        {canEdit ? (
          <input
            value={value}
            aria-label={`Rename ${name}`}
            maxLength={40}
            onChange={(event) => setValue(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") setValue(name);
            }}
            className={`${FIELD} ${pending ? "opacity-60" : ""}`}
          />
        ) : (
          <span className="min-w-0 flex-1 text-sm font-bold">{name}</span>
        )}
      </div>
      {canEdit && (
        <div className="mt-1 flex justify-end">
          <ConfirmDelete
            action={() => dropCategory(id)}
            question={`Delete ${name}? Lines filed under it go back to having no category.`}
          />
        </div>
      )}
      {error && <p className="mt-1 text-sm font-semibold text-destructive">{error}</p>}
    </li>
  );
}

export function CategorySettings({
  categories,
  canEdit,
}: {
  categories: { id: number; name: string }[];
  canEdit: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <ul className="mt-3 divide-y divide-border">
        {categories.map((category) => (
          // Keyed on the name too, so a rename that the server refused resets
          // the field to what is actually stored rather than what was typed.
          <CategoryRow key={`${category.id}:${category.name}`} {...category} canEdit={canEdit} />
        ))}
      </ul>

      {canEdit && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await newCategory(name);
              if (result.ok) {
                setName("");
                setError(null);
              } else {
                setError(result.error ?? "That didn't save.");
              }
            });
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="A new category"
            aria-label="New category"
            maxLength={40}
            className={FIELD}
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="shrink-0 rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
          >
            Add
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>}
    </>
  );
}

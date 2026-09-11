"use client";

import { useActionState, useTransition } from "react";
import {
  invite,
  leaveKitchen,
  removePerson,
  rename,
  saveLocations,
  type KitchenResult,
} from "@/app/kitchens/actions";
import type { KitchenMembership, Member } from "@/lib/kitchens";

const FIELD =
  "w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-label";
const BUTTON =
  "rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60";

function Feedback({ state }: { state: KitchenResult }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm font-bold text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return <p className="mt-2 text-sm font-bold text-muted-foreground">{state.message}</p>;
  }
  return null;
}

export function RenameKitchen({ name }: { name: string }) {
  const [state, action, pending] = useActionState<KitchenResult, FormData>(rename, {
    ok: true,
  });

  return (
    <form action={action}>
      <label htmlFor="kitchen-name" className={LABEL}>
        Name
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="kitchen-name"
          name="name"
          defaultValue={name}
          maxLength={60}
          className={`${FIELD} min-w-48 flex-1`}
        />
        <button type="submit" disabled={pending} className={`${BUTTON} shrink-0`}>
          {pending ? "Saving…" : "Rename"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function EditLocations({ locations }: { locations: string[] }) {
  const [state, action, pending] = useActionState<KitchenResult, FormData>(
    saveLocations,
    { ok: true },
  );

  return (
    <form action={action}>
      <label htmlFor="locations" className={LABEL}>
        Places, in the order you&apos;d walk them
      </label>
      <textarea
        id="locations"
        name="locations"
        rows={Math.max(5, locations.length + 1)}
        defaultValue={locations.join("\n")}
        className={`${FIELD} resize-y leading-relaxed`}
      />
      <p className="mt-1.5 mb-3 text-xs font-semibold text-muted-foreground">
        One per line. Items keep whatever place they were given, so renaming one
        here won&apos;t rewrite what&apos;s already on the shelf.
      </p>
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Saving…" : "Save places"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function Members({
  kitchen,
  members,
  youAreOwner,
  yourId,
}: {
  kitchen: KitchenMembership;
  members: Member[];
  youAreOwner: boolean;
  yourId: number;
}) {
  const [state, action, pending] = useActionState<KitchenResult, FormData>(invite, {
    ok: true,
  });
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.user_id}
            className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-background px-4 py-3"
          >
            <div className="min-w-0">
              <div className="font-bold break-words">
                {member.display_name}
                {member.user_id === yourId && (
                  <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                    you
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-muted-foreground">
                @{member.handle} · {member.role}
              </div>
            </div>

            {youAreOwner && member.role !== "owner" && (
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await removePerson(member.user_id);
                  })
                }
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {youAreOwner ? (
        <form action={action} className="flex flex-wrap gap-2">
          <input
            name="handle"
            placeholder="their handle"
            aria-label="Handle to add"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${FIELD} min-w-40 flex-1`}
          />
          <select name="role" defaultValue="viewer" className={`${FIELD} w-32 shrink-0`}>
            <option value="viewer">can see</option>
            <option value="editor">can edit</option>
          </select>
          <button type="submit" disabled={pending} className={`${BUTTON} shrink-0`}>
            Add
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await leaveKitchen(kitchen.id);
            })
          }
          className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-destructive"
        >
          Leave this kitchen
        </button>
      )}

      {youAreOwner && <Feedback state={state} />}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setFollowing } from "@/app/social/actions";

/**
 * Follow and unfollow. Mutual follows are what unlock friends-only recipes,
 * which is why the button says so when only one side has happened.
 */
export function FollowButton({
  handle,
  youFollow,
  followsYou,
}: {
  handle: string;
  youFollow: boolean;
  followsYou: boolean;
}) {
  const [following, setFollow] = useState(youFollow);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const next = !following;
            const result = await setFollowing(handle, next);
            // Without this the button just quietly refuses to change and you're
            // left tapping it.
            if (result.ok) {
              setFollow(next);
              setError(null);
            } else {
              setError(result.error ?? "Couldn't save that.");
            }
          })
        }
        className={
          following
            ? "rounded-[14px] bg-chip px-5 py-2.5 text-sm font-bold disabled:opacity-60"
            : "rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        }
      >
        {pending ? "…" : following ? "Following" : "Follow"}
      </button>

      {followsYou && !following && (
        <span className="text-xs font-semibold text-muted-foreground">
          follows you — follow back to share friends-only recipes
        </span>
      )}
      {followsYou && following && (
        <span className="text-xs font-bold text-primary">friends</span>
      )}

      {error && (
        <span role="alert" className="text-xs font-bold text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

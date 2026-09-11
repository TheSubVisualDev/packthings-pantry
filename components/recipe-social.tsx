"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { comment, removeComment, setLiked } from "@/app/social/actions";
import { shortDate } from "@/lib/dates";
import type { Comment } from "@/lib/queries";

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

export function RecipeSocial({
  recipeId,
  likes,
  youLiked,
  comments,
  viewerId,
  isAuthor,
}: {
  recipeId: number;
  likes: number;
  youLiked: boolean;
  comments: Comment[];
  viewerId: number;
  isAuthor: boolean;
}) {
  const [liked, setLike] = useState(youLiked);
  const [count, setCount] = useState(likes);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className={`${CARD} mt-5`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={liked}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const next = !liked;
              const result = await setLiked(recipeId, next);
              if (result.ok) {
                setLike(next);
                setCount((c) => c + (next ? 1 : -1));
              }
            })
          }
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            liked ? "bg-primary text-primary-foreground" : "bg-chip text-muted-foreground"
          }`}
        >
          ♥ {count > 0 ? count : ""} {liked ? "Liked" : "Like"}
        </button>
        <span className="text-sm font-semibold text-muted-foreground">
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </span>
      </div>

      {comments.length > 0 && (
        <ul className="mt-4 space-y-3">
          {comments.map((entry) => (
            <li key={entry.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
              <div className="flex items-start gap-3">
                <Avatar
                  handle={entry.handle}
                  displayName={entry.display_name}
                  url={entry.avatar_url}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/people/${entry.handle}`}
                    className="text-sm font-bold hover:underline"
                  >
                    {entry.display_name}
                  </Link>
                  <span className="ml-2 text-xs font-semibold text-muted-foreground">
                    {shortDate(entry.created_at)}
                  </span>
                  <p className="mt-1 text-[15px] leading-relaxed font-medium break-words">
                    {entry.body}
                  </p>
                </div>

                {(entry.user_id === viewerId || isAuthor) && (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await removeComment(entry.id);
                      })
                    }
                    className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={draft}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something"
          aria-label="Add a comment"
          className="min-w-44 flex-1 rounded-[14px] border border-border bg-background px-4 py-3 font-semibold outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={pending || draft.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await comment(recipeId, draft);
              if (result.ok) {
                setDraft("");
                setError(null);
              } else {
                setError(result.error ?? "Couldn't post that.");
              }
            })
          }
          className="shrink-0 rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
        >
          Post
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

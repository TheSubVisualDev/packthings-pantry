"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { setLiked } from "@/app/social/actions";

/**
 * The heart, in the header, on the photo.
 *
 * It used to live in the social card at the bottom of the page - after the
 * whole ingredient list, the servings stepper, the method, the cook button and
 * the star rating. On a phone that is several screens of scrolling, and it was
 * reported, correctly, as hidden. Liking something is a reaction you have when
 * you first look at it, so the control belongs where the first look happens.
 *
 * It is also drawn to be found. At rest it was `bg-chip text-muted-foreground`,
 * which is the same weight as the "in stock" chips and the tag pills - so even
 * once you reached it, it read as another label rather than as the one thing
 * on the page you are invited to press.
 *
 * There is exactly one of these on the page. Two like buttons that have to
 * agree with each other is the shape of bug this codebase keeps a count of, so
 * the social card below kept the comments and gave this up entirely.
 */
export function RecipeLike({
  recipeId,
  likes,
  youLiked,
  /** White-on-photo in the header; the plain treatment anywhere else. */
  onPhoto,
}: {
  recipeId: number;
  likes: number;
  youLiked: boolean;
  onPhoto: boolean;
}) {
  const [liked, setLike] = useState(youLiked);
  const [count, setCount] = useState(likes);
  const [pending, startTransition] = useTransition();

  /**
   * Counts the likes, not the unlikes.
   *
   * A press that agrees with something should feel like one; taking it back
   * should not get the same little celebration, and animating both made the
   * button read as a toggle rather than as a reaction. It also stays at 0 on
   * first render so a recipe you liked last week does not re-congratulate you
   * every time the page opens.
   */
  const [cheers, setCheers] = useState(0);

  /** Every press, including taking one back - the figure moved either way. */
  const [moves, setMoves] = useState(0);

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? "Unlike this recipe" : "Like this recipe"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          /**
           * Moved before the round trip, and put back if it fails.
           *
           * A heart that waits for Nuremberg before filling in is a heart that
           * feels broken - the press is the whole interaction, and 200ms of
           * nothing reads as a missed tap, which is how you get two.
           */
          const next = !liked;
          setLike(next);
          setCount((c) => c + (next ? 1 : -1));
          setMoves((n) => n + 1);
          if (next) setCheers((n) => n + 1);

          const result = await setLiked(recipeId, next);
          if (!result.ok) {
            setLike(!next);
            setCount((c) => c - (next ? 1 : -1));
          }
        })
      }
      className={`flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.18)] backdrop-blur transition-colors ${
        liked
          ? "bg-primary text-primary-foreground"
          : onPhoto
            ? "bg-white/85 text-foreground"
            : "bg-card text-foreground"
      }`}
    >
      <Heart
        key={cheers}
        className={`h-5 w-5${cheers > 0 ? " tick" : ""}`}
        // Filled once you've liked it, so the state reads at a glance and the
        // button does not need a word beside it to say which way round it is.
        fill={liked ? "currentColor" : "none"}
        strokeWidth={2.5}
      />
      {count > 0 && (
        <span
          key={moves}
          className={`pr-0.5 text-sm font-extrabold tabular-nums${
            moves > 0 ? " tick" : ""
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

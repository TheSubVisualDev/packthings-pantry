import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { BlockButton } from "@/components/block-button";
import { FollowButton } from "@/components/follow-button";
import { RecipeBrowseCard } from "@/components/recipe-browse-card";
import { SiteHeader } from "@/components/site-header";
import { browseRecipes } from "@/lib/queries";
import { followState } from "@/lib/social";
import { currentKitchen } from "@/lib/session";
import { getUserByHandle } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile · Pantry",
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login");

  const { handle } = await params;
  const person = await getUserByHandle(handle);
  if (!person) notFound();

  const isYou = person.id === context.user.id;

  // browseRecipes applies the visibility rule, so this shows exactly what this
  // viewer is allowed to see of theirs - public, plus friends-only if mutual.
  const [recipes, follows] = await Promise.all([
    browseRecipes(context.user.id, { authorId: person.id }),
    followState(context.user.id, person.id),
  ]);

  // Blocking empties this list too, and "follow each other to see more" is the
  // wrong thing to tell someone who chose not to see this person at all.
  const blocked = !isYou && follows.youBlocked;

  return (
    <>
      <SiteHeader active="discover" />

      <div className="mx-auto w-full max-w-[900px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <Link
          href="/people"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← People
        </Link>

        <div className="mt-3 flex items-center gap-4">
          <Avatar
            handle={person.handle}
            displayName={person.display_name}
            url={person.avatar_url}
            size={64}
          />
          <h1 className="min-w-0 text-[28px] font-extrabold tracking-[-0.02em] break-words">
            {person.display_name}
          </h1>
        </div>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          @{person.handle} · {follows.followers}{" "}
          {follows.followers === 1 ? "follower" : "followers"} · following{" "}
          {follows.following}
        </p>

        {!isYou && (
          <div className="mt-4">
            {/* Blocked means there is nothing here to follow, so the follow
                button would only be a way to half-undo the block. */}
            {!blocked && (
              <FollowButton
                handle={person.handle}
                youFollow={follows.youFollow}
                followsYou={follows.followsYou}
              />
            )}
            <div className={blocked ? undefined : "mt-3"}>
              <BlockButton handle={person.handle} blocked={follows.youBlocked} />
            </div>
          </div>
        )}

        <h2 className="mt-8 mb-3 text-xs font-bold uppercase tracking-[0.1em] text-label">
          {isYou
            ? "Everything you've written"
            : blocked
              ? "Blocked"
              : "What they've shared"}
        </h2>

        {recipes.length === 0 ? (
          <p className="rounded-[20px] bg-card p-6 text-sm font-semibold text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {blocked
              ? `You've blocked @${person.handle}. Their recipes are hidden from you and yours from them.`
              : isYou
                ? "You haven't written any recipes yet."
                : follows.youFollow && follows.followsYou
                  ? "Nothing shared yet."
                  : "Nothing public. Friends-only recipes appear once you follow each other."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeBrowseCard key={recipe.id} recipe={recipe} showAuthor={false} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SiteHeader } from "@/components/site-header";
import { browsePeople } from "@/lib/social";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People · Pantry",
};

export default async function PeoplePage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fpeople");

  const people = await browsePeople(context.user.id);

  return (
    <>
      <SiteHeader active="discover" />

      <div className="mx-auto w-full max-w-[720px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">People</h1>
        <p className="mt-1 mb-6 text-sm font-semibold text-muted-foreground">
          Everyone with an account here.
        </p>

        {people.length === 0 ? (
          <p className="rounded-[20px] bg-card p-6 text-sm font-semibold text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            Just you so far. Invite someone from{" "}
            <Link href="/settings" className="font-bold text-primary underline underline-offset-2">
              settings
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/people/${person.handle}`}
                  className="flex items-center gap-3 rounded-[20px] bg-card px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <Avatar
                    handle={person.handle}
                    displayName={person.display_name}
                    url={person.avatar_url}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold break-words">
                      {person.display_name}
                    </span>
                    <span className="block text-sm font-semibold text-muted-foreground">
                      @{person.handle}
                      {person.you_follow === 1 && " · following"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                    {person.recipe_count}{" "}
                    {person.recipe_count === 1 ? "recipe" : "recipes"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteKitchen } from "@/components/delete-kitchen";
import { EditLocations, Members, RenameKitchen } from "@/components/kitchen-admin";
import { NewKitchen } from "@/components/new-kitchen";
import { KitchenTags } from "@/components/kitchen-tags";
import { SiteHeader } from "@/components/site-header";
import { getContents, getKitchensFor, getLocations, getMembers } from "@/lib/kitchens";
import { getTags } from "@/lib/tags";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kitchens · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

export default async function KitchensPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const [context, { need }] = await Promise.all([currentKitchen(), searchParams]);
  if (!context.ok) redirect("/login?next=%2Fkitchens");

  const { user, kitchen } = context;
  const kitchens = await getKitchensFor(user.id);

  // An account with no kitchen is a normal state, not a broken one: you can
  // follow people and write recipes without ever tracking a tin of beans.
  if (!kitchen) {
    return (
      <>
        <SiteHeader active="stock" />

        <main className="mx-auto w-full max-w-[560px] px-5 py-10 pb-32 sm:px-9">
          <span className={LABEL}>Kitchens</span>
          <h1 className="mt-2 text-[30px] font-extrabold tracking-[-0.02em]">
            You haven&apos;t got a kitchen yet
          </h1>

          <p className="mt-3 text-[15px] leading-relaxed font-medium text-muted-foreground">
            {need === "stock"
              ? "That page is about what's on your shelves, which needs a kitchen to be on the shelves of."
              : "A kitchen is a stock list with people attached — what you have in, what's running out, what to buy."}
          </p>

          <div className={`${CARD} mt-6`}>
            <h2 className={LABEL}>Make one</h2>
            <p className="mt-2 mb-4 text-sm font-medium text-muted-foreground">
              Yours to fill. You can share it with people later, so they can see
              what you have or help keep it up to date.
            </p>
            <NewKitchen alwaysOpen />
          </div>

          <div className={`${CARD} mt-3`}>
            <h2 className={LABEL}>Or wait to be added</h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              Anyone who owns a kitchen can add you to theirs by your handle,{" "}
              <strong className="font-bold text-foreground">@{user.handle}</strong>.
              It&apos;ll turn up in the menu at the top.
            </p>
          </div>

          <p className="mt-6 text-sm font-semibold text-muted-foreground">
            Meanwhile you can{" "}
            <Link href="/discover" className="font-bold text-primary underline underline-offset-2">
              see what people are cooking
            </Link>{" "}
            and write your own recipes — neither needs a kitchen.
          </p>
        </main>
      </>
    );
  }

  const [members, locations, contents, tags] = await Promise.all([
    getMembers(kitchen.id),
    getLocations(kitchen.id),
    getContents(kitchen.id),
    getTags(kitchen.id),
  ]);

  const youAreOwner = kitchen.role === "owner";

  return (
    <>
      <SiteHeader active="stock" />

      <main className="mx-auto w-full max-w-[640px] px-5 py-8 pb-32 sm:px-9">
        <span className={LABEL}>Kitchen</span>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-[-0.02em]">
          {kitchen.name}
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {youAreOwner
            ? "Yours."
            : `Shared with you by @${kitchen.owner_handle} — you ${kitchen.role === "editor" ? "can edit it" : "can look, not touch"}.`}
        </p>

        <div className="mt-7 space-y-3">
          <section className={CARD}>
            <h2 className={LABEL}>Who&apos;s in it</h2>
            <div className="mt-3">
              <Members
                kitchen={kitchen}
                members={members}
                youAreOwner={youAreOwner}
                yourId={user.id}
              />
            </div>
          </section>

          <section className={CARD}>
            <h2 className={LABEL}>Tags</h2>
            <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
              Every word this kitchen files stock under, and how much carries it.
            </p>
            <div className="mt-3">
              <KitchenTags tags={tags} canEdit={kitchen.role !== "viewer"} />
            </div>
          </section>

          {youAreOwner && (
            <>
              <section className={CARD}>
                <h2 className={LABEL}>Places</h2>
                <div className="mt-3">
                  <EditLocations locations={locations} />
                </div>
              </section>

              <section className={CARD}>
                <h2 className={LABEL}>Rename</h2>
                <div className="mt-3">
                  <RenameKitchen name={kitchen.name} />
                </div>
              </section>

              <section className={CARD}>
                <h2 className={LABEL}>Delete</h2>
                <div className="mt-3">
                  <DeleteKitchen
                    kitchenId={kitchen.id}
                    name={kitchen.name}
                    contents={contents}
                  />
                </div>
              </section>
            </>
          )}

          <section className={CARD}>
            <h2 className={LABEL}>Your kitchens</h2>
            <ul className="mt-3 mb-4 space-y-1.5">
              {kitchens.map((entry) => (
                <li key={entry.id} className="text-sm font-semibold">
                  {entry.name}
                  {entry.role !== "owner" && (
                    <span className="ml-1.5 font-semibold text-muted-foreground">
                      @{entry.owner_handle}
                    </span>
                  )}
                  <span className="ml-2 text-muted-foreground">{entry.role}</span>
                  {entry.id === kitchen.id && (
                    <span className="ml-2 text-xs font-bold text-primary">open</span>
                  )}
                </li>
              ))}
            </ul>
            <NewKitchen />
          </section>
        </div>

        <p className="mt-6 text-sm font-semibold text-muted-foreground">
          <Link href="/pantry" className="underline underline-offset-2">
            ← Back to the pantry
          </Link>
        </p>
      </main>
    </>
  );
}

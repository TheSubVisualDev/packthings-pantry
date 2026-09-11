import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EditLocations, Members, RenameKitchen } from "@/components/kitchen-admin";
import { NewKitchen } from "@/components/new-kitchen";
import { SiteHeader } from "@/components/site-header";
import { getKitchensFor, getLocations, getMembers } from "@/lib/kitchens";
import { currentKitchen } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kitchens · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

export default async function KitchensPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fkitchens");

  const { user, kitchen } = context;
  const [members, locations, kitchens] = await Promise.all([
    getMembers(kitchen.id),
    getLocations(kitchen.id),
    getKitchensFor(user.id),
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
            : `Shared with you — you ${kitchen.role === "editor" ? "can edit it" : "can look, not touch"}.`}
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

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { PantryMark } from "@/components/pantry-mark";
import { createFirstUser } from "@/app/login/actions";
import { countUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up · Pantry",
};

/**
 * First run. Reached by signing in with the deployment's own password while no
 * account exists; sends you away the moment one does.
 */
export default async function SetupPage() {
  if ((await countUsers()) > 0) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center px-5 py-10">
      <PantryMark className="mb-4 h-11 w-10 text-primary" />
      <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">
        Claim your pantry
      </h1>
      <p className="mt-1 mb-7 text-sm font-semibold text-muted-foreground">
        This is the first account, and it owns everything already here. After
        this, people get in by invitation only.
      </p>
      <AccountForm action={createFirstUser} submitLabel="Create my account" />
    </main>
  );
}

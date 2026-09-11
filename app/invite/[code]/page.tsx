import type { Metadata } from "next";
import Link from "next/link";
import { AccountForm } from "@/components/account-form";
import { PantryMark } from "@/components/pantry-mark";
import { acceptInvite } from "@/app/login/actions";
import { inviteState } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're invited · Pantry",
};

const REFUSAL: Record<string, string> = {
  redeemed: "That invite has already been used.",
  expired: "That invite has expired. Ask whoever sent it for another.",
  unknown: "That invite doesn't exist.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const state = await inviteState(code);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center px-5 py-10">
      <PantryMark className="mb-4 h-11 w-10 text-primary" />

      {state !== "usable" ? (
        <>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">
            No good, sorry
          </h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {REFUSAL[state]}
          </p>
          <Link
            href="/login"
            className="mt-6 text-sm font-bold text-primary underline underline-offset-2"
          >
            Sign in instead
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">
            You&apos;re invited
          </h1>
          <p className="mt-1 mb-7 text-sm font-semibold text-muted-foreground">
            Pick a handle and a password and the pantry is yours.
          </p>
          <AccountForm
            action={acceptInvite}
            hidden={{ code }}
            submitLabel="Join"
          />
        </>
      )}
    </main>
  );
}

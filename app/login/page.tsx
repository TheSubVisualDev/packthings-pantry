import type { Metadata } from "next";
import { AccountForm } from "@/components/account-form";
import { LoginForm } from "@/components/login-form";
import { PantryMark } from "@/components/pantry-mark";
import { createFirstUser } from "@/app/login/actions";
import { safeNextPath } from "@/lib/auth";
import { countUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Pantry",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, users] = await Promise.all([searchParams, countUsers()]);

  // With no account yet there is nothing to sign in to, so this page becomes
  // the first-run form instead. It lives here rather than behind the gate
  // because a first-run page you need a session to reach is a page nobody can
  // reach; it carries the deployment password as its own proof instead.
  const firstRun = users === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center px-5 py-10">
      {/* The mark in a tile rather than loose on the background - board 1q.
          A bare icon above a form reads as a stray glyph; the same mark on a
          card reads as the front door of something. */}
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <PantryMark className="h-9 w-8 text-primary" />
      </div>

      {firstRun ? (
        <>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">
            Claim your pantry
          </h1>
          <p className="mt-1 mb-7 text-sm font-semibold text-muted-foreground">
            This is the first account, and it owns everything already here.
            After this, people get in by invitation only.
          </p>
          <AccountForm
            action={createFirstUser}
            submitLabel="Create my account"
            askDeploymentPassword
          />
        </>
      ) : (
        <>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">Pantry</h1>
          <p className="mt-1 mb-7 text-sm font-semibold text-muted-foreground">
            Sign in to see what&apos;s in the kitchen.
          </p>
          <LoginForm next={safeNextPath(next)} />

          {/* The design asks for "Create an account" here, and there is no
              such thing: this app has no public signup by decision. Saying so
              is the useful version of that line - somebody standing at a door
              with no handle should be told where the key is, not offered a
              button that cannot work. */}
          <p className="mt-6 text-center text-sm font-semibold text-muted-foreground">
            No account? There is no signup — whoever runs the kitchen can send
            you an invite link.
          </p>
        </>
      )}
    </main>
  );
}

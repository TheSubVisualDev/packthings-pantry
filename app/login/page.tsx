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
      <PantryMark className="mb-4 h-11 w-10 text-primary" />

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
        </>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { safeNextPath } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in · Pantry",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">Pantry</h1>
      <p className="mt-1 mb-7 text-sm font-semibold text-muted-foreground">
        Sign in to see what&apos;s in the kitchen.
      </p>
      <LoginForm next={safeNextPath(next)} />
    </main>
  );
}

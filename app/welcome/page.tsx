import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Welcome } from "@/components/welcome";
import { pushConfigured } from "@/lib/push";
import { currentKitchen } from "@/lib/session";
import { hasBeenWelcomed } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome · Pantry",
};

/**
 * The first five minutes.
 *
 * The cliff a new account falls off is not signing up, it is the screen after
 * it: empty shelves, no recipes, and four tabs that all say nothing yet. This
 * leaves somebody with a named kitchen, a shelf with something on it, and some
 * idea where things are.
 *
 * No site header and no bottom nav. Both are navigation into an app that does
 * not have anything in it yet, and the one thing this screen is for is the
 * next tap being the right one.
 */
export default async function WelcomePage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fwelcome");

  /**
   * Anybody who has been shown round goes straight through.
   *
   * Reachable on purpose after that - /settings links here - so it is a thing
   * you can look at again rather than a thing that happened to you once. It
   * simply stops being compulsory.
   */
  if ((await hasBeenWelcomed(context.user.id)) && context.kitchen) {
    redirect("/pantry");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center px-5 py-10">
      <Welcome
        handle={context.user.handle}
        hasKitchen={context.kitchen !== null}
        kitchenName={context.kitchen?.name ?? null}
        pushConfigured={pushConfigured()}
      />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InviteManager } from "@/components/invite-manager";
import { PasswordChange } from "@/components/password-change";
import { ProfileSettings } from "@/components/profile-settings";
import { RevealToken } from "@/components/reveal-token";
import { RotateTokenButton } from "@/components/rotate-token-button";
import { SiteHeader } from "@/components/site-header";
import { logout } from "@/app/login/actions";
import { currentKitchen } from "@/lib/session";
import { listLiveInvites } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings · Pantry",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-6";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

export default async function SettingsPage() {
  const session = await currentKitchen();

  // Arriving through the Basic-auth back door means there's no account to show
  // settings for. Sending them to sign in properly is the honest answer.
  if (!session.ok) redirect("/login?next=%2Fsettings");

  const { user, kitchen } = session;
  const [invites, headerList] = await Promise.all([listLiveInvites(user.id), headers()]);

  const host = headerList.get("host") ?? "";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return (
    <>
      <SiteHeader active="stock" />

      <main className="mx-auto w-full max-w-[640px] px-5 py-8 pb-32 sm:px-9">
        <span className={LABEL}>Settings</span>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-[-0.02em]">
          {user.display_name}
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          @{user.handle}
        </p>

        <div className="mt-7 space-y-3">
          <section className={CARD}>
            <h2 className={LABEL}>You</h2>
            <div className="mt-3">
              <ProfileSettings
                displayName={user.display_name}
                handle={user.handle}
                avatarUrl={user.avatar_url}
              />
            </div>
          </section>

          {/*
            The kitchen, on the page called Settings - board 1r.

            "Which kitchen am I in and what am I allowed to do in it" is an
            account question, and the only place it was answered was a
            different page reached through a menu. The full management - who is
            in it, its tags, leaving it - stays on /kitchens, because that is a
            page about a kitchen rather than about you.
          */}
          {kitchen && (
            <section className={CARD}>
              <h2 className={LABEL}>Kitchen</h2>
              <p className="mt-3 text-[19px] font-extrabold tracking-[-0.02em]">
                {kitchen.name}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
                You are {kitchen.role === "owner" ? "the owner" : `an ${kitchen.role}`}
                {kitchen.role === "viewer" && ", so you can read it but not change it"}.
              </p>
              <Link
                href="/kitchens"
                className="mt-4 inline-flex min-h-11 items-center rounded-[14px] bg-chip px-4 text-sm font-extrabold hover:bg-border"
              >
                Who is in it, and its tags →
              </Link>
            </section>
          )}

          <section className={CARD}>
            <h2 className={LABEL}>Your Claude key</h2>
            <p className="mt-2 mb-3 text-sm font-medium text-muted-foreground">
              Read and write access to your pantry through the API. Rotate it if
              it ever ends up somewhere it shouldn&apos;t.
            </p>
            <RevealToken token={user.api_token} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <RotateTokenButton />
              <Link
                href="/claude"
                className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                How to set it up
              </Link>
            </div>
          </section>

          <section className={CARD}>
            <h2 className={LABEL}>Invite someone</h2>
            <p className="mt-2 mb-3 text-sm font-medium text-muted-foreground">
              There&apos;s no public signup. A link works once and lasts 14 days.
            </p>
            <InviteManager invites={invites} origin={origin} />
          </section>

          <section className={CARD}>
            <h2 className={LABEL}>Password</h2>
            <p className="mt-2 mb-3 text-sm font-medium text-muted-foreground">
              No reset email exists, so keep this somewhere you can find it.
            </p>
            <PasswordChange />
          </section>

          {/* Last, quiet, and in the destructive colour, which is what it is
              for: the one control on this page that ends the session. It was
              only ever in the account dropdown. */}
          <form action={logout} className="px-1 pt-2">
            <button
              type="submit"
              className="min-h-11 text-sm font-bold text-destructive underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

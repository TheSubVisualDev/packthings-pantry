import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bell, Database, FlaskConical, Inbox } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getDb, plainRows } from "@/lib/db";
import { connectionProtocol } from "@/lib/db";
import { isAdmin } from "@/lib/reports";
import { pushConfigured } from "@/lib/push";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Pantry",
};

/**
 * What is going on, in one screen.
 *
 * Not a dashboard of graphs: a list of the things that are either a number
 * somebody wants at a glance or a question that otherwise costs an SSH
 * session. Every figure here is one anybody running this app has wanted at
 * least once and had to go and count by hand.
 */
export default async function AdminPage() {
  const session = await requireUser();
  if (!session.ok) redirect("/login?next=%2Fadmin");
  if (!(await isAdmin(session.user.id))) notFound();

  /**
   * One round trip rather than nine.
   *
   * The database is in Nuremberg and awaits in sequence cost sequential trips
   * there - the same reason the recipe page batches its own reads.
   */
  const [counts, waiting, devices, recent] = await Promise.all([
    getDb().execute(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM kitchens) AS kitchens,
        (SELECT COUNT(*) FROM items) AS items,
        (SELECT COUNT(*) FROM recipes) AS recipes,
        (SELECT COUNT(*) FROM cook_events WHERE undone_at IS NULL) AS cooks,
        (SELECT COUNT(*) FROM invites WHERE redeemed_by IS NULL AND expires_at > CURRENT_TIMESTAMP) AS invites
    `),
    getDb().execute("SELECT COUNT(*) AS n FROM reports WHERE status = 'new'"),
    getDb().execute("SELECT COUNT(*) AS n FROM push_subscriptions WHERE failed_at IS NULL"),
    getDb().execute(`
      SELECT u.handle, MAX(c.cooked_at) AS last_cooked
      FROM users u LEFT JOIN cook_events c ON c.cooked_by = u.id AND c.undone_at IS NULL
      GROUP BY u.id ORDER BY u.id
    `),
  ]);

  const n = plainRows<Record<string, number>>(counts)[0] ?? {};
  const queue = Number(plainRows<{ n: number }>(waiting)[0]?.n ?? 0);
  const subscribed = Number(plainRows<{ n: number }>(devices)[0]?.n ?? 0);
  const people = plainRows<{ handle: string; last_cooked: string | null }>(recent);

  const CARD =
    "flex items-start gap-3 rounded-[16px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

  return (
    <>
      <SiteHeader active="none" meta={queue > 0 ? `${queue} waiting` : undefined} />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <h1 className="mb-1 text-[26px] font-extrabold tracking-[-0.02em]">Admin</h1>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">
          Everything here acts on the live pantry.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/admin/reports" className={CARD}>
            <Inbox className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />
            <span className="min-w-0">
              <span className="block text-sm font-extrabold">Reports</span>
              <span className="block text-sm font-medium text-muted-foreground">
                {queue > 0 ? `${queue} waiting to be decided` : "Nothing waiting"}
                {" · every bucket, movable"}
              </span>
            </span>
          </Link>

          <Link href="/admin/db" className={CARD}>
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />
            <span className="min-w-0">
              <span className="block text-sm font-extrabold">Database</span>
              <span className="block text-sm font-medium text-muted-foreground">
                Browse, query, correct a cell
              </span>
            </span>
          </Link>
        </div>

        <h2 className="mt-6 mb-2 text-xs font-bold tracking-[0.08em] text-label uppercase">
          How much of everything
        </h2>
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["People", n.users],
            ["Kitchens", n.kitchens],
            ["Items", n.items],
            ["Recipes", n.recipes],
            ["Cooks", n.cooks],
            ["Live invites", n.invites],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-[14px] bg-card p-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            >
              <dd className="text-[20px] font-extrabold tabular-nums">{value ?? 0}</dd>
              <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>

        <h2 className="mt-6 mb-2 text-xs font-bold tracking-[0.08em] text-label uppercase">
          Is it plugged in
        </h2>
        <ul className="space-y-2">
          {/* The three things that are configured rather than coded, and so
              are the three that are silently off on a deployment nobody has
              finished setting up. */}
          <li className={CARD}>
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />
            <span>
              <span className="block text-sm font-extrabold">
                Notifications {pushConfigured() ? "on" : "not set up"}
              </span>
              <span className="block text-sm font-medium text-muted-foreground">
                {subscribed} {subscribed === 1 ? "device" : "devices"} listening
              </span>
            </span>
          </li>
          <li className={CARD}>
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />
            <span>
              <span className="block text-sm font-extrabold">
                Database over {connectionProtocol() ?? "unknown"}
              </span>
              <span className="block text-sm font-medium text-muted-foreground">
                wss pools one connection; https opens one per query
              </span>
            </span>
          </li>
        </ul>

        <h2 className="mt-6 mb-2 text-xs font-bold tracking-[0.08em] text-label uppercase">
          Who is here
        </h2>
        <ul className="overflow-hidden rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {people.map((person) => (
            <li
              key={person.handle}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm font-semibold last:border-b-0"
            >
              <span>@{person.handle}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {person.last_cooked
                  ? `last cooked ${String(person.last_cooked).slice(0, 10)}`
                  : "never cooked"}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

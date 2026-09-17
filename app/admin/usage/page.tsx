import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RankedBars } from "@/components/ranked-bars";
import { SiteHeader } from "@/components/site-header";
import { shortDate } from "@/lib/dates";
import { isAdmin } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import {
  ACTIONS,
  unusedActions,
  usageByAction,
  usageByDay,
  usageByPage,
  usageSpan,
  type DayCount,
} from "@/lib/usage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Usage · Admin",
};

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";
const LABEL = "text-xs font-bold uppercase tracking-[0.1em] text-label";

/** The windows worth asking for. A day is noise; a year is longer than the table. */
const WINDOWS = [7, 30, 90] as const;

/**
 * What people actually press.
 *
 * lib/usage.ts has been able to answer this since it was written and nothing
 * called it, so the answer lived in a script run by hand against Nuremberg -
 * which means in practice it was read once. This is that script as a page.
 *
 * The half worth reading is the bottom half. A ranking of what is popular
 * mostly confirms what you already believed; the list of names that have never
 * once fired is the thing that changes a decision - and it is drawn with the
 * date counting started next to it, because a zero from a feature nobody wants
 * and a zero from a tracker that went live on Tuesday are the same figure and
 * completely different news.
 */
export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await requireUser();
  if (!session.ok) redirect("/login?next=%2Fadmin%2Fusage");
  if (!(await isAdmin(session.user.id))) notFound();

  const { days: asked } = await searchParams;
  const days = WINDOWS.find((window) => String(window) === asked) ?? 30;

  // One trip each, in parallel: the database is in Nuremberg and five awaits
  // in sequence are five round trips there, the same reason /admin batches.
  const [span, actions, pages, daily, unused] = await Promise.all([
    usageSpan(),
    usageByAction(days),
    usageByPage(days),
    usageByDay(days),
    unusedActions(days),
  ]);

  const counted = actions.reduce((total, row) => total + row.count, 0);
  const since = span.first_at ? shortDate(span.first_at.slice(0, 10)) : null;

  return (
    <>
      <SiteHeader active="none" meta={`${span.events} events`} />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/admin"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Admin
        </Link>
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Usage
        </h1>
        <p className="mb-4 text-sm font-semibold text-muted-foreground">
          {since
            ? `Counting since ${since}. Every number here is a tap, not a page view.`
            : "Nothing counted yet."}
        </p>

        {/* The window as links rather than a control: a window is a place you
            can send somebody, and the page is a server render either way. */}
        <div className="mb-5 flex gap-1.5">
          {WINDOWS.map((window) => (
            <Link
              key={window}
              href={`/admin/usage?days=${window}`}
              aria-current={window === days ? "page" : undefined}
              className={`flex h-9 items-center rounded-full px-3.5 text-xs font-bold ${
                window === days
                  ? "bg-ink text-background"
                  : "bg-card text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              }`}
            >
              {window} days
            </Link>
          ))}
        </div>

        {span.events === 0 ? (
          <div className={`${CARD} text-center`}>
            <p className="text-sm font-semibold text-muted-foreground">
              No events recorded. Either nobody has pressed anything since the
              tracker went in, or it is not reaching the database - the row
              count on usage_events is the thing that tells you which.
            </p>
            <Link
              href="/admin/db?table=usage_events"
              className="mt-4 inline-block rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              Look at the table
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <section className={CARD}>
              <h2 className={LABEL}>In the last {days} days</h2>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <Figure value={counted} label="taps" />
                <Figure
                  value={actions.length}
                  label={`of ${ACTIONS.length} actions`}
                />
                <Figure
                  value={Math.max(0, ...actions.map((row) => row.people))}
                  label="people, at most"
                />
              </div>
            </section>

            <section className={CARD}>
              <h2 className={LABEL}>Day by day</h2>
              <p className="mt-1 mb-3 text-sm font-semibold text-muted-foreground">
                Quiet days are drawn as quiet days rather than skipped.
              </p>
              <DayBars days={daily} />
            </section>

            <section className={CARD}>
              <h2 className={LABEL}>What gets pressed</h2>
              <div className="mt-3">
                <RankedBars
                  rows={actions.map((row) => ({
                    key: row.action,
                    label: row.action,
                    value: row.count,
                    meta: `${row.people} ${row.people === 1 ? "person" : "people"}${
                      row.last_at
                        ? ` · last ${shortDate(row.last_at.slice(0, 10))}`
                        : ""
                    }`,
                  }))}
                  unit="taps"
                />
              </div>
              {/* Why both numbers are on the row. Said once, rather than left
                  to be inferred from a column nobody reads twice. */}
              <p className="mt-3 text-xs font-semibold text-muted-foreground">
                400 taps by one person is a habit. 40 by twelve is a feature.
              </p>
            </section>

            {unused.length > 0 && (
              <section className={CARD}>
                <h2 className={LABEL}>Nobody has touched</h2>
                <p className="mt-1 mb-3 text-sm font-semibold text-muted-foreground">
                  {unused.length} of {ACTIONS.length} names went unrecorded in
                  this window.{" "}
                  {since
                    ? `Counting only started ${since}, so nothing here has been ignored for longer than that.`
                    : ""}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {unused.map((action) => (
                    <li
                      key={action}
                      className="rounded-full bg-chip px-3 py-1.5 font-[family-name:var(--font-plex-mono)] text-xs font-bold text-muted-foreground"
                    >
                      {action}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs font-semibold text-muted-foreground">
                  check:usage proves every one of these is wired to something,
                  so a zero here is a zero and not a typo in a data-track
                  attribute.
                </p>
              </section>
            )}

            {pages.length > 0 && (
              <section className={CARD}>
                <h2 className={LABEL}>Where it happens</h2>
                <p className="mt-1 mb-3 text-sm font-semibold text-muted-foreground">
                  Which screen the tap came from, which is not the same question
                  as what it did.
                </p>
                <RankedBars
                  rows={pages.slice(0, 12).map((row) => ({
                    key: row.page,
                    label: row.page,
                    value: row.count,
                    // The route itself where there is one. "(unknown)" is not a
                    // place and a link to it would 404.
                    href: row.page.startsWith("/") ? row.page : undefined,
                  }))}
                  unit="taps"
                />
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-[28px] leading-none font-extrabold tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/**
 * Events per day, as columns.
 *
 * One series, so one hue: length carries the magnitude and a second colour
 * would be inventing a distinction the data does not have. Only the busiest
 * day is labelled - a number over every column is thirty numbers nobody reads
 * - and the rest are on hover.
 */
function DayBars({ days }: { days: DayCount[] }) {
  const most = Math.max(1, ...days.map((day) => day.count));
  const peak = days.reduce(
    (best, day) => (day.count > best.count ? day : best),
    days[0] ?? { day: "", count: 0, people: 0 },
  );

  return (
    <figure>
      <div
        className="flex h-24 items-end gap-[2px]"
        role="img"
        aria-label={`Taps per day over ${days.length} days. Busiest was ${peak.count} on ${peak.day}.`}
      >
        {days.map((day) => (
          <div
            key={day.day}
            title={`${day.day}: ${day.count} ${day.count === 1 ? "tap" : "taps"}, ${day.people} ${day.people === 1 ? "person" : "people"}`}
            className="flex h-full flex-1 items-end"
          >
            {/* A 2px stub on a day with nothing in it: the day still happened,
                and an absent column reads as a missing day rather than a
                quiet one. */}
            <div
              className={`w-full rounded-t-[4px] ${day.count > 0 ? "bg-primary" : "bg-chip"}`}
              style={{
                height: day.count > 0 ? `${(day.count / most) * 100}%` : "2px",
              }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex items-baseline justify-between gap-3 text-xs font-semibold text-muted-foreground">
        <span>{days[0]?.day.slice(5)}</span>
        {peak.count > 0 && (
          <span className="font-bold tabular-nums text-foreground">
            {peak.count} on {peak.day.slice(5)}
          </span>
        )}
        <span>today</span>
      </figcaption>
    </figure>
  );
}

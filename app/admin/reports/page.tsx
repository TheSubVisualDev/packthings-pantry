import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportBuckets } from "@/components/report-buckets";
import { SiteHeader } from "@/components/site-header";
import { getReports, isAdmin, type ReportStatus } from "@/lib/reports";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reports · Admin",
};

/**
 * Every report, in its bucket.
 *
 * The swipe screen at /reports is for working through a pile; this is for when
 * you know which report you want and what should happen to it. Those are
 * different jobs and the swipe was being asked to do both, which is how a
 * mis-swipe became permanent.
 */
export default async function AdminReportsPage() {
  const session = await requireUser();
  if (!session.ok) redirect("/login?next=%2Fadmin%2Freports");
  // notFound, not a refusal: a page that says "you are not allowed here" has
  // told you there is a here.
  if (!(await isAdmin(session.user.id))) notFound();

  const reports = await getReports();

  const counts = { new: 0, approved: 0, rejected: 0, done: 0 } as Record<
    ReportStatus,
    number
  >;
  for (const report of reports) counts[report.status] += 1;

  return (
    <>
      <SiteHeader active="none" meta={`${counts.new} waiting`} />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/admin"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Admin
        </Link>
        <div className="mt-2 mb-1 flex items-baseline justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Reports</h1>
          <Link
            href="/reports"
            className="shrink-0 text-sm font-bold text-primary underline underline-offset-2"
          >
            Swipe through
          </Link>
        </div>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">
          {reports.length} in total. Anything can be moved to any bucket,
          including back into the queue.
        </p>

        <ReportBuckets reports={reports} counts={counts} />
      </main>
    </>
  );
}

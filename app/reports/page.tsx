import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportTriage } from "@/components/report-triage";
import { SiteHeader } from "@/components/site-header";
import { getReports, isAdmin } from "@/lib/reports";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "What has come in · Pantry",
};

/**
 * The triage screen, for whoever runs the pantry.
 *
 * notFound rather than a refusal for anyone else: a page that says "you are
 * not allowed here" has told you there is a here. Nobody but the admin has any
 * business knowing this route exists.
 */
export default async function ReportsPage() {
  const session = await requireUser();
  if (!session.ok) redirect("/login?next=%2Freports");
  if (!(await isAdmin(session.user.id))) notFound();

  const [waiting, settled] = await Promise.all([
    getReports("new"),
    getReports(["approved", "rejected", "done"]),
  ]);

  const onTheList = settled.filter((report) => report.status === "approved");
  const notForNow = settled.filter((report) => report.status === "rejected");
  const done = settled.filter((report) => report.status === "done");

  return (
    <>
      <SiteHeader active="stock" meta={`${waiting.length} waiting`} />
      <main className="mx-auto w-full max-w-[640px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/report"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Write one
        </Link>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-[-0.02em]">
          What has come in
        </h1>
        <p className="mt-2 mb-6 text-[15px] leading-relaxed font-medium text-muted-foreground">
          One at a time. On the list means it gets built; not for now means it
          does not, and both are kept.
        </p>

        <ReportTriage queue={waiting} />

        {/* What the decisions came to, because the next thing after deciding
            is wanting to know what you decided. */}
        {settled.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-bold tracking-[0.08em] text-label uppercase">
              Already decided
            </h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "on the list", n: onTheList.length },
                { label: "not for now", n: notForNow.length },
                { label: "done", n: done.length },
              ].map(({ label, n }) => (
                <div
                  key={label}
                  className="rounded-[16px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <p className="text-[22px] font-extrabold tabular-nums">{n}</p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {onTheList.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-xs font-bold tracking-[0.08em] text-label uppercase">
                  On the list
                </h3>
                <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  {onTheList.map((report) => (
                    <li
                      key={report.id}
                      className="border-b border-border px-4 py-3 text-sm font-semibold break-words last:border-b-0"
                    >
                      <span className="text-muted-foreground">
                        {report.kind === "bug" ? "Bug" : "Request"} ·{" "}
                      </span>
                      {report.title}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 rounded-[14px] bg-chip p-3.5 text-xs font-semibold text-muted-foreground">
                  Ask Claude to <strong className="font-extrabold">collate the
                  reports</strong> and it works through these, then marks each
                  one done with what it did.
                </p>
              </>
            )}
          </section>
        )}
      </main>
    </>
  );
}

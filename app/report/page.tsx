import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportForm } from "@/components/report-form";
import { SiteHeader } from "@/components/site-header";
import { getMyReports, isAdmin } from "@/lib/reports";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report something · Pantry",
};

const STATUS_WORDS: Record<string, string> = {
  new: "waiting to be read",
  approved: "on the list",
  rejected: "not for now",
  done: "done",
};

/**
 * Writing in: both halves of it on one page.
 *
 * A bug and a wish are the same act - somebody using the thing and finding it
 * wanting - and splitting them across two pages means the person has to decide
 * which one their thing is before they can start typing. It is a toggle at the
 * top of one form instead, and getting it wrong costs nothing.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await requireUser();
  if (!session.ok) redirect("/login?next=%2Freport");

  const [{ from }, mine, admin] = await Promise.all([
    searchParams,
    getMyReports(session.user.id),
    isAdmin(session.user.id),
  ]);

  /**
   * Only a path from this app, never a whole URL.
   *
   * It is echoed onto the page and stored against the report, so an open
   * redirect or a bit of somebody else's markup arriving in a query string is
   * exactly the shape of mistake to not make.
   */
  const page = from && /^\/[\w\-/.?=&%]*$/.test(from) ? from : null;

  return (
    <>
      <SiteHeader active="none" />
      <main className="mx-auto w-full max-w-[720px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href={page ?? "/pantry"}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </Link>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-[-0.02em]">
          Report a bug, or ask for something
        </h1>
        <p className="mt-2 mb-6 text-[15px] leading-relaxed font-medium text-muted-foreground">
          Both go in the same queue and both get read. One line is enough — and
          a screenshot is worth more than a paragraph.
        </p>

        <ReportForm from={page} />

        {admin && (
          <p className="mt-6 text-sm font-semibold">
            <Link
              href="/reports"
              className="font-bold text-primary underline underline-offset-2"
            >
              Go through what has come in
            </Link>
          </p>
        )}

        {mine.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-bold tracking-[0.08em] text-label uppercase">
              What you have sent
            </h2>
            <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {mine.map((report) => (
                <li
                  key={report.id}
                  className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold break-words">{report.title}</p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {report.kind === "bug" ? "Bug" : "Request"}
                      {report.outcome ? ` · ${report.outcome}` : ""}
                    </p>
                  </div>
                  {/* Said in words rather than as a coloured dot. "Not for now"
                      is a real answer and deserves to be readable as one. */}
                  <span className="shrink-0 rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted-foreground">
                    {STATUS_WORDS[report.status] ?? report.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Bug, Check, Clock, Lightbulb, Undo2, X } from "lucide-react";
import { moveReport, type AdminResult } from "@/app/admin/actions";
import type { ReportStatus, ReportWithAuthor } from "@/lib/reports";

const BUCKETS: { key: ReportStatus; label: string; hint: string }[] = [
  { key: "new", label: "Waiting", hint: "Not decided yet." },
  { key: "approved", label: "On the list", hint: "Claude works through these." },
  { key: "rejected", label: "Not for now", hint: "Turned down, and kept." },
  { key: "done", label: "Done", hint: "Built, with a note to whoever asked." },
];

/**
 * Every report, in its bucket, movable to any other.
 *
 * The swipe screen only ever went one way: undecided to decided, one card at a
 * time, no way back. So a report turned down by a mis-swipe was gone and one
 * approved by accident stayed approved - reported, accurately, as "no way to
 * view the buckets, I think I've lost some".
 *
 * Nothing here is a swipe. This is the screen for when you know which report
 * you want and what should happen to it, which is a different job from working
 * through a pile and wants a different shape: a list, with the buckets named.
 */
export function ReportBuckets({
  reports,
  counts,
}: {
  reports: ReportWithAuthor[];
  counts: Record<ReportStatus, number>;
}) {
  const [bucket, setBucket] = useState<ReportStatus>(
    // Opens on whatever actually needs attention, rather than always on
    // "Waiting" and an empty list.
    counts.new > 0 ? "new" : counts.approved > 0 ? "approved" : "done",
  );
  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startWorking] = useTransition();

  const showing = reports.filter((report) => report.status === bucket);

  function move(id: number, to: ReportStatus) {
    setResult(null);
    startWorking(async () => setResult(await moveReport(id, to)));
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BUCKETS.map((each) => (
          <button
            key={each.key}
            type="button"
            aria-pressed={bucket === each.key}
            onClick={() => setBucket(each.key)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold ${
              bucket === each.key
                ? "bg-ink text-background"
                : "bg-card text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            }`}
          >
            {each.label}
            <span className="tabular-nums opacity-60">{counts[each.key]}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-sm font-semibold text-muted-foreground">
        {BUCKETS.find((each) => each.key === bucket)?.hint}
      </p>

      {result && !result.ok && result.error && (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {result.error}
        </p>
      )}

      {showing.length === 0 ? (
        <p className="mt-4 rounded-[20px] bg-card p-6 text-sm font-semibold text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          Nothing in here.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {showing.map((report) => (
            <li
              key={report.id}
              className="rounded-[16px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    report.kind === "bug"
                      ? "bg-[oklch(0.94_0.05_35)] text-destructive"
                      : "bg-[oklch(0.94_0.06_75)] text-[oklch(0.42_0.1_60)]"
                  }`}
                >
                  {report.kind === "bug" ? (
                    <Bug className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <Lightbulb className="h-3 w-3" strokeWidth={3} />
                  )}
                  {report.kind === "bug" ? "Bug" : "Request"}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  #{report.id} · {report.author_handle ? `@${report.author_handle}` : "someone"}
                </span>
              </div>

              <p className="mt-1.5 font-extrabold break-words">{report.title}</p>

              {report.body && (
                <p className="mt-1 text-sm leading-relaxed font-medium whitespace-pre-wrap text-muted-foreground">
                  {report.body}
                </p>
              )}

              {report.photos.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {report.photos.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative h-28 w-20 shrink-0 overflow-hidden rounded-[10px] bg-chip"
                    >
                      <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                    </a>
                  ))}
                </div>
              )}

              {report.page && (
                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                  on{" "}
                  <code className="font-[family-name:var(--font-plex-mono)]">
                    {report.page}
                  </code>
                </p>
              )}

              {report.outcome && (
                <p className="mt-2 rounded-[10px] bg-chip p-2.5 text-xs font-semibold text-muted-foreground">
                  {report.outcome}
                </p>
              )}

              {/* Every bucket except the one it is in, so moving it is one tap
                  and there is never a question about where it can go. */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {BUCKETS.filter((each) => each.key !== report.status).map((each) => (
                  <button
                    key={each.key}
                    type="button"
                    disabled={pending}
                    onClick={() => move(report.id, each.key)}
                    className="flex h-9 items-center gap-1.5 rounded-full bg-chip px-3.5 text-xs font-bold text-muted-foreground disabled:opacity-40"
                  >
                    {each.key === "new" && <Undo2 className="h-3.5 w-3.5" strokeWidth={3} />}
                    {each.key === "approved" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    {each.key === "rejected" && <X className="h-3.5 w-3.5" strokeWidth={3} />}
                    {each.key === "done" && <Clock className="h-3.5 w-3.5" strokeWidth={3} />}
                    {each.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

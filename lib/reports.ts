import { getDb, plainRows } from "./db";

/**
 * Reports: what people say is wrong, and what they wish it did.
 *
 * A tester round produced a dozen findings spread across a chat, screenshots
 * with no context, and a note somebody wrote on their phone and never sent.
 * All of it had to be transcribed by hand. This is the same thing with the
 * transcription removed - and, more to the point, with the context attached:
 * a report knows who wrote it and what page they were standing on, which is
 * the field nobody ever remembers to include and the one that answers half of
 * them.
 *
 * A decision is a column rather than a deletion. An idea that keeps being
 * asked for after it was turned down is itself information, and a deleted row
 * cannot tell you that.
 */

export type ReportKind = "bug" | "idea";
export type ReportStatus = "new" | "approved" | "rejected" | "done";

export interface Report {
  id: number;
  author_id: number | null;
  kind: ReportKind;
  title: string;
  body: string | null;
  page: string | null;
  agent: string | null;
  status: ReportStatus;
  decided_at: string | null;
  decided_by: number | null;
  outcome: string | null;
  created_at: string;
}

export interface ReportWithAuthor extends Report {
  author_handle: string | null;
  author_name: string | null;
  photos: string[];
}

const KINDS: ReportKind[] = ["bug", "idea"];
const STATUSES: ReportStatus[] = ["new", "approved", "rejected", "done"];

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (KINDS as string[]).includes(value);
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

/** Whether this person gets to decide what happens to a report. */
export async function isAdmin(userId: number): Promise<boolean> {
  const result = await getDb().execute({
    sql: "SELECT is_admin FROM users WHERE id = ?",
    args: [userId],
  });
  return (result.rows[0] as unknown as { is_admin: number } | undefined)?.is_admin === 1;
}

/** Files a report and returns its id, so photos can be attached to it. */
export async function fileReport(input: {
  authorId: number;
  kind: ReportKind;
  title: string;
  body: string | null;
  page: string | null;
  agent: string | null;
}): Promise<number> {
  const result = await getDb().execute({
    sql: `INSERT INTO reports (author_id, kind, title, body, page, agent)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [
      input.authorId,
      input.kind,
      input.title,
      input.body,
      input.page,
      // Truncated rather than stored whole: a user agent string is long, and
      // the useful part - which browser, which phone - is at the front.
      input.agent ? input.agent.slice(0, 300) : null,
    ],
  });
  return (result.rows[0] as unknown as { id: number }).id;
}

export async function attachReportPhoto(
  reportId: number,
  url: string,
  position: number,
): Promise<void> {
  await getDb().execute({
    sql: "INSERT INTO report_photos (report_id, url, position) VALUES (?, ?, ?)",
    args: [reportId, url, position],
  });
}

/**
 * Reports in the order they should be looked at: oldest first.
 *
 * Not newest first, which is what a feed would do. Working through a queue
 * newest-first means the ones that have been waiting longest keep being
 * pushed further down, which is how a report ages out without anybody ever
 * deciding anything about it.
 */
export async function getReports(
  status?: ReportStatus | ReportStatus[],
): Promise<ReportWithAuthor[]> {
  const wanted = status === undefined ? null : Array.isArray(status) ? status : [status];

  const rows = await getDb().execute({
    sql: `SELECT r.*, u.handle AS author_handle, u.display_name AS author_name
          FROM reports r
          LEFT JOIN users u ON u.id = r.author_id
          ${wanted ? `WHERE r.status IN (${wanted.map(() => "?").join(", ")})` : ""}
          ORDER BY r.created_at, r.id`,
    args: wanted ?? [],
  });

  const reports = plainRows<Omit<ReportWithAuthor, "photos">>(rows);
  if (reports.length === 0) return [];

  // One query for every photo rather than one per report: a triage screen
  // loads the whole queue, and a round trip to Nuremberg per card is the
  // difference between a page and a wait.
  const photos = await getDb().execute({
    sql: `SELECT report_id, url FROM report_photos
          WHERE report_id IN (${reports.map(() => "?").join(", ")})
          ORDER BY position, id`,
    args: reports.map((report) => report.id),
  });

  const byReport = new Map<number, string[]>();
  for (const row of plainRows<{ report_id: number; url: string }>(photos)) {
    const list = byReport.get(row.report_id) ?? [];
    list.push(row.url);
    byReport.set(row.report_id, list);
  }

  return reports.map((report) => ({
    ...report,
    photos: byReport.get(report.id) ?? [],
  }));
}

/** What somebody has written in, for their own eyes. */
export async function getMyReports(authorId: number): Promise<ReportWithAuthor[]> {
  const all = await getReports();
  return all.filter((report) => report.author_id === authorId).reverse();
}

/** Approve or turn down. Recorded with who and when, never by deleting. */
export async function decideReport(
  id: number,
  status: Exclude<ReportStatus, "new">,
  by: number,
  outcome?: string,
): Promise<void> {
  await getDb().execute({
    sql: `UPDATE reports
          SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ?,
              outcome = COALESCE(?, outcome)
          WHERE id = ?`,
    args: [status, by, outcome ?? null, id],
  });
}

/** Back into the queue, for a card that was swiped by accident. */
export async function undecideReport(id: number): Promise<void> {
  await getDb().execute({
    sql: `UPDATE reports
          SET status = 'new', decided_at = NULL, decided_by = NULL
          WHERE id = ?`,
    args: [id],
  });
}

/** How many are waiting, for the badge on the way in. */
export async function countWaiting(): Promise<number> {
  const result = await getDb().execute(
    "SELECT COUNT(*) AS n FROM reports WHERE status = 'new'",
  );
  return Number((result.rows[0] as unknown as { n: number }).n);
}

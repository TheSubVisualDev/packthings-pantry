"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  columnsOf,
  deleteRow,
  readTable,
  runQuery,
  updateCell,
  type ColumnInfo,
  type Page,
  type QueryResult,
} from "@/lib/admin-db";
import {
  decideReport,
  isAdmin,
  isReportStatus,
  undecideReport,
  type ReportStatus,
} from "@/lib/reports";

export interface AdminResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * The gate, in one place.
 *
 * Every action in this file can read or change anything in the database, so
 * none of them checks admin-ness in its own way - a second copy of "is this
 * person allowed" is a second place for it to be subtly wrong.
 */
async function admin() {
  const session = await requireUser();
  if (!session.ok) return { ok: false as const, error: "Sign in first." };
  if (!(await isAdmin(session.user.id))) {
    // The same answer a non-admin gets everywhere: nothing that confirms the
    // thing they were reaching for exists.
    return { ok: false as const, error: "Not found." };
  }
  return { ok: true as const, userId: session.user.id };
}

/* -------------------------------------------------------------------------
   Reports
   ------------------------------------------------------------------------- */

/**
 * Moves a report to any bucket, from any bucket.
 *
 * The triage screen only ever went one way - new to decided - so a report
 * turned down by a mis-swipe was gone, and one approved by accident stayed
 * approved. Reported as "no way to view the buckets, I think I've lost some".
 */
export async function moveReport(
  id: number,
  to: ReportStatus,
): Promise<AdminResult> {
  const gate = await admin();
  if (!gate.ok) return gate;

  if (!isReportStatus(to)) return { ok: false, error: "Not a bucket." };

  if (to === "new") await undecideReport(id);
  else await decideReport(id, to, gate.userId);

  revalidatePath("/admin/reports");
  revalidatePath("/reports");
  revalidatePath("/report");
  return { ok: true };
}

/* -------------------------------------------------------------------------
   The database
   ------------------------------------------------------------------------- */

export interface Branch {
  ok: boolean;
  error?: string;
  columns?: ColumnInfo[];
  page?: Page;
}

/**
 * One table's shape and a page of its rows, fetched when its branch opens.
 *
 * The tree lists every table up front because the count is the interesting
 * part of a table you have not opened - but reading all of them would be
 * forty queries to Nuremberg to draw a screen where thirty-nine branches are
 * shut. So a branch costs a round trip at the moment somebody asks for it,
 * and nothing before.
 */
export async function openTable(
  table: string,
  offset = 0,
  limit = 25,
): Promise<Branch> {
  const gate = await admin();
  if (!gate.ok) return { ok: false, error: gate.error };

  // The name arrives from the browser and goes into SQL, so it is checked
  // against sqlite_master rather than trusted - readTable and columnsOf both
  // ask, and both answer empty for a table that is not there.
  const [columns, page] = await Promise.all([
    columnsOf(table),
    readTable(table, limit, offset),
  ]);
  if (columns.length === 0) return { ok: false, error: "No such table." };

  return { ok: true, columns, page };
}

export async function query(sql: string): Promise<QueryResult> {
  const gate = await admin();
  if (!gate.ok) return { ok: false, error: gate.error };
  return runQuery(sql);
}

export async function editCell(
  table: string,
  rowid: number,
  column: string,
  value: string | null,
): Promise<AdminResult> {
  const gate = await admin();
  if (!gate.ok) return gate;

  const done = await updateCell(table, rowid, column, value);
  if (!done.ok) return { ok: false, error: done.error };

  revalidatePath("/admin/db");
  // The rest of the app is reading this data too, and a corrected row that
  // only shows on the admin screen is a correction nobody sees.
  revalidatePath("/pantry");
  revalidatePath("/recipes");
  return { ok: true, message: `${table}.${column} saved.` };
}

export async function removeRow(
  table: string,
  rowid: number,
): Promise<AdminResult> {
  const gate = await admin();
  if (!gate.ok) return gate;

  const done = await deleteRow(table, rowid);
  if (!done.ok) return { ok: false, error: done.error };

  revalidatePath("/admin/db");
  revalidatePath("/pantry");
  return { ok: true, message: "Row deleted." };
}

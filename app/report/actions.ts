"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { storePhoto } from "@/lib/photos";
import { record } from "@/lib/usage";
import {
  attachReportPhoto,
  decideReport,
  fileReport,
  isAdmin,
  isReportKind,
  undecideReport,
  type ReportStatus,
} from "@/lib/reports";

export interface FileReportResult {
  ok: boolean;
  error?: string;
  /** Photos that would not upload. The report is still filed - see below. */
  photoErrors?: string[];
}

const MAX_PHOTOS = 4;

/**
 * Files a report.
 *
 * A failed photo never fails the report. Somebody who has written out what
 * went wrong and attached a screenshot that Blob refused should not be handed
 * their words back and asked to type them again - the words are the report and
 * the picture is corroboration. What failed is said plainly afterwards.
 */
export async function submitReport(form: FormData): Promise<FileReportResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const rawKind = form.get("kind");
  const kind = isReportKind(rawKind) ? rawKind : "bug";

  const title = String(form.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Say in one line what it is." };
  if (title.length > 160) {
    return { ok: false, error: "Keep the one-liner under 160 characters." };
  }

  const body = String(form.get("body") ?? "").trim();
  const page = String(form.get("page") ?? "").trim();
  const agent = String(form.get("agent") ?? "").trim();

  const id = await fileReport({
    authorId: session.user.id,
    kind,
    title,
    body: body || null,
    // Where they were standing. The single most useful field on a bug report
    // and the one nobody ever remembers to include, so the form fills it in.
    page: page || null,
    agent: agent || null,
  });

  const photoErrors: string[] = [];
  const files = form
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .slice(0, MAX_PHOTOS);

  for (const [index, file] of files.entries()) {
    // "step" rather than "hero": a screenshot of a phone is tall, and the hero
    // size would upscale nothing and cost bandwidth for no reason.
    const stored = await storePhoto(file, "step", `reports/${id}`);
    if (stored.ok && stored.url) await attachReportPhoto(id, stored.url, index);
    else photoErrors.push(stored.error ?? "A photo would not upload.");
  }

  record("report.file", session.user.id, page || "/report");

  revalidatePath("/report");
  revalidatePath("/reports");

  return { ok: true, ...(photoErrors.length > 0 ? { photoErrors } : {}) };
}

/** Approve or turn one down. Admin only - the whole point is who decides. */
export async function decide(
  id: number,
  status: Exclude<ReportStatus, "new">,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };
  if (!(await isAdmin(session.user.id))) {
    return { ok: false, error: "Not yours to decide." };
  }

  await decideReport(id, status, session.user.id);
  revalidatePath("/reports");
  return { ok: true };
}

/** Back into the queue, for a card that was swiped by accident. */
export async function putBack(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };
  if (!(await isAdmin(session.user.id))) {
    return { ok: false, error: "Not yours to decide." };
  }

  await undecideReport(id);
  revalidatePath("/reports");
  return { ok: true };
}

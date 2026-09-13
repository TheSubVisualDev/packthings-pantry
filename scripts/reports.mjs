// Reads and closes off what people have written in.
//
//   node --env-file=.env.local scripts/reports.mjs list [status]
//   node --env-file=.env.local scripts/reports.mjs show <id>
//   node --env-file=.env.local scripts/reports.mjs done <id> "what was done"
//   node --env-file=.env.local scripts/reports.mjs purge
//   node --env-file=.env.local scripts/reports.mjs admin [handle]
//
// The triage screen decides; this is how the decisions get acted on. Kept as a
// script rather than an endpoint because the thing acting on them is an agent
// with a checkout, not a browser with a session - and because "delete every
// turned-down report" is not an operation that should have a URL.
//
// `list` without a status gives the approved ones, because that is the queue
// of work and the other three are reference.

import { createClient } from "@libsql/client";

const client = createClient({
  url: (process.env.LIBSQL_URL ?? "").replace(/^https:/, "wss:").replace(/^http:/, "ws:"),
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

const [command = "list", ...rest] = process.argv.slice(2);

const STATUSES = ["new", "approved", "rejected", "done"];

/** A report with its photos and who wrote it, as one object. */
async function load(where, args) {
  const rows = await client.execute({
    sql: `SELECT r.*, u.handle AS author_handle
          FROM reports r
          LEFT JOIN users u ON u.id = r.author_id
          ${where}
          ORDER BY r.created_at, r.id`,
    args,
  });

  if (rows.rows.length === 0) return [];

  const photos = await client.execute({
    sql: `SELECT report_id, url FROM report_photos
          WHERE report_id IN (${rows.rows.map(() => "?").join(", ")})
          ORDER BY position, id`,
    args: rows.rows.map((row) => row.id),
  });

  const byReport = new Map();
  for (const row of photos.rows) {
    byReport.set(row.report_id, [...(byReport.get(row.report_id) ?? []), row.url]);
  }

  return rows.rows.map((row) => ({ ...row, photos: byReport.get(row.id) ?? [] }));
}

function print(report, full) {
  const when = String(report.created_at).slice(0, 10);
  console.log(
    `\n#${report.id}  [${report.kind}]  ${report.status}  @${report.author_handle ?? "gone"}  ${when}`,
  );
  console.log(`  ${report.title}`);
  if (full && report.body) {
    console.log(
      report.body
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    );
  }
  if (report.page) console.log(`  on: ${report.page}`);
  if (full && report.agent) console.log(`  browser: ${report.agent}`);
  for (const url of report.photos) console.log(`  photo: ${url}`);
  if (report.outcome) console.log(`  outcome: ${report.outcome}`);
}

switch (command) {
  case "list": {
    const status = rest[0] ?? "approved";
    if (status !== "all" && !STATUSES.includes(status)) {
      console.error(`Unknown status "${status}". One of: ${STATUSES.join(", ")}, all`);
      process.exit(1);
    }

    const reports =
      status === "all"
        ? await load("", [])
        : await load("WHERE r.status = ?", [status]);

    if (reports.length === 0) {
      console.log(`Nothing ${status === "all" ? "at all" : `with status ${status}`}.`);
      break;
    }
    // Full detail on the approved queue: it is about to be worked on, and a
    // second command to read the body is a second command nobody runs.
    for (const report of reports) print(report, status === "approved");
    console.log(`\n${reports.length} total`);
    break;
  }

  case "show": {
    const id = Number(rest[0]);
    if (!Number.isInteger(id)) {
      console.error("show needs a report id");
      process.exit(1);
    }
    const [report] = await load("WHERE r.id = ?", [id]);
    if (!report) {
      console.error(`No report #${id}`);
      process.exit(1);
    }
    print(report, true);
    break;
  }

  case "done": {
    const id = Number(rest[0]);
    const outcome = rest.slice(1).join(" ").trim();
    if (!Number.isInteger(id) || !outcome) {
      console.error('done needs an id and a note: done 4 "fixed in abc1234"');
      process.exit(1);
    }
    // Only from approved. Marking a report done that was never approved would
    // put work in front of a decision, which is the thing the queue exists to
    // stop - and it would do it silently.
    const result = await client.execute({
      sql: `UPDATE reports SET status = 'done', outcome = ?
            WHERE id = ? AND status = 'approved'`,
      args: [outcome, id],
    });
    if (result.rowsAffected === 0) {
      console.error(`#${id} is not an approved report. Nothing changed.`);
      process.exit(1);
    }
    console.log(`#${id} done: ${outcome}`);
    break;
  }

  case "purge": {
    /**
     * Clears out the turned-down ones.
     *
     * Deliberately a separate command that has to be asked for, and
     * deliberately not what "not for now" does on its own. An idea that keeps
     * being asked for after it was turned down is itself information, and the
     * only way to notice that is for the old one to still be there.
     */
    const count = await client.execute(
      "SELECT COUNT(*) AS n FROM reports WHERE status = 'rejected'",
    );
    const n = Number(count.rows[0].n);
    if (n === 0) {
      console.log("Nothing turned down to clear.");
      break;
    }
    // report_photos cascades.
    await client.execute("DELETE FROM reports WHERE status = 'rejected'");
    console.log(`Cleared ${n} turned-down ${n === 1 ? "report" : "reports"}.`);
    break;
  }

  case "admin": {
    /**
     * Who gets to decide. Named rather than guessed at.
     *
     * The migration hands it to the lowest user id, which is right for an
     * invite-only app where the first account set the thing up - but the
     * person who runs a pantry and the account that created it are not always
     * the same account, and this is how that gets corrected without a SQL
     * client.
     */
    const handle = (rest[0] ?? "").replace(/^@/, "").toLowerCase();
    if (!handle) {
      const who = await client.execute(
        "SELECT handle FROM users WHERE is_admin = 1 ORDER BY id",
      );
      console.log(
        who.rows.length
          ? `admin: ${who.rows.map((row) => `@${row.handle}`).join(", ")}`
          : "admin: nobody",
      );
      break;
    }

    const result = await client.execute({
      sql: "UPDATE users SET is_admin = 1 WHERE LOWER(handle) = ? RETURNING handle",
      args: [handle],
    });
    if (result.rows.length === 0) {
      console.error(`No user @${handle}.`);
      process.exit(1);
    }
    console.log(`@${result.rows[0].handle} can now go through reports.`);
    break;
  }

  default:
    console.error(
      `Unknown command "${command}". One of: list, show, done, purge, admin`,
    );
    process.exit(1);
}

process.exit(0);

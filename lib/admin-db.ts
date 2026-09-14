import { getDb, plainRows } from "./db";

/**
 * Looking at the database from inside the app.
 *
 * There is no console on the Hetzner box worth opening on a phone, and the
 * alternative to this is a psql session over SSH at the exact moment somebody
 * wants to know why one row looks wrong. So: a table browser, a SELECT box,
 * and a way to correct a single row.
 *
 * What it refuses is the point. This runs as whoever is signed in as admin,
 * against the live pantry, with no undo - so the free-text box takes reads and
 * nothing else, writes go one named column at a time, and the two columns that
 * carry the container rule are not editable here at all. AGENTS.md keeps a
 * count of the bugs caused by writing to `quantity` directly and it is at
 * five; a text box on the internet would be a sixth waiting to happen.
 */

/** Rows come back as loose JSON - a cell can be any of these. */
export type Cell = string | number | boolean | null | Uint8Array;

export interface TableInfo {
  name: string;
  rows: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

/** Every table, with how much is in it. Sorted by size: big ones are the news. */
export async function listTables(): Promise<TableInfo[]> {
  const names = plainRows<{ name: string }>(
    await getDb().execute(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    ),
  );

  const counted: TableInfo[] = [];
  for (const { name } of names) {
    // The name comes from sqlite_master rather than from a request, so it
    // cannot be anything but a real table - but it is still quoted, because
    // "the value is safe" is the sentence before every injection.
    const result = await getDb().execute(
      `SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`,
    );
    counted.push({ name, rows: Number((result.rows[0] as unknown as { n: number }).n) });
  }

  return counted.sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
}

/** Whether this is a table that exists, asked of the database rather than a list. */
export async function tableExists(name: string): Promise<boolean> {
  const result = await getDb().execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return result.rows.length > 0;
}

export async function columnsOf(table: string): Promise<ColumnInfo[]> {
  if (!(await tableExists(table))) return [];
  const rows = plainRows<{ name: string; type: string; notnull: number; pk: number }>(
    await getDb().execute(`PRAGMA table_info("${table.replace(/"/g, '""')}")`),
  );
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    notnull: row.notnull === 1,
    pk: row.pk > 0,
  }));
}

export interface Page {
  columns: string[];
  rows: Record<string, Cell>[];
  total: number;
}

/**
 * A page of a table, newest first where there is anything to sort by.
 *
 * rowid rather than a primary key, because several tables here are keyed on
 * something else - products by barcode, shopping_list by id - and rowid is the
 * one thing every table in this schema has. It is also what makes a row
 * addressable for editing without knowing its key.
 */
export async function readTable(
  table: string,
  limit = 50,
  offset = 0,
): Promise<Page> {
  if (!(await tableExists(table))) return { columns: [], rows: [], total: 0 };

  const quoted = `"${table.replace(/"/g, '""')}"`;
  const counted = await getDb().execute(`SELECT COUNT(*) AS n FROM ${quoted}`);
  const total = Number((counted.rows[0] as unknown as { n: number }).n);

  const result = await getDb().execute({
    sql: `SELECT rowid AS _rowid, * FROM ${quoted} ORDER BY rowid DESC LIMIT ? OFFSET ?`,
    args: [Math.min(200, Math.max(1, limit)), Math.max(0, offset)],
  });

  return {
    columns: result.columns,
    rows: plainRows<Record<string, Cell>>(result),
    total,
  };
}

export interface QueryResult {
  ok: boolean;
  error?: string;
  columns?: string[];
  rows?: Record<string, Cell>[];
  /** How long the database took, which is the other thing worth knowing. */
  ms?: number;
}

/**
 * A statement typed by a person, run only if it is a read.
 *
 * The check is deliberately crude and deliberately strict: one statement, and
 * it must begin with SELECT, WITH or PRAGMA. Not a SQL parser - a parser here
 * would be a thing to outsmart, and the cost of being wrong is somebody's
 * pantry. Anything that wants to write goes through updateCell, which names
 * its table, its row and its column.
 */
export async function runQuery(sql: string): Promise<QueryResult> {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return { ok: false, error: "Nothing to run." };

  // One statement. A semicolon in the middle is either two statements or a
  // string containing one, and neither is worth the argument.
  if (trimmed.includes(";")) {
    return { ok: false, error: "One statement at a time - no semicolons." };
  }

  if (!/^\s*(select|with|pragma|explain)\b/i.test(trimmed)) {
    return {
      ok: false,
      error:
        "Reads only. Use the row editor to change something - it names the table, the row and the column, which a text box cannot.",
    };
  }

  const started = Date.now();
  try {
    const result = await getDb().execute(trimmed);
    return {
      ok: true,
      columns: result.columns,
      rows: plainRows<Record<string, Cell>>(result),
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That would not run.",
    };
  }
}

/**
 * Columns this tool will not write, whatever anybody types.
 *
 * `quantity` and `sealed_count` are the container rule. Since containers
 * arrived, quantity means what is in the OPEN one and the two move together
 * under rules written down twice - in ADJUST_SQL and in applyDelta - which
 * `npm run check:cascade` holds to agreeing over 480 cases. A form that sets
 * either directly bypasses both and the count is quietly wrong from then on.
 * AGENTS.md keeps a tally of that bug; it is at five.
 */
const OFF_LIMITS: Record<string, string[]> = {
  items: ["quantity", "sealed_count"],
  users: ["password_hash", "api_token"],
};

/** Why a column cannot be edited here, or null when it can. */
export function refusalFor(table: string, column: string): string | null {
  if (column === "_rowid" || column === "rowid") {
    return "The row's own address - changing it would move the row, not edit it.";
  }
  if (table === "items" && OFF_LIMITS.items.includes(column)) {
    return "Stock levels move through the adjust control, which keeps the open container and the sealed ones in step. Setting this directly is the bug AGENTS.md keeps a count of.";
  }
  if (table === "users" && OFF_LIMITS.users.includes(column)) {
    return "A credential. Rotate it from settings, where the new one is shown to the person it belongs to.";
  }
  return null;
}

/** Writes one column of one row, addressed by rowid. */
export async function updateCell(
  table: string,
  rowid: number,
  column: string,
  value: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await tableExists(table))) return { ok: false, error: "No such table." };

  const refusal = refusalFor(table, column);
  if (refusal) return { ok: false, error: refusal };

  const columns = await columnsOf(table);
  const target = columns.find((each) => each.name === column);
  if (!target) return { ok: false, error: "No such column." };

  if (value === null && target.notnull) {
    return { ok: false, error: `${column} cannot be empty.` };
  }

  /**
   * Typed by the column rather than by what the string looks like.
   *
   * "007" in a TEXT column is "007" and in an INTEGER column is 7, and
   * guessing from the value would turn a postcode into a number one day.
   */
  let typed: string | number | null = value;
  if (value !== null && /INT|REAL|NUM|DEC|FLOA|DOUB/i.test(target.type)) {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) {
      return { ok: false, error: `${column} takes a number.` };
    }
    typed = asNumber;
  }

  try {
    await getDb().execute({
      sql: `UPDATE "${table.replace(/"/g, '""')}" SET "${column.replace(/"/g, '""')}" = ? WHERE rowid = ?`,
      args: [typed, rowid],
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That would not save.",
    };
  }
}

/** Removes one row, addressed by rowid. Cascades are the schema's business. */
export async function deleteRow(
  table: string,
  rowid: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await tableExists(table))) return { ok: false, error: "No such table." };

  try {
    await getDb().execute({
      sql: `DELETE FROM "${table.replace(/"/g, '""')}" WHERE rowid = ?`,
      args: [rowid],
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That would not delete.",
    };
  }
}

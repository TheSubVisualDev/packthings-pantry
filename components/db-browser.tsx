"use client";

import { useState, useTransition } from "react";
import { Play, Save, Trash2, X } from "lucide-react";
import { editCell, query, removeRow, type AdminResult } from "@/app/admin/actions";
import { refusalFor, type Cell, type QueryResult } from "@/lib/admin-db";

/**
 * The database, on a phone.
 *
 * The alternative to this is an SSH session to Nuremberg at the exact moment
 * somebody wants to know why one row looks wrong, which in practice means the
 * question does not get asked. It is a table browser, a read-only query box,
 * and a way to correct a single cell.
 *
 * Two rules, both visible in the interface rather than only in the code. The
 * query box takes reads and says so when it refuses. And a cell that must not
 * be edited here says why it must not, rather than failing when you try - a
 * control that is present and refuses is worse than one that explains itself.
 */

/** A value as a cell, short enough to fit and honest about what it is. */
function show(value: Cell): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Uint8Array) return `${value.length} bytes`;
  const text = String(value);
  return text.length > 120 ? text.slice(0, 120) + "…" : text;
}

export function DbBrowser({
  tables,
  table,
  columns,
  rows,
  total,
}: {
  tables: { name: string; rows: number }[];
  table: string | null;
  columns: string[];
  rows: Record<string, Cell>[];
  total: number;
}) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [edit, setEdit] = useState<{ rowid: number; column: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<AdminResult | null>(null);
  const [pending, startWorking] = useTransition();

  function run() {
    setResult(null);
    startWorking(async () => setResult(await query(sql)));
  }

  function save() {
    if (!edit || !table) return;
    setSaved(null);
    startWorking(async () => {
      const done = await editCell(
        table,
        edit.rowid,
        edit.column,
        // An emptied box means NULL rather than the empty string: "" and
        // "nothing here" are different answers and the column knows which it
        // allows.
        draft === "" ? null : draft,
      );
      setSaved(done);
      if (done.ok) setEdit(null);
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-xs font-bold tracking-[0.08em] text-label uppercase">
          Ask it something
        </h2>
        <textarea
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="SELECT name, quantity FROM items WHERE quantity = 0"
          aria-label="A read-only query"
          className="w-full rounded-[14px] border border-border bg-page px-4 py-3 font-[family-name:var(--font-plex-mono)] text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={pending || !sql.trim()}
            className="flex h-10 items-center gap-1.5 rounded-[12px] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={3} />
            {pending ? "…" : "Run"}
          </button>
          <span className="text-xs font-semibold text-muted-foreground">
            Reads only. Changes go through a cell below.
          </span>
        </div>

        {result && !result.ok && (
          <p role="alert" className="mt-2 text-sm font-bold text-destructive">
            {result.error}
          </p>
        )}

        {result?.ok && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {result.rows?.length ?? 0} rows in {result.ms}ms
            </p>
            <Grid columns={result.columns ?? []} rows={result.rows ?? []} />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-[0.08em] text-label uppercase">
          Tables
        </h2>
        {/* Links, so a table is a place you can send somebody or come back to. */}
        <div className="flex flex-wrap gap-1.5">
          {tables.map((each) => (
            <a
              key={each.name}
              href={`/admin/db?table=${encodeURIComponent(each.name)}`}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 font-[family-name:var(--font-plex-mono)] text-xs font-bold ${
                each.name === table
                  ? "bg-ink text-background"
                  : "bg-card text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              }`}
            >
              {each.name}
              <span className="tabular-nums opacity-60">{each.rows}</span>
            </a>
          ))}
        </div>
      </section>

      {table && (
        <section>
          <h2 className="mb-1 text-xs font-bold tracking-[0.08em] text-label uppercase">
            {table}
          </h2>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Newest {rows.length} of {total}. Tap a cell to change it.
          </p>

          {saved?.message && (
            <p className="mb-2 text-sm font-bold text-primary">{saved.message}</p>
          )}
          {saved && !saved.ok && saved.error && (
            <p role="alert" className="mb-2 text-sm font-bold text-destructive">
              {saved.error}
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((row) => {
              const rowid = Number(row._rowid);
              return (
                <li
                  key={rowid}
                  className="rounded-[14px] bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-[family-name:var(--font-plex-mono)] text-xs font-bold text-muted-foreground">
                      rowid {rowid}
                    </span>
                    <DeleteRow table={table} rowid={rowid} onDone={setSaved} />
                  </div>

                  <dl className="mt-1.5 space-y-0.5">
                    {columns
                      .filter((column) => column !== "_rowid")
                      .map((column) => {
                        const refusal = refusalFor(table, column);
                        const editing =
                          edit?.rowid === rowid && edit.column === column;

                        return (
                          <div key={column} className="flex items-baseline gap-2">
                            <dt className="w-28 shrink-0 truncate font-[family-name:var(--font-plex-mono)] text-[11px] font-bold text-muted-foreground">
                              {column}
                            </dt>
                            <dd className="min-w-0 flex-1">
                              {editing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    value={draft}
                                    autoFocus
                                    onChange={(event) => setDraft(event.target.value)}
                                    className="min-w-0 flex-1 rounded-[8px] border border-primary bg-page px-2 py-1 font-[family-name:var(--font-plex-mono)] text-xs outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={save}
                                    disabled={pending}
                                    aria-label="Save"
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                                  >
                                    <Save className="h-3.5 w-3.5" strokeWidth={3} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEdit(null)}
                                    aria-label="Cancel"
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-chip text-muted-foreground"
                                  >
                                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                                  </button>
                                </div>
                              ) : refusal ? (
                                /* Present and inert, with the reason attached.
                                   A control that refuses when pressed teaches
                                   nothing; one that says why before you press
                                   it teaches the rule. */
                                <span
                                  title={refusal}
                                  className="block truncate font-[family-name:var(--font-plex-mono)] text-xs text-muted-foreground/70"
                                >
                                  {show(row[column])}{" "}
                                  <span className="text-[10px] font-bold">locked</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSaved(null);
                                    setEdit({ rowid, column });
                                    setDraft(
                                      row[column] === null ? "" : String(row[column]),
                                    );
                                  }}
                                  className="block w-full truncate text-left font-[family-name:var(--font-plex-mono)] text-xs hover:text-primary"
                                >
                                  {show(row[column])}
                                </button>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A results grid that scrolls sideways rather than squeezing. */
function Grid({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, Cell>[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm font-semibold text-muted-foreground">No rows.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[12px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <table className="w-full text-left font-[family-name:var(--font-plex-mono)] text-xs">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-bold whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border last:border-b-0">
              {columns.map((column) => (
                <td key={column} className="px-3 py-1.5 whitespace-nowrap">
                  {show(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Deleting a row, which asks first because there is no undo behind it. */
function DeleteRow({
  table,
  rowid,
  onDone,
}: {
  table: string;
  rowid: number;
  onDone: (result: AdminResult) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, startWorking] = useTransition();

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label={`Delete row ${rowid}`}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-chip hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startWorking(async () => {
            onDone(await removeRow(table, rowid));
            setAsking(false);
          })
        }
        className="h-7 rounded-full bg-destructive px-2.5 text-[11px] font-extrabold text-white"
      >
        {pending ? "…" : "Delete"}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="h-7 rounded-full bg-chip px-2.5 text-[11px] font-bold"
      >
        Keep
      </button>
    </span>
  );
}

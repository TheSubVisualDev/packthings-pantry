"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Play, Save, Trash2, X } from "lucide-react";
import {
  editCell,
  openTable,
  query,
  removeRow,
  type AdminResult,
} from "@/app/admin/actions";
import type { Cell, ColumnInfo, Page, QueryResult, TableInfo } from "@/lib/admin-db";
import { refusalFor } from "@/lib/admin-db";

/**
 * The database as a tree.
 *
 * It was a strip of table pills above a flat list of row cards, which answered
 * "show me this table" and nothing else: to see what the database was made of
 * you picked a table, read it, went back, picked another. The shape of the
 * thing - forty tables, what is in them, what their columns are - was never on
 * screen at once, and that shape is the question somebody standing in a
 * kitchen with a phone actually has.
 *
 * So: table, then columns and rows under it, then cells under a row. Every
 * branch is shut until asked for, because opening one costs a round trip to
 * Nuremberg and drawing forty shut branches costs one query that already ran.
 *
 * What it refuses is unchanged and still visible rather than only enforced:
 * the query box takes reads and says so, a cell that must not be edited here
 * says why before you press it, and deleting a row asks first.
 */

/** A value as a cell, short enough to fit and honest about what it is. */
function show(value: Cell): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Uint8Array) return `${value.length} bytes`;
  const text = String(value);
  return text.length > 120 ? text.slice(0, 120) + "…" : text;
}

/**
 * The column worth putting next to the rowid on a shut row.
 *
 * A row addressed only by rowid is a row you have to open to identify, which
 * makes the tree a guessing game. These are the names this schema actually
 * uses for the human-readable one, in the order they are worth trying.
 */
const NAMING = ["name", "title", "handle", "label", "action", "email", "code"];

function summarise(row: Record<string, Cell>, columns: string[]): string | null {
  const named = NAMING.find(
    (candidate) => columns.includes(candidate) && row[candidate] !== null,
  );
  return named ? show(row[named]) : null;
}

const MONO = "font-[family-name:var(--font-plex-mono)]";
/** The line down the left of a branch - what makes a nested list read as a tree. */
const BRANCH = "ml-[11px] border-l border-border pl-3";

interface Loaded {
  columns: ColumnInfo[];
  page: Page;
}

export function DbTree({
  tables,
  preloaded,
}: {
  tables: TableInfo[];
  /** A table named in the URL, read on the server so a link opens on its branch. */
  preloaded: { table: string; columns: ColumnInfo[]; page: Page } | null;
}) {
  const [open, setOpen] = useState<string[]>(
    preloaded ? [preloaded.table] : [],
  );
  const [loaded, setLoaded] = useState<Record<string, Loaded>>(
    preloaded
      ? { [preloaded.table]: { columns: preloaded.columns, page: preloaded.page } }
      : {},
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [, startWorking] = useTransition();

  async function load(table: string, limit: number) {
    setBusy(table);
    const branch = await openTable(table, 0, limit);
    setBusy(null);
    if (!branch.ok || !branch.columns || !branch.page) {
      setFailed((was) => ({ ...was, [table]: branch.error ?? "Would not open." }));
      return;
    }
    setFailed((was) => ({ ...was, [table]: "" }));
    setLoaded((was) => ({
      ...was,
      [table]: { columns: branch.columns!, page: branch.page! },
    }));
  }

  function toggle(table: string) {
    const shut = !open.includes(table);
    setOpen((was) =>
      shut ? [...was, table] : was.filter((each) => each !== table),
    );

    // The URL follows the last branch opened, so the screen somebody is
    // looking at is a screen they can send. replaceState rather than a router
    // push: this is where you are, not somewhere you went, and a back button
    // that walks you out through six tables you expanded is a back button
    // nobody can use.
    if (shut) {
      window.history.replaceState(
        null,
        "",
        `/admin/db?table=${encodeURIComponent(table)}`,
      );
      if (!loaded[table]) startWorking(() => load(table, 25));
    }
  }

  /** After a write: ask the database what it stored rather than guessing. */
  function refresh(table: string) {
    const showing = loaded[table]?.page.rows.length ?? 25;
    startWorking(() => load(table, Math.max(25, showing)));
  }

  return (
    <div className="space-y-5">
      <QueryBox />

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-[0.08em] text-label uppercase">
          {tables.length} tables
        </h2>

        <ul className="overflow-hidden rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {tables.map((table) => {
            const showing = open.includes(table.name);
            const branch = loaded[table.name];

            return (
              <li
                key={table.name}
                className="border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => toggle(table.name)}
                  aria-expanded={showing}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-chip"
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showing ? "rotate-90" : ""}`}
                    strokeWidth={3}
                  />
                  <span className={`${MONO} min-w-0 flex-1 truncate text-sm font-bold`}>
                    {table.name}
                  </span>
                  <span
                    className={`${MONO} shrink-0 text-xs font-bold tabular-nums ${
                      table.rows === 0 ? "text-muted-foreground/50" : "text-muted-foreground"
                    }`}
                  >
                    {table.rows}
                  </span>
                </button>

                {showing && (
                  <div className={`${BRANCH} mr-3 mb-3`}>
                    {busy === table.name && !branch && (
                      <p className="py-2 text-xs font-semibold text-muted-foreground">
                        Reading…
                      </p>
                    )}
                    {failed[table.name] && (
                      <p role="alert" className="py-2 text-xs font-bold text-destructive">
                        {failed[table.name]}
                      </p>
                    )}
                    {branch && (
                      <TableBranch
                        table={table.name}
                        columns={branch.columns}
                        page={branch.page}
                        busy={busy === table.name}
                        onMore={() =>
                          startWorking(() =>
                            load(table.name, branch.page.rows.length + 25),
                          )
                        }
                        onChanged={() => refresh(table.name)}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Under one table: what its columns are, and the rows themselves. */
function TableBranch({
  table,
  columns,
  page,
  busy,
  onMore,
  onChanged,
}: {
  table: string;
  columns: ColumnInfo[];
  page: Page;
  busy: boolean;
  onMore: () => void;
  onChanged: () => void;
}) {
  const [shape, setShape] = useState(false);
  const names = page.columns.filter((column) => column !== "_rowid");

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setShape((was) => !was)}
        aria-expanded={shape}
        className="flex items-center gap-1.5 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${shape ? "rotate-90" : ""}`}
          strokeWidth={3}
        />
        {columns.length} columns
      </button>

      {shape && (
        <ul className={`${BRANCH} ${MONO} space-y-0.5 py-1 text-[11px] text-muted-foreground`}>
          {columns.map((column) => (
            <li key={column.name}>
              <span className="font-bold text-foreground">{column.name}</span>{" "}
              <span className="opacity-70">{column.type || "any"}</span>
              {column.pk && <span className="ml-1 font-bold text-primary">pk</span>}
              {column.notnull && <span className="ml-1 opacity-60">not null</span>}
            </li>
          ))}
        </ul>
      )}

      {page.total === 0 ? (
        <p className="py-1 text-xs font-semibold text-muted-foreground">
          No rows.
        </p>
      ) : (
        <>
          <p className="pt-1.5 pb-1 text-xs font-bold text-muted-foreground">
            newest {page.rows.length} of {page.total}
          </p>
          <ul>
            {page.rows.map((row) => (
              <Row
                key={Number(row._rowid)}
                table={table}
                row={row}
                names={names}
                onChanged={onChanged}
              />
            ))}
          </ul>

          {page.rows.length < page.total && (
            <button
              type="button"
              onClick={onMore}
              disabled={busy}
              className="mt-1.5 h-8 rounded-full bg-chip px-3 text-[11px] font-extrabold disabled:opacity-40"
            >
              {busy ? "…" : "25 more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** One row: shut, it is an identity; open, it is its cells. */
function Row({
  table,
  row,
  names,
  onChanged,
}: {
  table: string;
  row: Record<string, Cell>;
  names: string[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<AdminResult | null>(null);
  const [pending, startWorking] = useTransition();

  const rowid = Number(row._rowid);
  const summary = summarise(row, names);

  function save(column: string) {
    setSaved(null);
    startWorking(async () => {
      const done = await editCell(
        table,
        rowid,
        column,
        // An emptied box means NULL rather than the empty string: "" and
        // "nothing here" are different answers and the column knows which it
        // allows.
        draft === "" ? null : draft,
      );
      setSaved(done);
      if (done.ok) {
        setEdit(null);
        onChanged();
      }
    });
  }

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 py-1.5 text-left hover:text-primary"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          strokeWidth={3}
        />
        <span className={`${MONO} shrink-0 text-[11px] font-bold text-muted-foreground`}>
          {rowid}
        </span>
        <span className={`${MONO} min-w-0 flex-1 truncate text-xs`}>
          {summary ?? <span className="text-muted-foreground">row</span>}
        </span>
      </button>

      {open && (
        <div className={`${BRANCH} pb-2`}>
          {saved?.message && (
            <p className="mb-1 text-xs font-bold text-primary">{saved.message}</p>
          )}
          {saved && !saved.ok && saved.error && (
            <p role="alert" className="mb-1 text-xs font-bold text-destructive">
              {saved.error}
            </p>
          )}

          <dl className="space-y-0.5">
            {names.map((column) => {
              const refusal = refusalFor(table, column);
              const editing = edit === column;

              return (
                <div key={column} className="flex items-baseline gap-2">
                  <dt
                    className={`${MONO} w-24 shrink-0 truncate text-[11px] font-bold text-muted-foreground`}
                  >
                    {column}
                  </dt>
                  <dd className="min-w-0 flex-1">
                    {editing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={draft}
                          autoFocus
                          onChange={(event) => setDraft(event.target.value)}
                          className={`${MONO} min-w-0 flex-1 rounded-[8px] border border-primary bg-page px-2 py-1 text-xs outline-none`}
                        />
                        <button
                          type="button"
                          onClick={() => save(column)}
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
                      /* Present and inert, with the reason attached. A control
                         that refuses when pressed teaches nothing; one that
                         says why before you press it teaches the rule. */
                      <span
                        title={refusal}
                        className={`${MONO} block truncate text-xs text-muted-foreground/70`}
                      >
                        {show(row[column])}{" "}
                        <span className="text-[10px] font-bold">locked</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSaved(null);
                          setEdit(column);
                          setDraft(row[column] === null ? "" : String(row[column]));
                        }}
                        className={`${MONO} block w-full truncate text-left text-xs hover:text-primary`}
                      >
                        {show(row[column])}
                      </button>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          <DeleteRow
            table={table}
            rowid={rowid}
            onDone={(result) => {
              setSaved(result);
              if (result.ok) onChanged();
            }}
          />
        </div>
      )}
    </li>
  );
}

/** A read-only query box, which says so rather than failing when you try. */
function QueryBox() {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [pending, startWorking] = useTransition();

  return (
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
        className={`${MONO} w-full rounded-[14px] border border-border bg-page px-4 py-3 text-sm outline-none focus:border-primary`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setResult(null);
            startWorking(async () => setResult(await query(sql)));
          }}
          disabled={pending || !sql.trim()}
          className="flex h-10 items-center gap-1.5 rounded-[12px] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-40"
        >
          <Play className="h-3.5 w-3.5" strokeWidth={3} />
          {pending ? "…" : "Run"}
        </button>
        <span className="text-xs font-semibold text-muted-foreground">
          Reads only. Changes go through a cell in the tree.
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
    return <p className="text-sm font-semibold text-muted-foreground">No rows.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[12px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <table className={`${MONO} w-full text-left text-xs`}>
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
        className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
        Delete row {rowid}
      </button>
    );
  }

  return (
    <span className="mt-1.5 flex items-center gap-1.5">
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DbBrowser } from "@/components/db-browser";
import { SiteHeader } from "@/components/site-header";
import { columnsOf, listTables, readTable } from "@/lib/admin-db";
import { isAdmin } from "@/lib/reports";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Database · Admin",
};

/**
 * The database, from a phone.
 *
 * The alternative is an SSH session to Nuremberg at the exact moment somebody
 * wants to know why one row looks wrong, which in practice means the question
 * does not get asked and the row stays wrong.
 */
export default async function AdminDbPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const session = await requireUser();
  if (!session.ok) redirect("/login?next=%2Fadmin%2Fdb");
  if (!(await isAdmin(session.user.id))) notFound();

  const [{ table }, tables] = await Promise.all([searchParams, listTables()]);

  // Checked against the real list rather than trusted from the query string:
  // everything below takes this name and puts it in SQL.
  const wanted = table && tables.some((each) => each.name === table) ? table : null;

  const [page, columns] = wanted
    ? await Promise.all([readTable(wanted, 25), columnsOf(wanted)])
    : [{ columns: [], rows: [], total: 0 }, []];

  return (
    <>
      <SiteHeader active="none" meta={`${tables.length} tables`} />
      <main className="mx-auto w-full max-w-[840px] px-5 py-7 pb-32 sm:px-9">
        <Link
          href="/admin"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Admin
        </Link>
        <h1 className="mt-2 mb-1 text-[26px] font-extrabold tracking-[-0.02em]">
          Database
        </h1>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">
          Live, in Nuremberg, with no undo behind it. Reads are free; a change
          is one cell at a time.
        </p>

        <DbBrowser
          tables={tables}
          table={wanted}
          columns={page.columns}
          rows={page.rows}
          total={page.total}
        />

        {columns.length > 0 && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-bold text-muted-foreground">
              {wanted} columns
            </summary>
            <ul className="mt-2 space-y-0.5 font-[family-name:var(--font-plex-mono)] text-xs text-muted-foreground">
              {columns.map((column) => (
                <li key={column.name}>
                  {column.name} <span className="opacity-60">{column.type}</span>
                  {column.pk && <span className="ml-1 font-bold">pk</span>}
                  {column.notnull && <span className="ml-1 opacity-60">not null</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}

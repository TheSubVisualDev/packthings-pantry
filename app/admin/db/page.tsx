import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DbTree } from "@/components/db-tree";
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
 *
 * The page reads the table list and, where the URL names one, that table's
 * shape and first page of rows - so a link opens on the branch it names
 * rather than on a tree somebody has to walk again. Every other branch is the
 * tree's business and costs a round trip when it is asked for.
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

  const [columns, page] = wanted
    ? await Promise.all([columnsOf(wanted), readTable(wanted, 25)])
    : [[], null];

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

        <DbTree
          tables={tables}
          preloaded={
            wanted && page ? { table: wanted, columns, page } : null
          }
        />
      </main>
    </>
  );
}

import { connectionProtocol, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Where this function runs, how far it is from the database, and what that
 * distance costs when queries are issued the way pages actually issue them.
 *
 * The pantry is split across two clouds - Next on Vercel, sqld on a Hetzner box
 * in Nuremberg - so the round trip between them is the number that decides how
 * the whole app feels. The three timings below exist to separate the causes: a
 * bare round trip, five queries one after another, and five at once. If
 * sequential is five times parallel, the connection isn't being reused.
 *
 * Behind the auth gate like everything else under /api, and deliberately not
 * reporting the database URL or token: the host is the useful part.
 */

const PROBES = 5;
const BATCH = 5;

export async function GET() {
  const db = getDb();

  // One throwaway query first. The first round trip on a cold instance pays for
  // the connection, which isn't the number we're after.
  try {
    await db.execute("SELECT 1");
  } catch (error) {
    return Response.json(
      {
        region: process.env.VERCEL_REGION ?? "local",
        database: hostOf(process.env.LIBSQL_URL),
        protocol: connectionProtocol(),
        error: error instanceof Error ? error.message : "unreachable",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const single: number[] = [];
  for (let probe = 0; probe < PROBES; probe += 1) {
    const started = performance.now();
    await db.execute("SELECT 1");
    single.push(performance.now() - started);
  }
  single.sort((a, b) => a - b);

  const sequentialStart = performance.now();
  for (let query = 0; query < BATCH; query += 1) await db.execute("SELECT 1");
  const sequential = performance.now() - sequentialStart;

  const parallelStart = performance.now();
  await Promise.all(
    Array.from({ length: BATCH }, () => db.execute("SELECT 1")),
  );
  const parallel = performance.now() - parallelStart;

  return Response.json(
    {
      region: process.env.VERCEL_REGION ?? "local",
      database: hostOf(process.env.LIBSQL_URL),
      protocol: connectionProtocol(),
      oneQueryMs: {
        // Min is the honest floor - the one that can't be explained away by a
        // noisy neighbour or a garbage collection pause.
        min: round(single[0]),
        median: round(single[Math.floor(single.length / 2)]),
        max: round(single[single.length - 1]),
      },
      fiveSequentialMs: round(sequential),
      fiveParallelMs: round(parallel),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

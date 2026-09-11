import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Where this function runs, and how far it is from the database.
 *
 * The pantry is split across two clouds - Next on Vercel, sqld on a Hetzner box
 * in Nuremberg - so the single number that decides how the whole app feels is
 * the round trip between them. A page issuing five queries in sequence from the
 * wrong continent spends half a second doing nothing at all.
 *
 * Behind the auth gate like everything else under /api, and deliberately not
 * reporting the database URL or token: the host is the useful part and the
 * credentials are nobody's business.
 */

const PROBES = 5;

export async function GET() {
  const db = getDb();

  // One throwaway query first. The first round trip on a cold instance pays
  // for TLS and the connection, which isn't the number we're after.
  try {
    await db.execute("SELECT 1");
  } catch (error) {
    return Response.json(
      {
        region: process.env.VERCEL_REGION ?? "local",
        database: hostOf(process.env.LIBSQL_URL),
        error: error instanceof Error ? error.message : "unreachable",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const timings: number[] = [];
  for (let probe = 0; probe < PROBES; probe += 1) {
    const started = performance.now();
    await db.execute("SELECT 1");
    timings.push(performance.now() - started);
  }

  const sorted = [...timings].sort((a, b) => a - b);

  return Response.json(
    {
      region: process.env.VERCEL_REGION ?? "local",
      database: hostOf(process.env.LIBSQL_URL),
      roundTripMs: {
        // Min is the honest floor - it's the one that can't be explained away
        // by a noisy neighbour or a garbage collection pause.
        min: round(sorted[0]),
        median: round(sorted[Math.floor(sorted.length / 2)]),
        max: round(sorted[sorted.length - 1]),
      },
      probes: PROBES,
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

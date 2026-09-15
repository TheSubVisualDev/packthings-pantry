export const dynamic = "force-dynamic";

/**
 * Where the browser says what the policy would have blocked.
 *
 * The CSP in next.config.ts is report-only, so nothing is actually stopped -
 * these are the list of things that WOULD break if it were switched on, sent
 * by real browsers doing real things rather than guessed at from memory. The
 * scan screen alone reaches a CDN for WebAssembly and language data, and the
 * only honest way to know every origin this app touches is to watch it.
 *
 * Logged rather than stored. A violation is read once, while deciding what the
 * policy should say, and then never again - a table for it would be a table
 * that only ever grows. `vercel logs` is where these are read.
 *
 * Unauthenticated by necessity: the proxy lets this through because a browser
 * posting a violation report attaches no cookie and obeys no redirect. That
 * means anybody can post junk here, so it is rate-limited by being cheap -
 * nothing is written, nothing is fanned out, and a body that is not a
 * violation report is dropped without a word.
 */

/** Long enough for a real report, short enough not to be a place to put things. */
const MAX_BODY = 8_000;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length === 0 || raw.length > MAX_BODY) {
    return new Response(null, { status: 204 });
  }

  try {
    const body = JSON.parse(raw);
    // Browsers send either the old `csp-report` envelope or the newer
    // Reporting API array. Both are accepted: which one arrives depends on the
    // browser, and this app is used on whatever phone somebody has.
    const reports = Array.isArray(body)
      ? body.map((entry) => entry?.body ?? entry)
      : [body?.["csp-report"] ?? body];

    for (const report of reports) {
      if (!report) continue;
      const directive =
        report["effective-directive"] ??
        report["violated-directive"] ??
        report.effectiveDirective ??
        "unknown";
      const blocked =
        report["blocked-uri"] ?? report.blockedURL ?? "unknown";
      const on = report["document-uri"] ?? report.documentURL ?? "unknown";
      // One line, so a week of these greps into a list of origins to allow.
      console.warn(`csp-report ${directive} blocked=${blocked} on=${on}`);
    }
  } catch {
    // Not a report. Nothing to say about it.
  }

  return new Response(null, { status: 204 });
}

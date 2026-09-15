import { currentUser } from "@/lib/session";
import { isUsageAction, recordMany, type UsageAction } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Where the client tracker posts its taps.
 *
 * It exists because a tap is usually the last thing that happens on a page:
 * press the button, navigate away, and a `fetch` still in flight is cancelled
 * by the browser. So the tracker batches and sends with `sendBeacon` on page
 * hide, which survives the navigation - and sendBeacon can only POST a body,
 * never read a response, which is why this returns 204 and nothing else.
 *
 * **This is behind the auth gate, like everything else under /api.** It was
 * written to accept a signed-out tap as a null user, on the reasoning that
 * 401ing a beacon loses exactly the people who have not signed in yet - and
 * that reasoning never reached production, because proxy.ts refuses the
 * request long before this file sees it. Tested with curl: 401.
 *
 * Left gated rather than opened up. The only pages a signed-out person can
 * reach are /login and /invite, nothing in ACTIONS happens on either, so the
 * whole argument buys nothing real - and an unauthenticated endpoint that
 * writes database rows is a spam vector in a way /api/csp-report, which writes
 * nothing, is not. The null-user handling below stays because Basic auth
 * reaches this with no account attached, which is a real case.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const events = parse(body);
  if (events.length === 0) return new Response(null, { status: 204 });

  const user = await currentUser();
  recordMany(events, user?.id ?? null);

  return new Response(null, { status: 204 });
}

/**
 * A ceiling, because this endpoint takes a body from anyone.
 *
 * Unknown names are dropped rather than stored: the closed list in lib/usage
 * is the only thing making the counts comparable, and a table that will accept
 * any string is a table anybody can write junk into.
 */
const MAX_EVENTS = 50;

function parse(body: unknown): { action: UsageAction; page: string | null }[] {
  const raw = (body as { events?: unknown })?.events;
  if (!Array.isArray(raw)) return [];

  const events: { action: UsageAction; page: string | null }[] = [];
  for (const entry of raw.slice(0, MAX_EVENTS)) {
    const action = (entry as { action?: unknown })?.action;
    if (!isUsageAction(action)) continue;
    const page = (entry as { page?: unknown })?.page;
    events.push({ action, page: typeof page === "string" ? page : null });
  }
  return events;
}

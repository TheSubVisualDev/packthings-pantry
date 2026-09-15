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
 * Anonymous is allowed through as a null user rather than rejected. A signed
 * out tap is still a tap, and 401ing a beacon means the count quietly loses
 * exactly the people who have not signed in yet - who are the ones whose
 * friction matters most.
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

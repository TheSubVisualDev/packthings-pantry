import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  basicAuthValid,
  bearerToken,
  configuredPassword,
  sessionUserId,
} from "@/lib/auth";
import { getUser as getUserById, getUserByApiToken } from "@/lib/users";

/**
 * Gate on every request: a signed session cookie, HTTP Basic credentials, or a
 * bearer API token.
 *
 * People get the cookie by way of the /login form, which password managers can
 * actually fill - the native Basic dialog can't be autofilled on iOS Safari.
 * Basic stays accepted so curl has a non-interactive way in, and as the back
 * door if accounts ever leave nobody able to sign in. Bearer tokens belong to
 * a user row and are confined to /api, so a Claude session can read the pantry
 * without being handed a password that also unlocks the browser.
 *
 * Named `proxy` rather than `middleware`: Next 16 renamed the convention and
 * warns on the old filename. Proxy always runs on the Node.js runtime, which
 * is why lib/auth's node:crypto imports are safe here.
 */

export default async function proxy(request: NextRequest) {
  // Fail closed. A missing password must never mean "open to the world".
  if (!configuredPassword()) {
    return new NextResponse("PANTRY_PASSWORD is not set.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const authorization = request.headers.get("authorization");

  // The API token unlocks /api only, never the pages. Everything the app can
  // do, it does through server actions on its own routes - so a token that
  // opened those would be a second password able to empty the fridge, when all
  // it's for is letting a Claude session read stock and write recipes. The
  // endpoints under /api are the whole contract; least privilege keeps it that
  // way, and keeps /claude's promise about what the key can reach honest.
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  // The MCP endpoint carries its credential in the path, because a claude.ai
  // custom connector can only be added as a bare URL - there is nowhere to put
  // a header. The route resolves that token to a user itself and refuses
  // anything it doesn't recognise, so the gate here would only be checking a
  // credential that isn't in the request.
  if (request.nextUrl.pathname.startsWith("/api/mcp/")) {
    return NextResponse.next();
  }

  /**
   * The cron, which carries its own secret rather than a session.
   *
   * Vercel's scheduler sends `Authorization: Bearer $CRON_SECRET`, which this
   * gate would try to resolve to a user, fail, and turn into a 401 before the
   * route ever ran. The route checks that header itself and refuses anything
   * else - it sends push notifications to real phones, so left open it is a
   * button on the internet for making somebody's pocket buzz.
   */
  if (request.nextUrl.pathname === "/api/nudge") {
    return NextResponse.next();
  }

  /**
   * CSP violation reports, which cannot carry a credential.
   *
   * A browser posts these itself, with no cookie, no Authorization header and
   * no willingness to follow a redirect - so gating it would mean the reports
   * silently became 401s and the report-only policy taught us nothing, which
   * is the entire point of having it. The route writes nothing and stores
   * nothing; the worst somebody can do by posting here is fill a log.
   */
  if (request.nextUrl.pathname === "/api/csp-report") {
    return NextResponse.next();
  }

  // Session first, then the back door, and only then the database. Ordered by
  // cost: the first two are arithmetic, the third is a network hop to Hetzner,
  // and it only ever runs for an /api request that presented a bearer token.
  let authenticated =
    sessionUserId(request.cookies.get(SESSION_COOKIE)?.value) !== null ||
    basicAuthValid(authorization);

  if (!authenticated && isApi) {
    const token = bearerToken(authorization);
    if (token) authenticated = (await getUserByApiToken(token)) !== null;
  }

  // The two routes a person without an account has to be able to reach. An
  // invite link is useless if it demands the credentials it exists to hand out.
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/invite/");

  if (isPublic) {
    // An invite link always opens, so somebody can accept one from a device
    // already signed in as somebody else.
    if (!authenticated || path.startsWith("/invite/")) return NextResponse.next();

    /**
     * A well-signed cookie for an account that no longer exists.
     *
     * The signature is valid, so this gate says authenticated and bounces
     * /login to /tonight - and /tonight looks the user up, finds nobody, and
     * sends them back to /login. That loop is unrecoverable without clearing
     * cookies by hand, and it is exactly what happens to somebody whose
     * account is deleted while they are signed in.
     *
     * So the one page where being wrong about this is unrecoverable pays for
     * a lookup. It is the login screen: rarely hit, never in a loop, and the
     * cost is one query against a page that otherwise does nothing. Every
     * other route keeps the cheap check.
     */
    const userId = sessionUserId(request.cookies.get(SESSION_COOKIE)?.value);
    if (userId !== null && !(await getUserById(userId))) {
      const stale = NextResponse.next();
      // Cleared on the way past, or the next page they open loops again.
      stale.cookies.delete(SESSION_COOKIE);
      return stale;
    }

    // /tonight, not /pantry - phase 6 made "what to cook" the front door.
    return NextResponse.redirect(new URL("/tonight", request.url));
  }

  if (authenticated) return NextResponse.next();

  // Browsers get the form; anything else gets a 401 it can retry with Basic.
  // Advertising WWW-Authenticate to a browser would pop the native dialog,
  // which is the thing the login page exists to replace.
  if (!request.headers.get("accept")?.includes("text/html")) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "www-authenticate": 'Basic realm="Pantry", charset="UTF-8"',
        "cache-control": "no-store",
      },
    });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Build assets carry no pantry data and are unguessable, so keep them out of
  // the check rather than paying for a proxy invocation per chunk.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

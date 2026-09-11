import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  basicAuthValid,
  bearerToken,
  configuredPassword,
  sessionUserId,
} from "@/lib/auth";
import { getUserByApiToken } from "@/lib/users";

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
    // Already signed in and looking at the login form - nothing to do here.
    // An invite link still opens, so someone can accept one from a device that
    // is already signed in as somebody else.
    if (!authenticated || path.startsWith("/invite/")) return NextResponse.next();
    return NextResponse.redirect(new URL("/pantry", request.url));
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

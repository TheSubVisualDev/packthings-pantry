import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  apiTokenValid,
  basicAuthValid,
  configuredPassword,
  sessionValid,
} from "@/lib/auth";

/**
 * Gate on every request: a signed session cookie, HTTP Basic credentials, or a
 * bearer API token.
 *
 * People get the cookie by way of the /login form, which password managers can
 * actually fill - the native Basic dialog can't be autofilled on iOS Safari.
 * Basic stays accepted so curl has a non-interactive way in, and the bearer
 * token exists so a Claude session can read the pantry without being handed a
 * password that also unlocks the browser.
 *
 * Named `proxy` rather than `middleware`: Next 16 renamed the convention and
 * warns on the old filename. Proxy always runs on the Node.js runtime, which
 * is why lib/auth's node:crypto imports are safe here.
 */

export default function proxy(request: NextRequest) {
  // Fail closed. A missing password must never mean "open to the world".
  if (!configuredPassword()) {
    return new NextResponse("PANTRY_PASSWORD is not set.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const authorization = request.headers.get("authorization");

  const authenticated =
    sessionValid(request.cookies.get(SESSION_COOKIE)?.value) ||
    basicAuthValid(authorization) ||
    apiTokenValid(authorization);

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (isLoginPage) {
    if (!authenticated) return NextResponse.next();
    // Already signed in - no reason to show the form again.
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

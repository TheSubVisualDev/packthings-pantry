import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic auth over the whole app.
 *
 * The Vercel URL is public and the pantry is not, so every request has to
 * carry credentials before it reaches a route. Basic auth is what the browser
 * already knows how to prompt for and remember, including iOS Safari, so there
 * is no login page or session store to maintain.
 *
 * Requires PANTRY_PASSWORD (and optionally PANTRY_USER) in the environment.
 *
 * Named `proxy` rather than `middleware`: Next 16 renamed the convention and
 * warns on the old filename. Proxy always runs on the Node.js runtime, which
 * is why node:crypto is available here.
 */

const REALM = 'Basic realm="Pantry", charset="UTF-8"';

/**
 * Compares through SHA-256 digests so the comparison is constant time and
 * unequal lengths don't throw, which a raw timingSafeEqual on the inputs would.
 */
function matches(candidate: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export default function proxy(request: NextRequest) {
  const expectedUser = process.env.PANTRY_USER ?? "pantry";
  const expectedPassword = process.env.PANTRY_PASSWORD;

  // Fail closed. A missing password must never mean "open to the world".
  if (!expectedPassword) {
    return new NextResponse("PANTRY_PASSWORD is not set.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");

  if (scheme?.toLowerCase() === "basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");

    if (separator !== -1) {
      // Both comparisons run unconditionally: with `&&` inline, a wrong
      // username would skip the password check and return measurably faster.
      const userOk = matches(decoded.slice(0, separator), expectedUser);
      const passwordOk = matches(decoded.slice(separator + 1), expectedPassword);

      if (userOk && passwordOk) return NextResponse.next();
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "www-authenticate": REALM, "cache-control": "no-store" },
  });
}

export const config = {
  // Build assets carry no pantry data and are unguessable, so keep them out of
  // the check rather than paying for a proxy invocation per chunk.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

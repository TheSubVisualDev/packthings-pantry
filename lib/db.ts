import { createClient, type Client } from "@libsql/client";

let client: Client | undefined;

/**
 * The URL to actually connect on.
 *
 * sqld serves two protocols on the same port: plain HTTP, and Hrana over a
 * WebSocket. `https:` opens a fresh TCP and TLS connection for every single
 * query - measured against the real Nuremberg box, one `SELECT 1` cost about
 * two round trips and five of them cost ten, because nothing is pooled. `wss:`
 * holds one connection open and pipelines over it: the same five queries in
 * parallel went from 206ms to 43ms, and that is the difference between the
 * whole app feeling slow and not.
 *
 * So an `https:` URL is upgraded rather than obeyed. Set LIBSQL_PROTOCOL=http
 * to force the old behaviour - a one variable rollback, no deploy needed, in
 * case a proxy somewhere ever stops forwarding the upgrade.
 */
function connectionUrl(url: string): string {
  if (process.env.LIBSQL_PROTOCOL === "http") return url;
  if (url.startsWith("https:")) return `wss:${url.slice("https:".length)}`;
  if (url.startsWith("http:")) return `ws:${url.slice("http:".length)}`;
  return url;
}

/**
 * Lazily constructs the client for the self-hosted sqld instance.
 *
 * Deliberately not created at module scope: Next imports every route module
 * while collecting page data at build time, so throwing on a missing env var
 * up there fails the build rather than the request. sqld serialises access to
 * the underlying SQLite file, so the Next.js server and Claude Code can both
 * write without stepping on each other.
 */
export function getDb(): Client {
  if (client) return client;

  const url = process.env.LIBSQL_URL;
  if (!url) throw new Error("LIBSQL_URL is not set");

  client = createClient({
    url: connectionUrl(url),
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  });
  return client;
}

/** What the client is actually talking, for the health probe to report. */
export function connectionProtocol(): string | null {
  const url = process.env.LIBSQL_URL;
  if (!url) return null;
  try {
    return new URL(connectionUrl(url)).protocol.replace(":", "");
  } catch {
    return null;
  }
}

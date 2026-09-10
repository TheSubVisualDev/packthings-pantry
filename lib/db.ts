import { createClient, type Client } from "@libsql/client";

let client: Client | undefined;

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

  client = createClient({ url, authToken: process.env.LIBSQL_AUTH_TOKEN });
  return client;
}

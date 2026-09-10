import { createClient } from "@libsql/client";

const url = process.env.LIBSQL_URL;
const authToken = process.env.LIBSQL_AUTH_TOKEN;

if (!url) throw new Error("LIBSQL_URL is not set");

/**
 * Shared client for the self-hosted sqld instance. sqld serialises access to
 * the underlying SQLite file, so the Next.js server and Claude Code can both
 * write without stepping on each other.
 */
export const db = createClient({ url, authToken });

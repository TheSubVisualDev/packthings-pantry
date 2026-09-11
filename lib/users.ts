import { getDb } from "./db";
import { hashPassword, newApiToken, newInviteCode } from "./passwords";

/**
 * User and invite rows.
 *
 * Kept apart from lib/auth.ts, which must stay free of database calls so the
 * proxy can verify a session with arithmetic rather than a network hop.
 */

export interface User {
  id: number;
  handle: string;
  display_name: string;
  password_hash: string;
  avatar_url: string | null;
  api_token: string | null;
  created_at: string | null;
}

/** What's safe to hand to a page or a client component. */
export type PublicUser = Omit<User, "password_hash" | "api_token">;

export function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    handle: user.handle,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
  };
}

/** Lowercase, letters, digits and underscores. What an @mention can hold. */
export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function handleProblem(handle: string): string | null {
  if (handle.length < 2) return "Pick a handle of at least two characters.";
  if (handle.length > 24) return "That handle is longer than 24 characters.";
  return null;
}

export async function getUser(id: number): Promise<User | null> {
  const result = await getDb().execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as User) ?? null;
}

export async function getUserByHandle(handle: string): Promise<User | null> {
  const result = await getDb().execute({
    sql: "SELECT * FROM users WHERE handle = ?",
    args: [normaliseHandle(handle)],
  });
  return (result.rows[0] as unknown as User) ?? null;
}

/**
 * Resolves an API token to its owner.
 *
 * Only ever called for /api routes, which are low-traffic and about to hit the
 * database anyway - so the round trip a token lookup costs buys per-user
 * revocation for nothing that matters.
 */
export async function getUserByApiToken(token: string): Promise<User | null> {
  if (!token) return null;

  const result = await getDb().execute({
    sql: "SELECT * FROM users WHERE api_token = ?",
    args: [token],
  });
  return (result.rows[0] as unknown as User) ?? null;
}

export async function countUsers(): Promise<number> {
  const result = await getDb().execute("SELECT COUNT(*) AS n FROM users");
  return (result.rows[0] as unknown as { n: number }).n;
}

export async function createUser(
  handle: string,
  displayName: string,
  password: string,
): Promise<User> {
  const result = await getDb().execute({
    sql: `INSERT INTO users (handle, display_name, password_hash, api_token)
          VALUES (?, ?, ?, ?) RETURNING *`,
    args: [
      normaliseHandle(handle),
      displayName.trim() || handle.trim(),
      await hashPassword(password),
      newApiToken(),
    ],
  });
  return result.rows[0] as unknown as User;
}

export interface ProfileUpdate {
  displayName: string;
  handle: string;
}

export type ProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Changes the name and handle on an account.
 *
 * Handles can change. Links to the old one break, which Luna decided was
 * acceptable on a pantry this size - the alternative was remembering every
 * handle anyone ever had, to keep a handful of URLs alive.
 */
export async function updateProfile(
  userId: number,
  update: ProfileUpdate,
): Promise<ProfileResult> {
  const handle = normaliseHandle(update.handle);

  const problem = handleProblem(handle);
  if (problem) return { ok: false, error: problem };

  const taken = await getDb().execute({
    sql: "SELECT 1 FROM users WHERE handle = ? AND id <> ?",
    args: [handle, userId],
  });
  if (taken.rows.length > 0) {
    return { ok: false, error: `@${handle} is taken.` };
  }

  await getDb().execute({
    sql: "UPDATE users SET handle = ?, display_name = ? WHERE id = ?",
    args: [handle, update.displayName.trim() || handle, userId],
  });

  return { ok: true };
}

export async function setAvatar(userId: number, url: string | null): Promise<void> {
  await getDb().execute({
    sql: "UPDATE users SET avatar_url = ? WHERE id = ?",
    args: [url, userId],
  });
}

export async function setPassword(userId: number, password: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [await hashPassword(password), userId],
  });
}

/** Rotating a token revokes whatever was holding the old one. */
export async function rotateApiToken(userId: number): Promise<string> {
  const token = newApiToken();
  await getDb().execute({
    sql: "UPDATE users SET api_token = ? WHERE id = ?",
    args: [token, userId],
  });
  return token;
}

// Invites

export interface Invite {
  code: string;
  created_by: number;
  note: string | null;
  redeemed_by: number | null;
  redeemed_at: string | null;
  expires_at: string;
  created_at: string | null;
}

const INVITE_DAYS = 14;

export async function createInvite(createdBy: number, note: string): Promise<Invite> {
  const expires = new Date(Date.now() + INVITE_DAYS * 86400 * 1000).toISOString();

  const result = await getDb().execute({
    sql: `INSERT INTO invites (code, created_by, note, expires_at)
          VALUES (?, ?, ?, ?) RETURNING *`,
    args: [newInviteCode(), createdBy, note.trim() || null, expires],
  });
  return result.rows[0] as unknown as Invite;
}

/**
 * Invites still worth showing: unredeemed and in date.
 *
 * Filtered in SQL rather than in the component, because "is this expired" is a
 * question about now, and a render is not allowed to ask what time it is.
 */
export async function listLiveInvites(createdBy: number): Promise<Invite[]> {
  const result = await getDb().execute({
    sql: `SELECT * FROM invites
          WHERE created_by = ? AND redeemed_by IS NULL AND expires_at > ?
          ORDER BY created_at DESC LIMIT 25`,
    args: [createdBy, new Date().toISOString()],
  });
  return result.rows as unknown as Invite[];
}

export type InviteState = "usable" | "redeemed" | "expired" | "unknown";

export async function inviteState(code: string): Promise<InviteState> {
  const result = await getDb().execute({
    sql: "SELECT redeemed_by, expires_at FROM invites WHERE code = ?",
    args: [code],
  });

  const row = result.rows[0] as unknown as
    | { redeemed_by: number | null; expires_at: string }
    | undefined;

  if (!row) return "unknown";
  if (row.redeemed_by !== null) return "redeemed";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "usable";
}

export async function revokeInvite(code: string, createdBy: number): Promise<void> {
  // Only unredeemed codes go: a redeemed one is the record of who let whom in.
  await getDb().execute({
    sql: "DELETE FROM invites WHERE code = ? AND created_by = ? AND redeemed_by IS NULL",
    args: [code, createdBy],
  });
}

export interface RedeemResult {
  ok: boolean;
  error?: string;
  user?: User;
}

/**
 * Turns an invite into an account.
 *
 * The code is claimed inside the same transaction that creates the user, and
 * only while it is still unredeemed, so two people opening the same link at
 * once can't both get through it.
 */
export async function redeemInvite(
  code: string,
  handle: string,
  displayName: string,
  password: string,
): Promise<RedeemResult> {
  const normalised = normaliseHandle(handle);

  const problem = handleProblem(normalised);
  if (problem) return { ok: false, error: problem };
  if (password.length < 10) {
    return { ok: false, error: "Use a password of at least 10 characters." };
  }

  // Hashing is slow on purpose, so it happens before the transaction opens
  // rather than holding a write lock for the duration.
  const passwordHash = await hashPassword(password);
  const tx = await getDb().transaction("write");

  try {
    const found = await tx.execute({
      sql: "SELECT redeemed_by, expires_at FROM invites WHERE code = ?",
      args: [code],
    });
    const invite = found.rows[0] as unknown as
      | { redeemed_by: number | null; expires_at: string }
      | undefined;

    if (!invite) {
      await tx.rollback();
      return { ok: false, error: "That invite doesn't exist." };
    }
    if (invite.redeemed_by !== null) {
      await tx.rollback();
      return { ok: false, error: "That invite has already been used." };
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await tx.rollback();
      return { ok: false, error: "That invite has expired. Ask for another." };
    }

    const taken = await tx.execute({
      sql: "SELECT 1 FROM users WHERE handle = ?",
      args: [normalised],
    });
    if (taken.rows.length > 0) {
      await tx.rollback();
      return { ok: false, error: `@${normalised} is taken. Pick another handle.` };
    }

    const created = await tx.execute({
      sql: `INSERT INTO users (handle, display_name, password_hash, api_token)
            VALUES (?, ?, ?, ?) RETURNING *`,
      args: [normalised, displayName.trim() || normalised, passwordHash, newApiToken()],
    });
    const user = created.rows[0] as unknown as User;

    const claimed = await tx.execute({
      sql: `UPDATE invites SET redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP
            WHERE code = ? AND redeemed_by IS NULL`,
      args: [user.id, code],
    });

    if (claimed.rowsAffected === 0) {
      await tx.rollback();
      return { ok: false, error: "That invite was just used by someone else." };
    }

    await tx.commit();
    return { ok: true, user };
  } catch (error) {
    await tx.rollback();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't create that account.",
    };
  }
}

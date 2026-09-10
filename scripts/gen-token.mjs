// Mints an Ed25519-signed JWT for the self-hosted sqld instance.
// sqld verifies these against the public key it was started with
// (--auth-jwt-key-file). Zero dependencies: Node's crypto signs Ed25519 natively.
//
// Usage:
//   node scripts/gen-token.mjs <path-to-jwt-private.pem> [--ro] [--days N]

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const keyPath = args.find((a) => !a.startsWith("--"));

if (!keyPath) {
  console.error("usage: node scripts/gen-token.mjs <jwt-private.pem> [--ro] [--days N]");
  process.exit(1);
}

const readOnly = args.includes("--ro");
const daysIdx = args.indexOf("--days");
const days = daysIdx === -1 ? null : Number(args[daysIdx + 1]);

const b64url = (input) =>
  Buffer.from(input).toString("base64url");

const header = { alg: "EdDSA", typ: "JWT" };

// `a` is sqld's access-level claim: "rw" full access, "ro" read-only.
const payload = { a: readOnly ? "ro" : "rw", iat: Math.floor(Date.now() / 1000) };
if (days) payload.exp = payload.iat + days * 86400;

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const privateKey = createPrivateKey(readFileSync(keyPath));

// Ed25519 takes a null digest algorithm - the curve defines it.
const signature = sign(null, Buffer.from(signingInput), privateKey);

console.log(`${signingInput}.${signature.toString("base64url")}`);

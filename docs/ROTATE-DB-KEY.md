# Killing the old database token

**The oldest outstanding item in the project.** Flagged by the pen test on
10 Sep 2026 as its only real finding, deferred ever since because it is the one
change with production downtime attached.

## What the problem actually is

The token was rotated on 10 Sep and a new one issued with an expiry of
9 Dec 2026. That did not help as much as it sounds: **the old token still
works.** sqld verifies a JWT's signature against the public key it was started
with and keeps no revocation list, so a token minted before the rotation is
still a valid signature over a still-valid claim. There is no list to add it
to and no flag to turn it off.

The only way to invalidate it is to change the key it is checked against.
Which invalidates every token signed with the old private key at once -
including the one Vercel is using right now, which is why this is downtime and
not a config change.

This is a full key to the database, not a hint about the lock, and
`db.packthings.fyi` answers the open internet.

## Before you start

You need SSH to the Hetzner box in Nuremberg, and the two Vercel environments
to hand. Budget **20 minutes**, of which the app is down for about one.

Take a backup first - this is the one moment where getting locked out of your
own database is a real outcome:

    node --env-file=.env.local scripts/clone-db.mjs "C:\Users\Luna\Documents\pantry\backups\pre-key-rotation.db"

## Where this got to on 15 Sep 2026

Half done, and stopped deliberately at the safe point.

**Done already:**

- Database backed up to
  `C:\Users\Luna\Documents\pantry\backups\pre-key-rotation-2026-09-15.db`
  (600 rows, foreign keys intact).
- A new Ed25519 keypair generated in `C:\Users\Luna\Documents\pantry\keys\`.
  The private key has never been on the server and does not need to be.
- A 90-day `rw` token minted from it, in `keys\token.txt`. Expires
  14 Dec 2026.
- The new public key copied to the box as `/opt/pantry-db/jwt-public.new.pem`,
  **not yet active**. sqld is still reading `jwt-public.pem` and everything
  still works.

Fingerprints, so you can tell them apart:

| | |
|---|---|
| active now | `a755c02d9248c043` |
| staged | `484d950c68f23a1d` |

**Blocked on:** writing the token into Vercel. Claude Code's auto mode refuses
secret-store writes, which is the same wall the phase 1 migration hit. Nothing
after that step can safely run until it is done - restarting sqld while Vercel
still holds a token signed by the old key takes the site down and leaves it
down.

So run these two, and nothing else:

    vercel env rm LIBSQL_AUTH_TOKEN production --yes
    vercel env add LIBSQL_AUTH_TOKEN production < "C:\Users\Luna\Documents\pantry\keys\token.txt"

Then say so, and the rest - swapping the key, restarting the container,
redeploying, and proving the old token is dead - can be done in one go. The
site is down from the restart until the redeploy lands, a minute or two.

Also worth knowing: **the old private key is nowhere on this machine or the
box.** `.gitignore` has `*.pem` so it never reached git. Nobody can say who
holds a copy, which is an argument for finishing this rather than against.

And there is a stray file in `/opt/pantry-db/` literally named
`sudo ss -tlnp | grep -E ':80|:443'` - somebody's fat-fingered command line
became a filename on 10 Sep. Harmless, worth deleting while you are there.

## The steps

1. **Generate a new keypair**, on the box:

       openssl genpkey -algorithm ed25519 -out /etc/sqld/jwt-private.new.pem
       openssl pkey -in /etc/sqld/jwt-private.new.pem -pubout -out /etc/sqld/jwt-public.new.pem

   Keep the old pair where it is until step 6 has passed. Rolling back is
   putting the old filenames back and restarting.

2. **Mint the new token** from the new private key. Do this *before* the
   restart, so the window where nothing can connect is as short as possible.
   Copy the private key down, or run this on the box if node is there:

       node scripts/gen-token.mjs jwt-private.new.pem --days 90

   Ninety rather than for ever: an expiry is the only revocation this system
   has, so the shorter it is, the less this exact document is needed again.

3. **Point sqld at the new public key** and restart it. Whatever the unit file
   passes to `--auth-jwt-key-file`, move the new public key into that path:

       mv /etc/sqld/jwt-public.new.pem /etc/sqld/jwt-public.pem
       mv /etc/sqld/jwt-private.new.pem /etc/sqld/jwt-private.pem
       systemctl restart sqld

   **The app is down from here until step 4 finishes.** Every token in
   existence, old and current, is now refused.

4. **Update both places the token lives**, new value from step 2:

       vercel env rm LIBSQL_AUTH_TOKEN production
       vercel env add LIBSQL_AUTH_TOKEN production

   and the same value in `.env.local` so this machine keeps working.

5. **Redeploy**, because an environment variable does not reach a running
   deployment:

       vercel --prod

6. **Check it came back**, in this order:

       node --env-file=.env.local scripts/probe-db.mjs

   then open https://pantry.packthings.fyi and load the stock page.

7. **Prove the old token is dead**, which is the entire point and the step
   that is easiest to skip. With the OLD token value:

       LIBSQL_URL=https://db.packthings.fyi LIBSQL_AUTH_TOKEN=<old> node scripts/probe-db.mjs

   It must fail to authenticate. If it succeeds, sqld did not pick up the new
   public key - check the path in the unit file rather than assuming the
   restart worked.

8. **Shred the old keypair** once step 7 has passed, and not before.

## While you are on the box

The other two pen-test findings live here rather than in the app, and both are
the same one-line answer: **nothing but Vercel and you needs to reach this
host.** Today anybody can ask it its exact version, unauthenticated:

    curl https://db.packthings.fyi/version

Restrict the host at Caddy to Vercel's egress addresses and your own IP. That
closes finding 3 and takes most of the risk out of finding 1 permanently -
a leaked token is worth much less if it can only be used from two places.

## What is already done, in the app

Shipped 15 Sep 2026: `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, HSTS with `includeSubDomains`, and a
Content-Security-Policy in **report-only** mode with violations posted to
`/api/csp-report`. Read them with `vercel logs` after a few days of ordinary
use - including one receipt scan, one barcode scan and one push subscription,
which are the three things that reach outside the app - then turn the header
name in `next.config.ts` into the enforcing one.

HSTS `preload` was deliberately left off. It is a submission to a list baked
into browsers, it covers `packthings.fyi` and everything under it, and coming
back off takes months. That is a decision about the whole domain.

## One thing the pen test said that is no longer true

It skipped authenticated testing on the grounds that the app had "no per-user
data to confess across". That was true of a two-person pantry in September and
is not true now: there are accounts, kitchens with roles, follows, blocks,
private recipes and reports. Whether one signed-in person can reach another's
data by changing an id in a URL is now a real question, and nobody has asked
it. Worth its own pass.

// Looks at the app the way a phone does.
//
//   npm run dev                     (in one terminal, note the port)
//   npm run shots -- <out-dir> /pantry /pantry/add /recipes
//
// Exists because this app was designed and redesigned for weeks without
// anybody rendering it at phone width, and it showed: a form whose last three
// fields overlapped each other, a nav that had quietly stopped fitting, and a
// recipe card that came out as a black rectangle on iOS. All three were
// obvious in a screenshot and invisible in the source.
//
//   SHOT_USER_ID   whose kitchen to render as (default 1)
//   SHOT_FULL=1    whole page rather than one screen
//   SHOT_PORT      dev server port (default 3000)
//
// It signs its own session cookie with the app's own secret rather than
// driving the login form, because the form is a server action and this only
// ever points at a local dev server.

import { chromium } from "playwright";
import { createHmac } from "node:crypto";

const PORT = process.env.SHOT_PORT ?? "3000";
const OUT = process.argv[2];
const paths = process.argv.slice(3);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  // iPhone 17 Pro logical size, which is the screen this is built for.
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  httpCredentials: {
    username: process.env.PANTRY_USER ?? "pack",
    password: process.env.PANTRY_PASSWORD ?? "",
  },
});
// A session cookie minted with the app's own signing, so the pages render as
// they do for a signed-in person. Dev server, own machine, own app.
const secret = process.env.PANTRY_SESSION_SECRET || process.env.PANTRY_PASSWORD;
const expiry = Math.floor(Date.now() / 1000) + 3600;
const body = `v2.${process.env.SHOT_USER_ID ?? 1}.${expiry}`;
const sig = createHmac("sha256", secret).update(body).digest("base64url");
await ctx.addCookies([
  {
    name: "pantry_session",
    value: `${body}.${sig}`,
    domain: "localhost",
    path: "/",
  },
]);

const page = await ctx.newPage();

/**
 * Things to press before the picture is taken.
 *
 * Half this app only exists after a tap - selection mode, an open stepper, a
 * sheet - and none of it could be looked at, which is the same reason the
 * three bugs above survived. Comma-separated, in order; each one is text to
 * click ("Select") or a CSS selector when prefixed with `css:`.
 *
 *   SHOT_CLICK="Select,css:li:first-child button"
 */
const clicks = (process.env.SHOT_CLICK ?? "")
  .split(",")
  .map((each) => each.trim())
  .filter(Boolean);

for (const p of paths) {
  const name = p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
  await page.goto(`http://localhost:${PORT}${p}`, { waitUntil: "networkidle" });

  for (const click of clicks) {
    const target = click.startsWith("css:")
      ? page.locator(click.slice(4)).first()
      : page.getByText(click, { exact: true }).first();
    await target.click();
    // Long enough for a transition to land, short enough not to be a sleep
    // anybody notices.
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: process.env.SHOT_FULL === "1" });
  console.log(name, page.url());
}
await browser.close();

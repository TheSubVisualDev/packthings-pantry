import type { NextConfig } from "next";

/**
 * The policy, in report-only, because a wrong CSP breaks things silently.
 *
 * Enforcing a guessed policy on a live app is how you ship a scan screen that
 * spins for ever: tesseract.js fetches its WebAssembly core and its language
 * data from a CDN the first time somebody reads a receipt, and a blocked
 * fetch there produces a promise that never settles rather than an error
 * anybody sees. Report-only sends the same policy and breaks nothing, so the
 * violations arrive as reports and the real list of origins gets written down
 * from what actually happened instead of from what I remember.
 *
 * Flip the header name to `Content-Security-Policy` once /api/csp-report has
 * been quiet for a few days of ordinary use - including one receipt scan, one
 * barcode scan and one push subscription, which are the three things that
 * reach outside the app.
 *
 * `'unsafe-inline'` on style-src is not laziness and will have to stay: React
 * renders `style={{...}}` as a style attribute, and the app tints recipe cards
 * that way. Scripts are the half that matters.
 */
const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' for development only: React uses eval there to rebuild
  // server stacks in the browser. Production needs neither.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // blob: and data: are the app's own canvases - a photo downscaled before
  // upload, a generated icon - not anybody else's images.
  "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com",
  "font-src 'self'",
  // The recogniser runs in a Worker created from a blob.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // The clickjacking half of finding 2, said the modern way. The
  // X-Frame-Options header below says it again for older browsers.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/csp-report",
].join("; ");

/**
 * Headers that are the same on every response.
 *
 * All of these are findings 2, 4 and 5 of docs/PENTEST-2026-09-10.md. None
 * changes behaviour; they are the second line for a bug this app does not have
 * today and might introduce.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Same-origin so our own referrers survive, no origin leaked off-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /**
   * Camera is allowed because half this app is a camera - the barcode scanner
   * and the receipt reader. The rest is switched off: nothing here needs to
   * know where you are, and a permission that is never asked for is a
   * permission that cannot be asked for by something that got injected.
   */
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  /**
   * HSTS with includeSubDomains, and deliberately WITHOUT preload.
   *
   * Vercel already sends a two-year max-age; this adds the subdomains.
   * `preload` is left off on purpose: it is a submission to a list baked into
   * browsers, it covers packthings.fyi and everything under it, and getting
   * off it takes months. That is a decision about the whole domain rather than
   * a header this app should quietly ship.
   */
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  // The Claude guide is served from docs/ at runtime rather than duplicated
  // into a TypeScript module, so there's one copy to keep correct. Vercel only
  // ships files it can see being used, and a path built at runtime isn't
  // traceable, so it's named here explicitly.
  outputFileTracingIncludes: {
    "/api/claude-guide": ["./docs/RECIPES-FOR-CLAUDE.md"],
  },

  /**
   * Image-resizing binaries for machines this does not run on.
   *
   * sharp ships a native build per platform plus a WebAssembly fallback for
   * the ones it has no build for. Vercel runs linux-x64, so it uses exactly
   * one of them and traces the rest in anyway - the wasm fallback alone is
   * 8.7MB, in five functions, 43.6MB per deployment, for code that is reached
   * only when the native binary is missing.
   *
   * Whatever this build machine is gets excluded too: a trace collected on
   * Windows carries win32 binaries that a Linux function could not load if it
   * tried. The linux-x64 build is deliberately NOT listed - that is the one
   * doing the work.
   */
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@img/sharp-wasm32/**",
      "node_modules/@img/sharp-win32-x64/**",
      "node_modules/@img/sharp-win32-ia32/**",
      "node_modules/@img/sharp-win32-arm64/**",
      "node_modules/@img/sharp-darwin-x64/**",
      "node_modules/@img/sharp-darwin-arm64/**",
      "node_modules/@img/sharp-libvips-win32-x64/**",
      "node_modules/@img/sharp-libvips-darwin-x64/**",
      "node_modules/@img/sharp-libvips-darwin-arm64/**",
    ],
  },

  // Minor version disclosure, flagged in the phase 1 pen test.
  poweredByHeader: false,

  /**
   * No source maps in the deployed functions.
   *
   * Vercel counts Function Storage across every deployment it keeps, not just
   * the live one, and the free tier is 10GB - which this hit 75% of. Of the
   * 31MB of server output, 23MB was .map files: three quarters of what gets
   * stored on every push was debug data for code nobody attaches a debugger
   * to. A stack trace from production is read against the repository at that
   * commit, which is what git is for.
   *
   * Browser maps go too. They are public, so they hand the whole unminified
   * client to anybody who opens devtools, and they are downloaded by real
   * phones on real connections.
   */
  productionBrowserSourceMaps: false,

  experimental: {
    serverSourceMaps: false,

    /**
     * Headroom, not the fix.
     *
     * A server action refuses any body over 1MB by default, which is what was
     * turning a bug report with a screenshot on it into a 403 that ate the
     * words as well as the picture. Photos are shrunk in the browser now -
     * lib/downscale.ts - so they arrive around 300KB; this is the margin for
     * four of them at once plus the form, and for the day somebody attaches
     * something the canvas refuses to re-encode and it goes up untouched.
     */
    serverActions: { bodySizeLimit: "8mb" },
  },

  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },

  images: {
    // Photos live in Vercel Blob, which serves them from a per-store subdomain.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;

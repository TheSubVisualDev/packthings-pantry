import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Claude guide is served from docs/ at runtime rather than duplicated
  // into a TypeScript module, so there's one copy to keep correct. Vercel only
  // ships files it can see being used, and a path built at runtime isn't
  // traceable, so it's named here explicitly.
  outputFileTracingIncludes: {
    "/api/claude-guide": ["./docs/RECIPES-FOR-CLAUDE.md"],
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

  images: {
    // Photos live in Vercel Blob, which serves them from a per-store subdomain.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;

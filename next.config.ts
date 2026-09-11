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
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Claude guide is served from docs/ at runtime rather than duplicated
  // into a TypeScript module, so there's one copy to keep correct. Vercel only
  // ships files it can see being used, and a path built at runtime isn't
  // traceable, so it's named here explicitly.
  outputFileTracingIncludes: {
    "/api/claude-guide": ["./docs/RECIPES-FOR-CLAUDE.md"],

    // Tesseract picks its WebAssembly core and its worker script by building
    // paths at runtime, which nothing static can see - so the tracer leaves
    // them out of the bundle and the first scan on a deployment fails looking
    // for a file that was never shipped. Named explicitly, as the guide above
    // had to be, and for exactly the same reason.
    "/pantry/receipt": [
      "./node_modules/tesseract.js/**",
      "./node_modules/tesseract.js-core/**",
    ],
  },

  experimental: {
    serverActions: {
      // A receipt photographed on a phone is two to five megabytes and the
      // default ceiling is one, so the action threw before it was entered -
      // as an opaque digest, because that rejection happens in the framework.
      // The client scales pictures down before sending, so this is the
      // backstop rather than the plan.
      bodySizeLimit: "12mb",
    },
  },

  // Minor version disclosure, flagged in the phase 1 pen test.
  poweredByHeader: false,

  images: {
    // Photos live in Vercel Blob, which serves them from a per-store subdomain.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;

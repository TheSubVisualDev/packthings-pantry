/**
 * Lets plain node import this project's TypeScript.
 *
 * Two kinds of specifier need help, for two different reasons.
 *
 * Relative ones are written without an extension, the way TypeScript is
 * written everywhere, and node's ESM resolver wants the real filename.
 *
 * Bare ones can fail on packages that predate `exports`. `next` is one: it has
 * no exports map at all and relies on node finding `node_modules/next/
 * server.js` by the old CJS rules, which ESM does not do - so `next/server`
 * resolves under require and throws ERR_MODULE_NOT_FOUND under import. That
 * mattered the day lib/usage.ts started importing `after` to keep its writes
 * alive past the response: every check that imports a lib module through this
 * loader broke at once, which is a strange way to find out.
 */
export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-z]+$/i.test(specifier);

  if (relative && !hasExtension) {
    for (const extension of [".ts", ".tsx"]) {
      try {
        return await next(specifier + extension, context);
      } catch {
        // Try the next one; the bare specifier is the last resort.
      }
    }
    return next(specifier, context);
  }

  try {
    return await next(specifier, context);
  } catch (error) {
    // Only the legacy-package case, and only once. Anything else is a genuine
    // missing module and should say so rather than be retried into a worse
    // error message.
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || relative || hasExtension) {
      throw error;
    }
    return next(specifier + ".js", context);
  }
}

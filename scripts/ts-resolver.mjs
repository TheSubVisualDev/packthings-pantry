/** Resolves extensionless relative imports to .ts, then .tsx, then as given. */
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
  }
  return next(specifier, context);
}

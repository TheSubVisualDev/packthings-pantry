// Lets plain `node` run the project's own TypeScript.
//
// Node strips types on its own, but its ESM resolver insists on file
// extensions, while TypeScript source writes `import "./units"`. This hook adds
// the extension back, so a check script can import the module that actually
// ships rather than a copy of it that can drift.
//
//   node --import ./scripts/ts-imports.mjs scripts/whatever.mjs

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolver.mjs", pathToFileURL(import.meta.filename));

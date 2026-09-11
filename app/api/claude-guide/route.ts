import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Serves the Claude guide as a download, with this deployment's own address
 * filled in.
 *
 * The file in docs/ is the single copy; the host is stitched in here because a
 * document telling someone to call an API is not much use without the URL, and
 * hard-coding it would make the repo wrong for anyone else running this.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const markdown = await readFile(
    path.join(process.cwd(), "docs", "RECIPES-FOR-CLAUDE.md"),
    "utf8",
  );

  const withHost = markdown.replace(
    "The base URL is wherever the pantry is deployed. Everything below is relative\nto it.",
    `The base URL is **${origin}**. Everything below is relative to it.`,
  );

  return new NextResponse(withHost, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'attachment; filename="pantry-for-claude.md"',
      "cache-control": "no-store",
    },
  });
}

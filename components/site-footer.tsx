import Link from "next/link";

/**
 * Quiet footer. The Claude link is deliberately understated - it's a thing you
 * set up once and then never look at again, so it shouldn't compete with the
 * stock list for attention.
 *
 * The extra bottom padding on a phone clears the navigation bar, which is
 * fixed over the end of the page.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1280px] px-5 pb-28 sm:px-9 sm:pb-10">
      <Link
        href="/claude"
        className="text-xs font-semibold text-muted-foreground/60 transition-colors hover:text-muted-foreground"
      >
        Connect Claude
      </Link>
    </footer>
  );
}

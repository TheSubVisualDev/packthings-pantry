import Link from "next/link";

/**
 * Quiet footer. The Claude link is deliberately understated - it's a thing you
 * set up once and then never look at again, so it shouldn't compete with the
 * stock list for attention.
 *
 * Understated, not unreadable. It was muted-foreground at 60% opacity, which
 * on the page's own beige came out as grey words floating in empty space with
 * nothing to say they were a link - read as a rendering fault rather than as
 * quiet. Full muted ink and an underline: still the last thing on the page,
 * now legibly so.
 *
 * The extra bottom padding on a phone clears the navigation bar, which is
 * fixed over the end of the page.
 */
export function SiteFooter() {
  return (
    <footer className="print:hidden mx-auto w-full max-w-[1280px] px-5 pb-28 sm:px-9 sm:pb-10">
      <Link
        href="/claude"
        className="text-xs font-semibold text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
      >
        Connect Claude
      </Link>
    </footer>
  );
}

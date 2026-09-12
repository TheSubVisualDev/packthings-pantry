/**
 * The page shell, in four widths instead of ten arbitrary ones.
 *
 * Every route repeated its own `mx-auto max-w-[...] px-5 pt-6 pb-32 sm:px-9`,
 * and they had drifted: ten distinct maximum widths, three different vertical
 * paddings and two different horizontal ones, none of the differences meaning
 * anything. A designer opening this would have had to work out which of those
 * were decisions and which were typos. So would the next person changing one.
 *
 * The widths are named after what they hold rather than after a number, so
 * picking one is a question about content instead of a guess at a pixel count:
 *
 * - `form`  one column of fields, read top to bottom
 * - `read`  prose and recipes, at a comfortable measure
 * - `list`  a list or a grid that wants room but not the whole screen
 * - `wide`  the stock page, which is genuinely a lot of rows
 *
 * The bottom padding is large on every one of them and deliberately so: the
 * FAB floats over the end of the page, and a last row it covers is a row you
 * cannot press.
 */

const WIDTHS = {
  form: "max-w-[560px]",
  read: "max-w-[720px]",
  list: "max-w-[900px]",
  wide: "max-w-[1280px]",
} as const;

export function Page({
  width = "read",
  children,
}: {
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
}) {
  return (
    <main className={`mx-auto w-full ${WIDTHS[width]} px-5 pt-6 pb-32 sm:px-9 sm:pt-7`}>
      {children}
    </main>
  );
}

/**
 * A page's title, and whatever belongs beside it.
 *
 * Pulled out because the heading and its row of actions were laid out slightly
 * differently on every screen - some wrapped, some did not, some put the
 * actions above on mobile and some below - and the answer should not depend on
 * which page you are looking at.
 */
export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] break-words">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

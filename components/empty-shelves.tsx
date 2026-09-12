import Link from "next/link";
import { Barcode, PackageOpen, Plus, Receipt } from "lucide-react";

/**
 * Nothing on the shelves yet - board `1p`.
 *
 * Every empty state offers the thing that fixes it. This one used to read
 * "Nothing in stock yet. Run npm run seed" - an instruction for whoever built
 * the app rather than whoever is holding it.
 *
 * Three ways in, in the order they are fast: a receipt fills a whole shop, a
 * barcode fills one thing properly, typing fills one thing from memory.
 */
export function EmptyShelves() {
  const ways = [
    { href: "/pantry/receipt", label: "Scan a receipt", hint: "A whole shop at once", Icon: Receipt },
    { href: "/pantry/scan", label: "Scan a barcode", hint: "One thing, with its pack size", Icon: Barcode },
    { href: "/pantry/add", label: "Add by hand", hint: "Type a name, we guess the rest", Icon: Plus },
  ];

  return (
    <div className="rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <PackageOpen
        className="mx-auto h-10 w-10 text-muted-foreground/50"
        strokeWidth={1.8}
      />
      <h2 className="mt-3 text-[19px] font-extrabold tracking-[-0.02em]">
        Nothing on the shelves yet
      </h2>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">
        Put something in and the rest of the app wakes up.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {ways.map(({ href, label, hint, Icon }, index) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-14 items-center gap-3 rounded-[14px] px-4 text-left ${
              index === 0 ? "bg-primary text-primary-foreground" : "bg-chip"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={2.4} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">{label}</span>
              <span
                className={`block text-[12px] font-semibold ${
                  index === 0 ? "opacity-80" : "text-muted-foreground"
                }`}
              >
                {hint}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

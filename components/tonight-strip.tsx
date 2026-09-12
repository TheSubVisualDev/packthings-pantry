import Link from "next/link";
import { Flame } from "lucide-react";
import type { Suggestion } from "@/lib/tonight";

/**
 * One line of suggestion at the top of the stock page - board `1b`.
 *
 * The stock page used to carry a whole recommendation panel: a rescue list, a
 * full Tonight card, a runners-up link. Three of the six stacked controls the
 * design pass deleted. The suggestion earns one row here and nothing more,
 * because the screen is called Stock and the full answer has a whole tab.
 *
 * One tap cooks it, the rest of the row opens it. Terracotta, because it is
 * the only thing on this screen the app has an opinion about.
 */
export function TonightStrip({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-primary px-4 py-3 text-primary-foreground">
      <Flame className="h-5 w-5 shrink-0" strokeWidth={2.4} />

      <Link href={`/recipes/${suggestion.id}`} className="min-w-0 flex-1">
        <div className="text-[10px] font-extrabold tracking-[0.14em] uppercase opacity-80">
          Tonight
        </div>
        <div className="truncate text-[16px] font-extrabold tracking-[-0.01em]">
          {suggestion.name}
        </div>
        <div className="truncate text-[12px] font-semibold opacity-85">
          {suggestion.reason}
        </div>
      </Link>

      <Link
        href={`/recipes/${suggestion.id}`}
        className="flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-[13px] font-extrabold text-primary"
      >
        Cook
      </Link>
    </div>
  );
}

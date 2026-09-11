import Link from "next/link";
import { Avatar } from "@/components/avatar";

/**
 * A person, as a chip.
 *
 * Discover showed people as a bare "@handle" while /people showed a face and a
 * name, so the same person looked like two different records depending on how
 * you arrived. One component, used in both places on Discover, keeps identity
 * looking like identity.
 */
export function PersonChip({
  handle,
  displayName,
  avatarUrl,
  recipeCount,
}: {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  recipeCount?: number;
}) {
  return (
    <Link
      href={`/people/${handle}`}
      className="flex items-center gap-2.5 rounded-full bg-card py-1.5 pr-4 pl-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
    >
      <Avatar handle={handle} displayName={displayName} url={avatarUrl} size={30} />
      <span className="min-w-0">
        <span className="block text-sm leading-tight font-bold">{displayName}</span>
        <span className="block text-xs leading-tight font-semibold text-muted-foreground">
          @{handle}
          {recipeCount !== undefined &&
            ` · ${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"}`}
        </span>
      </span>
    </Link>
  );
}

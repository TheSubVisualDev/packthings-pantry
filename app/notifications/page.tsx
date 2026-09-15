import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SiteHeader } from "@/components/site-header";
import { listFor, markAllRead } from "@/lib/notifications";
import { currentKitchen } from "@/lib/session";
import { shortDate } from "@/lib/dates";
import { recipeTint } from "@/lib/tint";

export const dynamic = "force-dynamic";

export const metadata = { title: "News · Pantry" };

/**
 * The only list of things that happened, and it is one kind of thing.
 *
 * Read on arrival rather than per item: there is nothing to do with one of
 * these except see it, so opening the page IS reading them. That also means
 * the page has no buttons on it at all, which is the correct amount for a
 * screen whose whole job is to be looked at once and left.
 */
export default async function NotificationsPage() {
  const context = await currentKitchen();
  if (!context.ok) redirect("/login?next=%2Fnotifications");

  const items = await listFor(context.user.id);

  /**
   * Marked read AFTER the list is read, so this render still shows which ones
   * were new. Doing it first would clear the highlight on the very visit that
   * is supposed to show it.
   */
  await markAllRead(context.user.id);

  return (
    <>
      <SiteHeader active="recipes" />

      <div className="mx-auto w-full max-w-[720px] px-5 pt-6 pb-32 sm:px-9 sm:py-7">
        <div className="mb-1 flex items-center gap-3">
          <Link
            href="/tonight"
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.6} />
          </Link>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">News</h1>
        </div>
        <p className="mb-5 text-sm font-semibold text-muted-foreground">
          When somebody cooks a recipe you wrote.
        </p>

        {items.length === 0 ? (
          <div className="rounded-[20px] bg-card p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-[15px] font-extrabold">Nothing yet.</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Share a recipe and this is where you hear that somebody made it.
            </p>
            <Link
              href="/recipes"
              className="mt-4 inline-flex min-h-11 items-center rounded-[14px] bg-primary px-5 text-sm font-extrabold text-primary-foreground"
            >
              Your cookbook
            </Link>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {items.map((item) => (
              <li
                key={item.id}
                className={`border-b border-border last:border-b-0 ${
                  // Unread is a tint on the row rather than a dot beside it:
                  // the whole row is the news, and a dot is one more small
                  // thing to find on a phone.
                  item.read_at === null ? "bg-primary/5" : ""
                }`}
              >
                <Link
                  href={item.recipe_id ? `/recipes/${item.recipe_id}` : "/recipes"}
                  data-track="recipe.open"
                  className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-chip"
                >
                  <span className="relative block h-12 w-12 shrink-0">
                    <span
                      className="block h-full w-full overflow-hidden rounded-[12px]"
                      style={
                        item.recipe_photo
                          ? undefined
                          : { background: recipeTint(item.recipe_id ?? 0) }
                      }
                    >
                      {item.recipe_photo && (
                        <Image
                          src={item.recipe_photo}
                          alt=""
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="absolute -right-1 -bottom-1 block overflow-hidden rounded-full ring-2 ring-card">
                      <Avatar
                        handle={item.actor_handle ?? "?"}
                        displayName={item.actor_name ?? "Somebody"}
                        url={item.actor_avatar}
                        size={20}
                      />
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-extrabold break-words">
                      {/* The account may be gone. The news is still true, so it
                          is told about "somebody" rather than dropped. */}
                      {item.actor_handle ? `@${item.actor_handle}` : "Somebody"} cooked{" "}
                      {item.recipe_name ?? "your recipe"}
                    </span>
                    <span className="block text-xs font-semibold text-muted-foreground">
                      {item.servings ? `for ${item.servings} · ` : ""}
                      {shortDate(item.cooked_at ?? item.created_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

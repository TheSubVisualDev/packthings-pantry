"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Flame, ShoppingBasket, X } from "lucide-react";
import { unpinTrip } from "@/app/pantry/trip-actions";
import type { Trip } from "@/lib/trip";

/**
 * Where you are in the trip, in one row at the top of the screen.
 *
 * The same slot the Tonight suggestion uses, because they are answers to the
 * same question - what is happening about dinner - and only one of them is
 * true at a time. An idea you have not acted on is a suggestion; one you are
 * shopping for is a trip.
 *
 * Three things it can say, and it works them out from the shelves and the list
 * rather than from a stored status:
 *
 *   short of things, none bought   ->  what to buy, and the list
 *   short of things, all in basket ->  put it away (the receipt does this too)
 *   nothing short                  ->  Start cooking
 */
export function TripStrip({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const done = trip.ready;
  const shopping = !done && trip.toBuy > 0;

  return (
    <div
      className={`flex items-center gap-3 rounded-[18px] px-4 py-3 ${
        done ? "bg-primary text-primary-foreground" : "bg-ink text-background"
      }`}
    >
      {done ? (
        <Flame className="h-5 w-5 shrink-0" strokeWidth={2.4} />
      ) : (
        <ShoppingBasket className="h-5 w-5 shrink-0" strokeWidth={2.4} />
      )}

      <Link href={`/recipes/${trip.recipe_id}`} className="min-w-0 flex-1">
        <div className="text-[10px] font-extrabold tracking-[0.14em] uppercase opacity-80">
          {done ? "Ready to cook" : "Shopping for"}
        </div>
        <div className="truncate text-[16px] font-extrabold tracking-[-0.01em]">
          {trip.name}
        </div>
        <div className="truncate text-[12px] font-semibold opacity-85">
          {done
            ? "Everything for it is in."
            : shopping
              ? `${trip.toBuy} still to get${trip.inBasket > 0 ? `, ${trip.inBasket} in the basket` : ""}`
              : `${trip.inBasket} in the basket — put them away`}
        </div>
      </Link>

      {/* One button, and it is whichever thing you are about to do next. */}
      <Link
        href={
          done
            ? `/recipes/${trip.recipe_id}/cook`
            : shopping
              ? "/pantry/list"
              : "/pantry/list#basket"
        }
        className={`flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-extrabold ${
          done ? "bg-white text-primary" : "bg-background text-foreground"
        }`}
      >
        {done ? "Start cooking" : shopping ? "The list" : "Put away"}
      </Link>

      {/* Changing your mind about dinner is not a failure state, so it is a
          small ✕ rather than a confirmation: pinning something else does the
          same job, and this is for the night you decide to have toast. */}
      <button
        type="button"
        aria-label="Stop shopping for this"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await unpinTrip();
            router.refresh();
          })
        }
        className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100 disabled:opacity-40"
      >
        <X className="h-4 w-4" strokeWidth={3} />
      </button>
    </div>
  );
}

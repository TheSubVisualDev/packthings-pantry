"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BookOpenText, Boxes, Check, ChevronLeft, Compass, UtensilsCrossed,
} from "lucide-react";
import {
  addStaples, finishWelcome, howYouCook, nameKitchen, type WelcomeResult,
} from "@/app/welcome/actions";
import { NudgeSettings } from "@/components/nudge-settings";
import { MAX_SLOTS, SLOT_SUGGESTIONS } from "@/lib/plan";

/**
 * The things almost every kitchen has and nobody would think to add.
 *
 * Deliberately short and deliberately boring. A long list turns the step into
 * a shopping decision, and the point of it is the opposite: to get past the
 * empty shelf without asking anybody to think.
 */
const STAPLES = [
  "Salt", "Black pepper", "Olive oil", "Vegetable oil", "Butter",
  "Milk", "Eggs", "Plain flour", "Sugar", "Pasta",
  "Rice", "Tinned tomatoes", "Onions", "Garlic", "Stock cubes",
];

/**
 * Being shown round, once.
 *
 * The cliff a new account falls off is not signing up, it is the first screen
 * after: empty shelves, no recipes, and five tabs that all say nothing yet.
 * This is five questions that leave somebody with a named kitchen, a shelf
 * with something on it, and some idea where things are.
 *
 * Every step is skippable and the whole thing is skippable, because an
 * onboarding that gates the app behind a form is a signup form wearing a coat.
 * Skipping counts as finishing: it is never offered again either way, since
 * being asked twice is the part people actually resent.
 */
export function Welcome({
  handle,
  hasKitchen,
  kitchenName,
  pushConfigured,
}: {
  handle: string;
  hasKitchen: boolean;
  kitchenName: string | null;
  pushConfigured: boolean;
}) {
  /**
   * The steps, decided once and then left alone.
   *
   * Somebody who already has a kitchen - invited into someone else's - is not
   * asked to name one, so that step is simply not there. But `hasKitchen`
   * flips to true the moment step one succeeds, and derived straight from the
   * prop that dropped the first entry out of the array while the index stayed
   * where it was: naming your kitchen skipped a step and landed on the one
   * after. Frozen at mount, because which questions there are is a fact about
   * the person who arrived, not about what they have done since.
   */
  const [steps] = useState(() =>
    hasKitchen
      ? (["cook", "staples", "nudge", "tour"] as const)
      : (["kitchen", "cook", "staples", "nudge", "tour"] as const),
  );

  const router = useRouter();
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<WelcomeResult | null>(null);
  const [pending, startWorking] = useTransition();

  const [name, setName] = useState(kitchenName ?? "");
  const [slots, setSlots] = useState<string[]>(["Dinner"]);
  const [servings, setServings] = useState(2);
  const [picked, setPicked] = useState<string[]>([]);

  const step = steps[at];
  const last = at === steps.length - 1;

  function forward() {
    setResult(null);
    setAt((n) => Math.min(steps.length - 1, n + 1));
  }

  /** Saves this step, then moves on. A failure stays put and says why. */
  function saveThen(work: () => Promise<WelcomeResult>) {
    setResult(null);
    startWorking(async () => {
      const done = await work();
      setResult(done);
      if (done.ok) forward();
    });
  }

  function leave() {
    startWorking(async () => {
      await finishWelcome();
      // refresh as well as push: the kitchen made two steps ago is a cookie
      // /tonight's server render has not seen, so a plain push can land on a
      // kitchen-less page that then bounces straight back here.
      router.refresh();
      router.push("/tonight");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1">
        {steps.map((each, index) => (
          <span
            key={each}
            className={`h-1 flex-1 rounded-full ${
              index < at ? "bg-primary" : index === at ? "bg-ink" : "bg-border"
            }`}
          />
        ))}
      </div>

      {step === "kitchen" && (
        <section className="advance" key="kitchen">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            Hello @{handle}.
          </h1>
          <p className="mt-1 mb-4 text-[15px] leading-relaxed font-medium text-muted-foreground">
            A kitchen is a stock list with people in it. Yours to fill, and you
            can share it later.
          </p>
          <label htmlFor="kitchen-name" className="sr-only">
            What to call it
          </label>
          <input
            id="kitchen-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoFocus
            placeholder="Home"
            className="w-full rounded-[14px] border border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
        </section>
      )}

      {step === "cook" && (
        <section className="advance" key="cook">
          {/* The other four steps open on an input, a grid of chips, a real
              control, or a checklist - this one used to open on a bare
              heading, which left the top of the screen looking like an
              illustration had not loaded rather than a choice not to have
              one. Same treatment the tour step gives each tab below. */}
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
            <UtensilsCrossed className="h-8 w-8" strokeWidth={2.2} />
          </div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            How do you cook?
          </h1>
          <p className="mt-1 mb-4 text-[15px] leading-relaxed font-medium text-muted-foreground">
            Both of these only set what the week planner starts from. Change
            them whenever.
          </p>

          <span className="text-xs font-bold tracking-[0.08em] text-label uppercase">
            Meals you plan
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SLOT_SUGGESTIONS.map((meal) => {
              const on = slots.includes(meal);
              return (
                <button
                  key={meal}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSlots((current) => {
                      const next = on
                        ? current.filter((each) => each !== meal)
                        : [...current, meal];
                      // Kept in the order a day goes, not the order tapped.
                      const ordered = SLOT_SUGGESTIONS.filter((each) =>
                        next.includes(each),
                      );
                      // Never none: a planner with no meals in it is a grid of
                      // nothing, so the last one cannot be turned off.
                      return ordered.length > 0 ? ordered.slice(0, MAX_SLOTS) : current;
                    })
                  }
                  className={`h-11 rounded-full px-4 text-sm font-bold ${
                    on
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                  }`}
                >
                  {meal}
                </button>
              );
            })}
          </div>

          <span className="mt-5 block text-xs font-bold tracking-[0.08em] text-label uppercase">
            Usually cooking for
          </span>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              aria-label="Fewer"
              onClick={() => setServings((n) => Math.max(1, n - 1))}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-2xl leading-none font-bold shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            >
              &minus;
            </button>
            <span className="min-w-16 text-center text-[22px] font-extrabold tabular-nums">
              {servings}
            </span>
            <button
              type="button"
              aria-label="More"
              onClick={() => setServings((n) => Math.min(20, n + 1))}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl leading-none font-bold text-primary-foreground"
            >
              +
            </button>
          </div>
        </section>
      )}

      {step === "staples" && (
        <section className="advance" key="staples">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            What have you definitely got?
          </h1>
          <p className="mt-1 mb-4 text-[15px] leading-relaxed font-medium text-muted-foreground">
            Tap anything you own. They go on the shelf without an amount —
            &ldquo;there is some and nobody has said how much&rdquo; is a real
            answer here, and you can pin it down later.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {STAPLES.map((staple) => {
              const on = picked.includes(staple);
              return (
                <button
                  key={staple}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((current) =>
                      on
                        ? current.filter((each) => each !== staple)
                        : [...current, staple],
                    )
                  }
                  className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold ${
                    on
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                  }`}
                >
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  {staple}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            {picked.length === 0
              ? "None picked — that is fine, skip it."
              : `${picked.length} to add.`}
          </p>
        </section>
      )}

      {step === "nudge" && (
        <section className="advance" key="nudge">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            Want a nudge?
          </h1>
          <p className="mt-1 mb-4 text-[15px] leading-relaxed font-medium text-muted-foreground">
            Asked here because this is the only moment it is not an
            interruption. It is the one notification the app sends.
          </p>
          {/* The real control, not a copy of it. A second implementation of
              "turn notifications on" is a second thing to be subtly wrong. */}
          <NudgeSettings configured={pushConfigured} current={null} />
        </section>
      )}

      {step === "tour" && (
        <section className="advance" key="tour">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            That is everything.
          </h1>
          <p className="mt-1 mb-4 text-[15px] leading-relaxed font-medium text-muted-foreground">
            Four tabs along the bottom. That is the whole app.
          </p>

          <ul className="space-y-2">
            {[
              { Icon: Boxes, name: "Stock", what: "What is in, what is running out, what is about to go off." },
              { Icon: UtensilsCrossed, name: "Tonight", what: "What to cook, ranked on what you have and what needs using." },
              { Icon: BookOpenText, name: "Cookbook", what: "Your recipes. Paste one in as it is written and it gets picked apart." },
              { Icon: Compass, name: "Discover", what: "What everyone else is cooking." },
            ].map(({ Icon, name: tab, what }) => (
              <li
                key={tab}
                className="flex gap-3 rounded-[16px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">{tab}</p>
                  <p className="text-sm font-medium text-muted-foreground">{what}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && !result.ok && result.error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {result.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        {at > 0 && (
          <button
            type="button"
            onClick={() => setAt((n) => n - 1)}
            aria-label="Back a step"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-chip text-muted-foreground"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={3} />
          </button>
        )}

        <button
          type="button"
          disabled={pending || (step === "kitchen" && name.trim() === "")}
          onClick={() => {
            if (step === "kitchen") saveThen(() => nameKitchen(name));
            else if (step === "cook") saveThen(() => howYouCook(slots, servings));
            else if (step === "staples") {
              if (picked.length === 0) forward();
              else saveThen(() => addStaples(picked));
            } else if (last) leave();
            else forward();
          }}
          className="h-14 flex-1 rounded-[14px] bg-primary text-[15px] font-extrabold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "…" : last ? "Start cooking" : "Continue"}
        </button>
      </div>

      {/* Leaving early still counts as being shown round. Being asked twice is
          the part people resent, not the asking. */}
      {!last && (
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="w-full text-sm font-bold text-muted-foreground underline underline-offset-2 disabled:opacity-40"
        >
          Skip all this
        </button>
      )}

      {last && (
        <p className="text-center text-sm font-semibold text-muted-foreground">
          Something wrong later on?{" "}
          <Link
            href="/report"
            className="font-bold text-primary underline underline-offset-2"
          >
            Tell me
          </Link>
          .
        </p>
      )}
    </div>
  );
}

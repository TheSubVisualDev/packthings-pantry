"use client";

import Image from "next/image";
import { describeAmount, formatQuantity } from "@/lib/units";
import type { RecipeDraft, RecipePhotos } from "@/components/recipe-editor";

/**
 * The recipe as a reader meets it, rendered from the draft rather than the
 * database.
 *
 * Deliberately not the cooking view. That one scales quantities, resolves them
 * against stock and lets you tick steps off - none of which is meaningful for
 * something unsaved, and all of which would bury the thing you're actually
 * checking while you write: does this read well.
 */

const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";

function placeholder(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  const hue = 20 + (hash % 90);
  return `linear-gradient(135deg, oklch(0.82 0.09 ${hue}), oklch(0.58 0.13 ${hue - 12}))`;
}

export function RecipePreview({
  draft,
  photos,
}: {
  draft: RecipeDraft;
  photos?: RecipePhotos;
}) {
  const name = draft.name.trim() || "Untitled recipe";

  const timing = [
    draft.prep_minutes ? `${draft.prep_minutes} min prep` : null,
    draft.cook_minutes ? `${draft.cook_minutes} min cooking` : null,
  ].filter(Boolean);

  const lines = draft.ingredients.filter((line) => line.item_name.trim());
  const steps = draft.steps.filter((step) => step.body.trim());

  // Grouped in the order given, so a section heading appears where its lines
  // start rather than being sorted somewhere else.
  const sections: { name: string; lines: typeof lines }[] = [];
  for (const line of lines) {
    const heading = line.section.trim();
    const last = sections.at(-1);
    if (last && last.name === heading) last.lines.push(line);
    else sections.push({ name: heading, lines: [line] });
  }

  return (
    <article className="mx-auto w-full max-w-[520px]">
      <div className="relative aspect-[2/1] overflow-hidden rounded-[20px]">
        {photos?.hero ? (
          <Image
            src={photos.hero}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 500px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full" style={{ background: placeholder(name) }} />
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pt-16">
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em] break-words text-white">
            {name}
          </h1>
          {draft.description.trim() && (
            <p className="mt-1 text-sm leading-relaxed font-medium text-white/85">
              {draft.description}
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-[13px] font-semibold text-muted-foreground">
        {[
          `serves ${draft.base_servings || "?"}`,
          ...timing,
          draft.source.trim() ? `from ${draft.source}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <h2 className={`mt-6 mb-2.5 block ${LABEL}`}>Ingredients</h2>
      {lines.length === 0 ? (
        <p className="rounded-[16px] bg-card p-4 text-sm font-semibold text-muted-foreground">
          Nothing yet.
        </p>
      ) : (
        sections.map((section, index) => (
          <div key={`${section.name}-${index}`} className="mb-3 last:mb-0">
            {section.name && (
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {section.name}
              </h3>
            )}
            <ul className="overflow-hidden rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {section.lines.map((line, lineIndex) => (
                <li
                  key={lineIndex}
                  className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <span className="min-w-0 font-bold break-words">
                    {line.item_name}
                    {line.optional && (
                      <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                        optional
                      </span>
                    )}
                    {line.note.trim() && (
                      <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                        · {line.note}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-quantity">
                    {line.quantity.trim()
                      ? describeAmount(Number(line.quantity), line.unit, {
                          size: line.pack_size.trim() ? Number(line.pack_size) : null,
                          unit: line.pack_size.trim() ? line.pack_unit : null,
                        })
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {steps.length > 0 && (
        <>
          <h2 className={`mt-6 mb-2.5 block ${LABEL}`}>Method</h2>
          <ol className="space-y-2">
            {steps.map((step, index) => {
              const stepId = photos?.stepIds[draft.steps.indexOf(step)];
              const photo = stepId !== undefined ? photos?.steps[stepId] : null;

              return (
                <li
                  key={index}
                  className="flex gap-3 rounded-[16px] bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-relaxed font-medium break-words">
                      {step.body}
                    </p>
                    {photo && (
                      <div className="relative mt-2.5 aspect-[16/9] overflow-hidden rounded-[12px]">
                        <Image src={photo} alt="" fill sizes="480px" className="object-cover" />
                      </div>
                    )}
                    {(step.minutes.trim() || step.uses.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {step.minutes.trim() && (
                          <span className="rounded-full bg-[oklch(0.94_0.06_75)] px-2.5 py-1 text-xs font-bold text-[oklch(0.42_0.1_60)]">
                            {step.minutes} min
                          </span>
                        )}
                        {step.uses.map((used) => {
                          const line = lines.find((entry) => entry.item_name === used);
                          return (
                            <span
                              key={used}
                              className="rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted-foreground"
                            >
                              {line?.quantity.trim()
                                ? `${formatQuantity(Number(line.quantity))}${line.unit === "count" ? "" : line.unit} `
                                : ""}
                              {used}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {draft.notes.trim() && (
        <>
          <h2 className={`mt-6 mb-2.5 block ${LABEL}`}>Notes</h2>
          <p className="rounded-[16px] bg-card p-4 text-sm leading-relaxed font-medium shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {draft.notes}
          </p>
        </>
      )}
    </article>
  );
}

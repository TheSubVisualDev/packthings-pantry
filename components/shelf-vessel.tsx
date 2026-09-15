import { fillFor, tintFor, vesselFor, type Vessel as Kind } from "@/lib/vessel";
import { daysUntil } from "@/lib/dates";
import type { Item } from "@/lib/types";

/**
 * One thing on a shelf, drawn as the thing it is.
 *
 * Not to be confused with `Vessel` in components/vessel.tsx, which is the
 * control you drag to SAY how full something is. This one only ever reports:
 * it takes no interaction, renders on the server, and exists so a shelf can be
 * read at a glance rather than tabulated. They agree about what shape a thing
 * is because they both ask lib/vessel.ts.
 *
 * The silhouettes live here rather than in lib because they are the picture
 * and that file is the decision - what shape a thing is has to be testable
 * without a renderer, and check:vessel would otherwise be importing path data
 * to ask a question about food.
 *
 * Everything drawn below comes from columns the app has had since containers
 * arrived: `quantity` against `pack_size` is the level, `sealed_count` is the
 * ghost standing behind, `opened_at` breaks the seal across the shoulder, and
 * `expiry_date` turns the outline red. None of it is new. It was all there,
 * being rendered as a number in a list.
 */

/** Drawn in a 60x76 box so every shape shares a baseline and a shelf line. */
const PATHS: Record<Kind, string> = {
  bottle: "M24 4 h12 v13 l10 11 v32 a6 6 0 0 1 -6 6 h-20 a6 6 0 0 1 -6 -6 v-32 l10 -11 z",
  carton: "M12 24 l18 -14 l18 14 v36 a6 6 0 0 1 -6 6 h-24 a6 6 0 0 1 -6 -6 z",
  jar: "M14 20 h32 a6 6 0 0 1 6 6 v34 a6 6 0 0 1 -6 6 h-32 a6 6 0 0 1 -6 -6 v-34 a6 6 0 0 1 6 -6 z",
  bag: "M16 22 q14 -7 28 0 l4 38 a6 6 0 0 1 -6 6 h-24 a6 6 0 0 1 -6 -6 z",
  tub: "M13 26 h34 l-4 34 a6 6 0 0 1 -6 6 h-14 a6 6 0 0 1 -6 -6 z",
  spice: "M21 24 h18 v36 a5 5 0 0 1 -5 5 h-8 a5 5 0 0 1 -5 -5 z",
  tin: "M14 22 h32 v38 a6 6 0 0 1 -6 6 h-20 a6 6 0 0 1 -6 -6 z",
  block: "M11 28 h38 a4 4 0 0 1 4 4 v28 a6 6 0 0 1 -6 6 h-34 a6 6 0 0 1 -6 -6 v-28 a4 4 0 0 1 4 -4 z",
  tray: "M9 32 h42 l-4 28 a6 6 0 0 1 -6 6 h-22 a6 6 0 0 1 -6 -6 z",
  pips: "M14 20 h32 a6 6 0 0 1 6 6 v34 a6 6 0 0 1 -6 6 h-32 a6 6 0 0 1 -6 -6 v-34 a6 6 0 0 1 6 -6 z",
};

/** The lid or cap, drawn solid so the contents cannot climb into it. */
const CAPS: Partial<Record<Kind, string>> = {
  bottle: "M23 2 h14 a2 2 0 0 1 2 2 v4 h-18 v-4 a2 2 0 0 1 2 -2 z",
  jar: "M12 14 h36 a3 3 0 0 1 3 3 v4 h-42 v-4 a3 3 0 0 1 3 -3 z",
  tub: "M11 22 h38 a2 2 0 0 1 2 2 v3 h-42 v-3 a2 2 0 0 1 2 -2 z",
  spice: "M20 18 h20 a2 2 0 0 1 2 2 v5 h-24 v-5 a2 2 0 0 1 2 -2 z",
};

/**
 * Where the contents start and stop inside each silhouette.
 *
 * So a fraction becomes a level in the right place rather than a fraction of
 * the whole box: half a bottle is halfway up the body, not halfway up the
 * neck, and getting that wrong makes every bottle look fuller than it is.
 */
const SPAN: Record<Kind, [number, number]> = {
  bottle: [28, 66], carton: [24, 66], jar: [20, 66], bag: [22, 66],
  tub: [26, 66], spice: [24, 65], tin: [22, 66], block: [28, 66],
  tray: [32, 66], pips: [20, 66],
};

const INK = "oklch(0.42 0.02 55)";
const FADE = "oklch(0.78 0.02 65)";
const ALARM = "oklch(0.55 0.16 40)";

export function ShelfVessel({ item, size = 44 }: { item: Item; size?: number }) {
  const kind = vesselFor(item.name, item.canonical_unit, item.dimension);
  const fill = fillFor(item);
  const tint = tintFor(item.name, kind);

  const [top, bottom] = SPAN[kind];
  const level = fill === null ? 76 : bottom - (bottom - top) * fill;

  /**
   * Red for something actually past, never for a guess.
   *
   * The same rule the item screen follows, kept identical so the two cannot
   * drift: the app has no business raising an alarm about a date it invented
   * from the average life of bread.
   */
  const left = item.expiry_date ? daysUntil(item.expiry_date) : null;
  const urgent = left !== null && left <= 0 && item.expiry_estimated !== 1;

  const outline = fill === null ? FADE : urgent ? ALARM : INK;

  /**
   * Counted things are drawn as that many things.
   *
   * Three of six eggs is three eggs, not a box shaded halfway up - half an egg
   * is not a quantity anybody has, and a level implies a continuum the thing
   * does not have. This is the one kind where the picture changes rather than
   * the silhouette, which is why it returns early.
   */
  if (kind === "pips" && fill !== null && item.pack_size) {
    const total = Math.min(9, Math.max(1, Math.round(item.pack_size)));
    const have = Math.max(0, Math.min(total, Math.round(item.quantity)));
    const columns = total <= 4 ? 2 : 3;
    const radius = total <= 4 ? 11 : 8.5;

    return (
      <svg
        viewBox="0 0 60 76"
        width={size}
        height={Math.round((size / 60) * 76)}
        role="img"
        aria-label={`${item.name}, ${have} of ${Math.round(item.pack_size)}`}
        className="block"
      >
        {Array.from({ length: total }, (_, index) => {
          const rows = Math.ceil(total / columns);
          const column = index % columns;
          const row = Math.floor(index / columns);
          const spread = radius * 2 + 3;
          return (
            <circle
              key={index}
              cx={30 + (column - (columns - 1) / 2) * spread}
              cy={44 + (row - (rows - 1) / 2) * spread}
              r={radius}
              fill={index < have ? tint : "oklch(0.965 0.012 60)"}
              stroke={index < have ? (urgent ? ALARM : INK) : FADE}
              strokeWidth="2.2"
            />
          );
        })}
      </svg>
    );
  }

  /**
   * A clip id per item, not per shape.
   *
   * Two vessels of the same kind on one page sharing an id means the second is
   * clipped by the first one's element, and on a shelf of forty-seven that is
   * every vessel after the first of each kind.
   */
  const clip = `shelf-vessel-${item.id}`;

  return (
    <svg
      viewBox="0 0 60 76"
      width={size}
      height={Math.round((size / 60) * 76)}
      role="img"
      aria-label={
        fill === null
          ? `${item.name}, amount not recorded`
          : `${item.name}, about ${Math.round(fill * 100)} per cent full`
      }
      className="block"
    >
      <defs>
        <clipPath id={clip}>
          <path d={PATHS[kind]} />
        </clipPath>
      </defs>

      {/*
        A sealed spare standing behind, offset so it reads as a second
        container rather than as a shadow. Only ever one, however many there
        are: "there is a spare" is the useful fact, and six ghosts is a picture
        of a warehouse.
      */}
      {item.sealed_count > 0 && (
        <g transform="translate(9 3) scale(0.86)" opacity="0.45">
          <path
            d={PATHS[kind]}
            fill={tint}
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </g>
      )}

      <path d={PATHS[kind]} fill="oklch(0.965 0.012 60)" />
      {fill !== null && (
        <g clipPath={`url(#${clip})`}>
          <rect x="0" y={level} width="60" height="76" fill={tint} />
        </g>
      )}

      <path
        d={PATHS[kind]}
        fill="none"
        stroke={outline}
        strokeWidth={urgent ? 3 : 2.5}
        strokeLinejoin="round"
        strokeDasharray={fill === null ? "6 5" : undefined}
      />
      {CAPS[kind] && <path d={CAPS[kind]} fill={outline} />}

      {/* A broken seal along the shoulder: this one is open, so the date on
          the packet has stopped being the answer. */}
      {item.opened_at && (
        <path
          d={`M8 ${top} h44`}
          stroke={outline}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 7"
        />
      )}

      {fill === null && (
        <text x="30" y="55" textAnchor="middle" fontSize="24" fontWeight="800" fill={FADE}>
          ?
        </text>
      )}
    </svg>
  );
}

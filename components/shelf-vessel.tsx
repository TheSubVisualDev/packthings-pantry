import { fillFor, shortAmount, tintFor, vesselFor } from "@/lib/vessel";
import { daysUntil } from "@/lib/dates";
import type { Item } from "@/lib/types";
import { CAPS, CRIMPS, PATHS, SPAN } from "@/components/vessel-shapes";

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

  /**
   * No level is two different facts, and they were drawn as one.
   *
   * `unspecified` is "there is some, nobody said how much" - a genuine blank,
   * dashed with a ?. The other is an amount with no pack size to measure it
   * against: Unsalted butter, 410g, drawn as a ? under a line saying nobody
   * had said the amount, while the stock list said 410g. That one is drawn
   * solid and carries its amount instead, because the amount IS known.
   */
  const unknown = fill === null && item.unspecified === 1;
  const amount = fill === null && !unknown ? shortAmount(item) : null;

  const outline = unknown ? FADE : urgent ? ALARM : INK;

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
        unknown
          ? `${item.name}, amount not recorded`
          : amount !== null
            ? `${item.name}, ${amount}`
            : `${item.name}, about ${Math.round(fill! * 100)} per cent full`
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
        strokeDasharray={unknown ? "6 5" : undefined}
      />
      {CAPS[kind] && <path d={CAPS[kind]} fill={outline} />}
      {CRIMPS[kind] && (
        <path
          d={CRIMPS[kind]}
          fill="none"
          stroke={outline}
          strokeWidth={urgent ? 3 : 2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={unknown ? "6 5" : undefined}
        />
      )}

      {/*
        This one is open, so the date on the packet has stopped being the
        answer.

        Inset and thin rather than a heavy line across the full width: at the
        shoulder, edge to edge, it read as the RIM OF A TIN - which is how a
        bag of carrots came to look like a can. It is a seal that has been
        broken, so it sits inside the outline rather than replacing it.
      */}
      {item.opened_at && (
        <path
          d={`M18 ${top + 4} h24`}
          stroke={outline}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1 5"
          opacity="0.75"
        />
      )}

      {unknown && (
        <text x="30" y="55" textAnchor="middle" fontSize="24" fontWeight="800" fill={FADE}>
          ?
        </text>
      )}
      {/*
        On a label stuck to the front rather than written in the space inside:
        a spice jar is 18 units wide and "155g" is not, so text in the body
        crossed its outline. A label may overhang a narrow jar, which is what
        labels do.
      */}
      {amount !== null && (() => {
        const size = 13;
        const width = amount.length * size * 0.62 + 8;
        const middle = Math.min(54, (top + bottom) / 2);
        return (
          <g>
            <rect
              x={30 - width / 2}
              y={middle - size / 2 - 3}
              width={width}
              height={size + 6}
              rx="4"
              fill="oklch(0.99 0.004 60)"
              stroke={INK}
              strokeWidth="1.5"
            />
            <text
              x="30"
              y={middle + size / 2 - 1.5}
              textAnchor="middle"
              fontSize={size}
              fontWeight="800"
              fill={INK}
            >
              {amount}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

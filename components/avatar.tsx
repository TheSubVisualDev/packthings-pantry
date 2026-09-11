import Image from "next/image";

/**
 * Someone's picture, or their initial.
 *
 * Most people won't upload one, so the fallback has to look deliberate rather
 * than broken - an initial on a tinted circle, with the tint derived from the
 * handle so the same person is the same colour everywhere.
 */
export function Avatar({
  handle,
  displayName,
  url,
  size = 40,
}: {
  handle: string;
  displayName?: string | null;
  url: string | null;
  size?: number;
}) {
  let hash = 0;
  for (const character of handle) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  const hue = 20 + (hash % 90);

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: url ? undefined : `oklch(0.86 0.07 ${hue})`,
      }}
    >
      {url ? (
        <Image src={url} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span
          className="font-extrabold text-[oklch(0.36_0.09_var(--h))]"
          style={
            {
              fontSize: Math.round(size * 0.42),
              "--h": String(hue),
            } as React.CSSProperties
          }
        >
          {(displayName || handle).charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

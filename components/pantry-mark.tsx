/**
 * The cupboard mark from public/pantry-logo.svg, inlined so it can take the
 * surrounding text colour. The file version keeps its provenance metadata and
 * fixed ink colour; this one is for the UI, where it has to theme.
 */
export function PantryMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 54 62"
      fill="none"
      stroke="currentColor"
      strokeWidth={4.5}
      aria-hidden
      className={className}
    >
      <path d="M6 18C6 11 15 7 27 7s21 4 21 11v34a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V18Z" />
      <line x1="6" y1="32" x2="48" y2="32" />
      <line x1="6" y1="45" x2="48" y2="45" />
      <path d="M13 55v4M41 55v4" strokeWidth={4} strokeLinecap="round" />
      <rect x="30" y="20" width="11" height="10.5" rx="2" fill="currentColor" stroke="none" />
      <rect x="33" y="16" width="5" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="35.5" width="8" height="8" rx="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

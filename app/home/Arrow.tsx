/** Small right arrow used after link and button labels. Inherits the text color. */
export default function Arrow({ size = 14 }: { size?: number }) {
  return (
    <svg className="rn-arrow" width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7h10M8 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

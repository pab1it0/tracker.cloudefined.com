interface MarkProps {
  size?: number
}

/** Inline SVG mark, matches public/favicon.svg. */
export function Mark({ size = 24 }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="mark"
    >
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.35" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.6" />
      <circle cx="16" cy="16" r="4" fill="var(--accent)" />
    </svg>
  )
}

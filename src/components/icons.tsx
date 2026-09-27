interface IconProps {
  size?: number
}

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function SunIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" {...base} />
      <g {...base}>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
      </g>
    </svg>
  )
}

export function MoonIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" {...base} />
    </svg>
  )
}

export function SystemIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" {...base} />
      <path d="M8 20h8M12 16v4" {...base} />
    </svg>
  )
}

export function LogoutIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4M16 17l4-5-4-5M20 12H9" {...base} />
    </svg>
  )
}

export function TargetIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" {...base} />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" {...base} />
    </svg>
  )
}

export function ExternalLinkIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6M20 4 10 14M19 13v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" {...base} />
    </svg>
  )
}

export function BatteryIcon({ size = 16, level }: IconProps & { level: number | null }) {
  const pct = level === null ? 0 : Math.max(0, Math.min(100, level))
  const fillWidth = (pct / 100) * 14
  return (
    <svg width={size} height={size} viewBox="0 0 24 14" aria-hidden="true">
      <rect x="1" y="1" width="19" height="12" rx="2.5" {...base} />
      <rect x="21" y="4.5" width="2" height="5" rx="1" fill="currentColor" stroke="none" />
      <rect x="3" y="3" width={fillWidth} height="8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ChevronIcon({ size = 16, direction = 'down' }: IconProps & { direction?: 'up' | 'down' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ transform: direction === 'up' ? 'rotate(180deg)' : undefined }}
    >
      <path d="M6 9l6 6 6-6" {...base} />
    </svg>
  )
}

export function TableIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" {...base} />
      <path d="M3 9h18M3 15h18M9 4v16M15 4v16" {...base} />
    </svg>
  )
}

export function PlayIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PauseIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const clockFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export function formatClock(iso: string): string {
  return clockFmt.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

export function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString()
}

/** "Today" / "Yesterday" / "Sat 26 Sep" for a local calendar day. */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return dayFmt.format(date)
}

export function formatRelative(iso: string, nowMs: number = Date.now()): string {
  const deltaS = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000))
  if (deltaS < 5) return 'just now'
  if (deltaS < 60) return `${deltaS} s ago`
  const deltaMin = Math.round(deltaS / 60)
  if (deltaMin < 60) return `${deltaMin} min ago`
  const deltaH = Math.round(deltaMin / 60)
  if (deltaH < 24) return `${deltaH} h ago`
  const deltaD = Math.round(deltaH / 24)
  return `${deltaD} d ago`
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function formatKmh(mps: number | null): string {
  if (mps === null) return '—'
  return `${(mps * 3.6).toFixed(1)} km/h`
}

export function formatBattery(pct: number | null): string {
  if (pct === null) return '—'
  return `${Math.round(pct)}%`
}

export function formatAccuracy(m: number | null): string {
  if (m === null) return '—'
  return `±${Math.round(m)} m`
}

/** HH:MM:SS + short date, for the playback readout. */
export function formatPlaybackClock(iso: string): string {
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
  return `${clockFmt.format(date)} · ${day}`
}

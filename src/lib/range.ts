export type RangePreset = '24h' | '7d' | '30d' | 'custom'

export interface Range {
  preset: RangePreset
  from: string
  to: string
}

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function rangeForPreset(preset: Exclude<RangePreset, 'custom'>, now: Date = new Date()): Range {
  const to = now.toISOString()
  const spanMs = preset === '24h' ? DAY_MS : preset === '7d' ? 7 * DAY_MS : 30 * DAY_MS
  const from = new Date(now.getTime() - spanMs).toISOString()
  return { preset, from, to }
}

/** Parses a datetime-local value to ms since epoch, or null if empty/unparseable. */
export function parseLocalDateTime(value: string): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

export function customRange(fromLocal: string, toLocal: string): Range {
  return { preset: 'custom', from: new Date(fromLocal).toISOString(), to: new Date(toLocal).toISOString() }
}

/** For <input type="datetime-local"> defaults, in local time, minute precision. */
export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

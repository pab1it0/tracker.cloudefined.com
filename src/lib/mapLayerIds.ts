export const SOURCE_ROUTE = 'tracker-route'
export const SOURCE_POINTS = 'tracker-points'
export const SOURCE_PLAYED = 'tracker-played'
export const SOURCE_MARKERS = 'tracker-markers'
export const SOURCE_ACCURACY = 'tracker-accuracy'
export const SOURCE_HEAD = 'tracker-head'

export const LAYER_CASING = 'tracker-route-casing'
export const LAYER_ROUTE = 'tracker-route-line'
export const LAYER_PLAYED = 'tracker-played-line'
export const LAYER_POINTS = 'tracker-points-dots'
export const LAYER_POINTS_HIT = 'tracker-points-hit'
export const LAYER_MARKERS_RING = 'tracker-marker-start'
export const LAYER_MARKERS_END = 'tracker-marker-end'
export const LAYER_ACCURACY = 'tracker-accuracy-fill'
export const LAYER_ACCURACY_LINE = 'tracker-accuracy-line'
export const LAYER_HEAD_HALO = 'tracker-head-halo'
export const LAYER_HEAD = 'tracker-head-dot'

export function getCssColor(varName: string): string {
  if (typeof document === 'undefined') return '#000'
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || '#000'
}

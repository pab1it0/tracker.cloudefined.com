import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl'
import { ROUTE_RAMP } from './mapStyle.js'
import {
  getCssColor,
  LAYER_ACCURACY,
  LAYER_ACCURACY_LINE,
  LAYER_CASING,
  LAYER_HEAD,
  LAYER_HEAD_HALO,
  LAYER_MARKERS_END,
  LAYER_MARKERS_RING,
  LAYER_PLAYED,
  LAYER_POINTS,
  LAYER_POINTS_HIT,
  LAYER_ROUTE,
  SOURCE_ACCURACY,
  SOURCE_HEAD,
  SOURCE_MARKERS,
  SOURCE_PLAYED,
  SOURCE_POINTS,
  SOURCE_ROUTE,
} from './mapLayerIds.js'

function emptySource(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function gradientFor(ramp: { old: string; new: string }): ExpressionSpecification {
  return ['interpolate', ['linear'], ['line-progress'], 0, ramp.old, 1, ramp.new]
}

/** Adds all tracker sources+layers to the map. Safe to call repeatedly after a style change. */
export function ensureLayers(map: MapLibreMap, theme: 'light' | 'dark'): void {
  const ramp = ROUTE_RAMP[theme]

  for (const source of [SOURCE_ROUTE, SOURCE_PLAYED]) {
    if (!map.getSource(source)) map.addSource(source, { type: 'geojson', data: emptySource(), lineMetrics: true })
  }
  for (const source of [SOURCE_POINTS, SOURCE_MARKERS, SOURCE_ACCURACY, SOURCE_HEAD]) {
    if (!map.getSource(source)) map.addSource(source, { type: 'geojson', data: emptySource() })
  }

  if (!map.getLayer(LAYER_CASING)) {
    map.addLayer({
      id: LAYER_CASING,
      type: 'line',
      source: SOURCE_ROUTE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': getCssColor('--surface'), 'line-width': 7, 'line-opacity': 0.6 },
    })
  }

  if (!map.getLayer(LAYER_ROUTE)) {
    map.addLayer({
      id: LAYER_ROUTE,
      type: 'line',
      source: SOURCE_ROUTE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-width': 4, 'line-opacity': 0.35, 'line-gradient': gradientFor(ramp) },
    })
  }

  if (!map.getLayer(LAYER_PLAYED)) {
    map.addLayer({
      id: LAYER_PLAYED,
      type: 'line',
      source: SOURCE_PLAYED,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-width': 4, 'line-opacity': 1, 'line-gradient': gradientFor(ramp) },
    })
  }

  if (!map.getLayer(LAYER_ACCURACY)) {
    map.addLayer({
      id: LAYER_ACCURACY,
      type: 'fill',
      source: SOURCE_ACCURACY,
      paint: { 'fill-color': getCssColor('--accent'), 'fill-opacity': 0.12 },
    })
  }
  if (!map.getLayer(LAYER_ACCURACY_LINE)) {
    map.addLayer({
      id: LAYER_ACCURACY_LINE,
      type: 'line',
      source: SOURCE_ACCURACY,
      paint: { 'line-color': getCssColor('--accent'), 'line-width': 1 },
    })
  }

  if (!map.getLayer(LAYER_POINTS)) {
    map.addLayer({
      id: LAYER_POINTS,
      type: 'circle',
      source: SOURCE_POINTS,
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 18, 3.5],
        'circle-color': ['interpolate', ['linear'], ['get', 'ratio'], 0, ramp.old, 1, ramp.new],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': getCssColor('--surface'),
      },
    })
  }
  if (!map.getLayer(LAYER_POINTS_HIT)) {
    map.addLayer({
      id: LAYER_POINTS_HIT,
      type: 'circle',
      source: SOURCE_POINTS,
      paint: { 'circle-radius': 10, 'circle-opacity': 0 },
    })
  }

  if (!map.getLayer(LAYER_MARKERS_RING)) {
    map.addLayer({
      id: LAYER_MARKERS_RING,
      type: 'circle',
      source: SOURCE_MARKERS,
      filter: ['==', ['get', 'kind'], 'start'],
      paint: {
        'circle-radius': 6,
        'circle-color': getCssColor('--surface'),
        'circle-stroke-width': 2,
        'circle-stroke-color': ramp.new,
      },
    })
  }
  if (!map.getLayer(LAYER_MARKERS_END)) {
    map.addLayer({
      id: LAYER_MARKERS_END,
      type: 'circle',
      source: SOURCE_MARKERS,
      filter: ['==', ['get', 'kind'], 'end'],
      paint: {
        'circle-radius': 6,
        'circle-color': ramp.new,
        'circle-stroke-width': 2,
        'circle-stroke-color': getCssColor('--surface'),
      },
    })
  }

  if (!map.getLayer(LAYER_HEAD_HALO)) {
    map.addLayer({
      id: LAYER_HEAD_HALO,
      type: 'circle',
      source: SOURCE_HEAD,
      paint: { 'circle-radius': 14, 'circle-color': ramp.new, 'circle-opacity': 0.25, 'circle-blur': 0.6 },
    })
  }
  if (!map.getLayer(LAYER_HEAD)) {
    map.addLayer({
      id: LAYER_HEAD,
      type: 'circle',
      source: SOURCE_HEAD,
      paint: {
        'circle-radius': 6,
        'circle-color': ramp.new,
        'circle-stroke-width': 2,
        'circle-stroke-color': getCssColor('--surface'),
      },
    })
  }
}

/** Re-applies theme-dependent paint props (route ramp, surface colors) after a style/theme switch. */
export function applyThemePaint(map: MapLibreMap, theme: 'light' | 'dark'): void {
  const ramp = ROUTE_RAMP[theme]
  const surface = getCssColor('--surface')
  const accent = getCssColor('--accent')
  const gradient = gradientFor(ramp)

  if (map.getLayer(LAYER_ROUTE)) map.setPaintProperty(LAYER_ROUTE, 'line-gradient', gradient)
  if (map.getLayer(LAYER_PLAYED)) map.setPaintProperty(LAYER_PLAYED, 'line-gradient', gradient)
  if (map.getLayer(LAYER_CASING)) map.setPaintProperty(LAYER_CASING, 'line-color', surface)
  if (map.getLayer(LAYER_POINTS)) {
    map.setPaintProperty(LAYER_POINTS, 'circle-color', [
      'interpolate',
      ['linear'],
      ['get', 'ratio'],
      0,
      ramp.old,
      1,
      ramp.new,
    ])
    map.setPaintProperty(LAYER_POINTS, 'circle-stroke-color', surface)
  }
  if (map.getLayer(LAYER_MARKERS_RING)) {
    map.setPaintProperty(LAYER_MARKERS_RING, 'circle-color', surface)
    map.setPaintProperty(LAYER_MARKERS_RING, 'circle-stroke-color', ramp.new)
  }
  if (map.getLayer(LAYER_MARKERS_END)) {
    map.setPaintProperty(LAYER_MARKERS_END, 'circle-color', ramp.new)
    map.setPaintProperty(LAYER_MARKERS_END, 'circle-stroke-color', surface)
  }
  if (map.getLayer(LAYER_ACCURACY)) map.setPaintProperty(LAYER_ACCURACY, 'fill-color', accent)
  if (map.getLayer(LAYER_ACCURACY_LINE)) map.setPaintProperty(LAYER_ACCURACY_LINE, 'line-color', accent)
  if (map.getLayer(LAYER_HEAD_HALO)) map.setPaintProperty(LAYER_HEAD_HALO, 'circle-color', ramp.new)
  if (map.getLayer(LAYER_HEAD)) {
    map.setPaintProperty(LAYER_HEAD, 'circle-color', ramp.new)
    map.setPaintProperty(LAYER_HEAD, 'circle-stroke-color', surface)
  }
}

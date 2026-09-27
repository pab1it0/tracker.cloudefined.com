import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { TrackPoint } from '../../lib/shared/types.js'
import { circlePolygon } from '../../lib/shared/geo.js'
import { SOURCE_ACCURACY, SOURCE_HEAD, SOURCE_MARKERS, SOURCE_PLAYED, SOURCE_POINTS, SOURCE_ROUTE } from './mapLayerIds.js'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function setData(map: MapLibreMap, sourceId: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  source?.setData(data)
}

function pointsToLineString(points: TrackPoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) },
  }
}

export function updateRoute(map: MapLibreMap, points: TrackPoint[]): void {
  if (points.length < 2) {
    setData(map, SOURCE_ROUTE, EMPTY_FC)
    return
  }
  setData(map, SOURCE_ROUTE, { type: 'FeatureCollection', features: [pointsToLineString(points)] })
}

export function updatePlayed(map: MapLibreMap, points: TrackPoint[], head: [number, number] | null): void {
  const coords: [number, number][] = points.map((p) => [p.lon, p.lat])
  if (head) coords.push(head)
  if (coords.length < 2) {
    setData(map, SOURCE_PLAYED, EMPTY_FC)
    return
  }
  const feature: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  }
  setData(map, SOURCE_PLAYED, { type: 'FeatureCollection', features: [feature] })
}

export function updatePoints(map: MapLibreMap, points: TrackPoint[]): void {
  const total = points.length > 1 ? points.length - 1 : 1
  const features: GeoJSON.Feature<GeoJSON.Point>[] = points.map((p, i) => ({
    type: 'Feature',
    properties: { index: i, ratio: i / total },
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
  }))
  setData(map, SOURCE_POINTS, { type: 'FeatureCollection', features })
}

export function updateMarkers(map: MapLibreMap, points: TrackPoint[]): void {
  if (points.length === 0) {
    setData(map, SOURCE_MARKERS, EMPTY_FC)
    return
  }
  const first = points[0]!
  const last = points[points.length - 1]!
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [
    { type: 'Feature', properties: { kind: 'start' }, geometry: { type: 'Point', coordinates: [first.lon, first.lat] } },
  ]
  if (points.length > 1) {
    features.push({
      type: 'Feature',
      properties: { kind: 'end' },
      geometry: { type: 'Point', coordinates: [last.lon, last.lat] },
    })
  }
  setData(map, SOURCE_MARKERS, { type: 'FeatureCollection', features })
}

export function updateAccuracy(
  map: MapLibreMap,
  point: { lon: number; lat: number; acc: number | null } | null,
): void {
  if (!point || point.acc === null || point.acc <= 0) {
    setData(map, SOURCE_ACCURACY, EMPTY_FC)
    return
  }
  const ring = circlePolygon(point.lon, point.lat, point.acc)
  setData(map, SOURCE_ACCURACY, {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
  })
}

export function updateHead(map: MapLibreMap, position: [number, number] | null): void {
  if (!position) {
    setData(map, SOURCE_HEAD, EMPTY_FC)
    return
  }
  setData(map, SOURCE_HEAD, {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: position } }],
  })
}

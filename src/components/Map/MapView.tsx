import '../../lib/maplibreWorker.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import type { LatestPoint, TrackPoint } from '../../../lib/shared/types.js'
import { deriveSpeeds } from '../../../lib/shared/geo.js'
import { MAP_STYLES } from '../../lib/mapStyle.js'
import { LAYER_POINTS_HIT } from '../../lib/mapLayerIds.js'
import { applyThemePaint, ensureLayers } from '../../lib/mapSetup.js'
import {
  updateAccuracy,
  updateHead,
  updateMarkers,
  updatePlayed,
  updatePoints,
  updateRoute,
} from '../../lib/mapData.js'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery.js'
import { photoUrl } from '../../lib/api.js'
import { formatAbsolute } from '../../lib/format.js'
import type { PhotoGroup } from '../../lib/photoGroups.js'
import { HoverTooltip, type HoverInfo } from './HoverTooltip.js'

export interface MapViewHandle {
  jumpTo: (center: [number, number], zoom?: number) => void
  panInstant: (center: [number, number]) => void
}

interface PaddingBox {
  top: number
  bottom: number
  left: number
  right: number
}

interface MapViewProps {
  theme: 'light' | 'dark'
  points: TrackPoint[]
  playedPoints: TrackPoint[]
  headPosition: [number, number] | null
  latest: LatestPoint | null
  fitBbox: [number, number, number, number] | null
  fitPadding: PaddingBox
  fitToken: number
  photos: PhotoGroup[]
  onPhotoClick: (photo: PhotoGroup) => void
  onMapReady?: (handle: MapViewHandle) => void
}

export function MapView({
  theme,
  points,
  playedPoints,
  headPosition,
  latest,
  fitBbox,
  fitPadding,
  fitToken,
  photos,
  onPhotoClick,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const pointsRef = useRef<TrackPoint[]>(points)
  pointsRef.current = points
  const speeds = useMemo(() => deriveSpeeds(points), [points])
  const speedsRef = useRef<(number | null)[]>(speeds)
  speedsRef.current = speeds
  const latestMarkerRef = useRef<Marker | null>(null)
  const playedPointsRef = useRef<TrackPoint[]>(playedPoints)
  playedPointsRef.current = playedPoints
  const headPositionRef = useRef<[number, number] | null>(headPosition)
  headPositionRef.current = headPosition
  const latestRef = useRef<LatestPoint | null>(latest)
  latestRef.current = latest
  const photoMarkersRef = useRef<Map<string, Marker>>(new Map())
  const onPhotoClickRef = useRef(onPhotoClick)
  onPhotoClickRef.current = onPhotoClick

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLES[theme],
      center: [34.765, 32.06],
      zoom: 12,
      attributionControl: { compact: true },
    })
    mapRef.current = map

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    const setup = () => {
      ensureLayers(map, theme)
      readyRef.current = true
      setReady(true)
      onMapReady?.({
        jumpTo: (center, zoom) => {
          if (reducedMotion) map.jumpTo({ center, zoom })
          else map.flyTo({ center, zoom, duration: 600 })
        },
        panInstant: (center) => {
          map.jumpTo({ center })
        },
      })
    }

    map.on('load', setup)
    map.on('style.load', () => {
      if (!readyRef.current) return
      ensureLayers(map, theme)
      updateRoute(map, pointsRef.current)
      updatePoints(map, pointsRef.current)
      updateMarkers(map, pointsRef.current)
      updatePlayed(map, playedPointsRef.current, headPositionRef.current)
      updateHead(map, headPositionRef.current)
      const latestPoint = latestRef.current
      updateAccuracy(map, latestPoint ? { lon: latestPoint.lon, lat: latestPoint.lat, acc: latestPoint.acc } : null)
    })

    let hoverIndex: number | null = null
    map.on('mousemove', LAYER_POINTS_HIT, (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      const index = feature.properties?.index as number | undefined
      if (index === undefined) return
      hoverIndex = index
      const point = pointsRef.current[index]
      if (!point) return
      const speedMps = speedsRef.current[index] ?? null
      setHover({ point: { ...point, speedMps }, x: e.point.x, y: e.point.y })
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', LAYER_POINTS_HIT, () => {
      hoverIndex = null
      setHover(null)
      map.getCanvas().style.cursor = ''
    })

    return () => {
      latestMarkerRef.current?.remove()
      latestMarkerRef.current = null
      for (const marker of photoMarkersRef.current.values()) marker.remove()
      photoMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!readyRef.current) return
    map.setStyle(MAP_STYLES[theme], { transformStyle: (_prev, next) => next })
    const reapply = () => applyThemePaint(map, theme)
    map.once('style.load', () => {
      ensureLayers(map, theme)
      reapply()
    })
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    updateRoute(map, points)
    updatePoints(map, points)
    updateMarkers(map, points)
  }, [points, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    updatePlayed(map, playedPoints, headPosition)
  }, [playedPoints, headPosition, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    updateHead(map, headPosition)
  }, [headPosition, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    if (!latest) {
      updateAccuracy(map, null)
      latestMarkerRef.current?.remove()
      latestMarkerRef.current = null
      return
    }

    updateAccuracy(map, { lon: latest.lon, lat: latest.lat, acc: latest.acc })

    if (!latestMarkerRef.current) {
      const el = document.createElement('div')
      el.className = reducedMotion ? 'latest-marker latest-marker--static' : 'latest-marker'
      el.innerHTML = '<span class="latest-marker-dot"></span>'
      latestMarkerRef.current = new Marker({ element: el })
        .setLngLat([latest.lon, latest.lat])
        .addTo(map)
    } else {
      latestMarkerRef.current.setLngLat([latest.lon, latest.lat])
    }
  }, [latest, reducedMotion, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const markers = photoMarkersRef.current
    const seen = new Set<string>()

    for (const photo of photos) {
      if (photo.lat === null || photo.lon === null) continue
      seen.add(photo.key)
      const shown = photo.front ?? photo.back
      if (!shown) continue
      let marker = markers.get(photo.key)
      if (!marker) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'photo-marker'
        el.setAttribute('aria-label', `Photo at ${formatAbsolute(photo.t)}`)
        const img = document.createElement('img')
        img.src = photoUrl(shown.id, 'thumb')
        img.alt = `Photo at ${formatAbsolute(photo.t)}`
        img.loading = 'lazy'
        img.decoding = 'async'
        el.appendChild(img)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onPhotoClickRef.current(photo)
        })
        marker = new Marker({ element: el }).setLngLat([photo.lon, photo.lat]).addTo(map)
        markers.set(photo.key, marker)
      } else {
        marker.setLngLat([photo.lon, photo.lat])
      }
    }

    for (const [key, marker] of markers) {
      if (!seen.has(key)) {
        marker.remove()
        markers.delete(key)
      }
    }
  }, [photos, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !fitBbox) return
    map.fitBounds(
      [
        [fitBbox[0], fitBbox[1]],
        [fitBbox[2], fitBbox[3]],
      ],
      { padding: fitPadding, duration: reducedMotion ? 0 : 600, maxZoom: 17 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, ready])

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-canvas" />
      {hover && <HoverTooltip info={hover} />}
    </div>
  )
}

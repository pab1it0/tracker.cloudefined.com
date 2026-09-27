import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrackPoint } from '../../lib/shared/types.js'
import { clampCursor, interpolate, playedSubset } from '../../lib/shared/playback.js'

export const PLAYBACK_SPEEDS = [1, 10, 60, 300, 600] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]
const DEFAULT_SPEED: PlaybackSpeed = 60

export interface PlaybackState {
  playing: boolean
  speed: PlaybackSpeed
  follow: boolean
  cursorMs: number
  minMs: number
  maxMs: number
  headPosition: [number, number] | null
  playedPoints: TrackPoint[]
  togglePlay: () => void
  setSpeed: (speed: PlaybackSpeed) => void
  cycleSpeed: (direction: 1 | -1) => void
  toggleFollow: () => void
  seekTo: (ms: number) => void
  step: (deltaPoints: number) => void
  stepTime: (deltaMs: number) => void
  reset: () => void
}

export function usePlayback(points: TrackPoint[]): PlaybackState {
  const minMs = points.length > 0 ? new Date(points[0]!.t).getTime() : 0
  const maxMs = points.length > 0 ? new Date(points[points.length - 1]!.t).getTime() : 0

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeedState] = useState<PlaybackSpeed>(DEFAULT_SPEED)
  const [follow, setFollow] = useState(true)
  const [cursorMs, setCursorMs] = useState(minMs)

  const cursorRef = useRef(cursorMs)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number | null>(null)
  const throttleRef = useRef(0)

  // Only a new track (minMs change) resets the cursor; a growing maxMs (new live
  // points) must not rewind playback to the start.
  useEffect(() => {
    cursorRef.current = minMs
    setCursorMs(minMs)
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minMs])

  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = (now: number) => {
      if (lastTickRef.current === null) lastTickRef.current = now
      const dt = now - lastTickRef.current
      lastTickRef.current = now

      const next = cursorRef.current + dt * speed
      if (next >= maxMs) {
        cursorRef.current = maxMs
        setCursorMs(maxMs)
        setPlaying(false)
        return
      }

      cursorRef.current = next
      const nowMs = performance.now()
      if (nowMs - throttleRef.current > 66) {
        throttleRef.current = nowMs
        setCursorMs(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [playing, speed, maxMs])

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && cursorRef.current >= maxMs) {
        cursorRef.current = minMs
        setCursorMs(minMs)
      }
      return !p
    })
  }, [maxMs, minMs])

  const setSpeed = useCallback((s: PlaybackSpeed) => setSpeedState(s), [])

  const cycleSpeed = useCallback((direction: 1 | -1) => {
    setSpeedState((current) => {
      const idx = PLAYBACK_SPEEDS.indexOf(current)
      const nextIdx = Math.min(PLAYBACK_SPEEDS.length - 1, Math.max(0, idx + direction))
      return PLAYBACK_SPEEDS[nextIdx]!
    })
  }, [])

  const toggleFollow = useCallback(() => setFollow((f) => !f), [])

  const seekTo = useCallback(
    (ms: number) => {
      const clamped = Math.min(maxMs, Math.max(minMs, ms))
      cursorRef.current = clamped
      setCursorMs(clamped)
    },
    [minMs, maxMs],
  )

  const step = useCallback(
    (deltaPoints: number) => {
      if (points.length === 0) return
      let nextIdx: number
      if (deltaPoints > 0) {
        // Land on the next point strictly after the cursor, so a cursor sitting
        // between two points doesn't skip the very next one.
        const i = points.findIndex((p) => new Date(p.t).getTime() > cursorRef.current)
        nextIdx = i === -1 ? points.length - 1 : i + deltaPoints - 1
      } else {
        const i = points.findIndex((p) => new Date(p.t).getTime() >= cursorRef.current)
        const currentIdx = i === -1 ? points.length - 1 : i
        nextIdx = currentIdx + deltaPoints
      }
      nextIdx = Math.min(points.length - 1, Math.max(0, nextIdx))
      seekTo(new Date(points[nextIdx]!.t).getTime())
    },
    [points, seekTo],
  )

  const stepTime = useCallback((deltaMs: number) => seekTo(cursorRef.current + deltaMs), [seekTo])

  const reset = useCallback(() => {
    setPlaying(false)
    cursorRef.current = minMs
    setCursorMs(minMs)
  }, [minMs])

  const clampedCursorMs = clampCursor(cursorMs, minMs, maxMs)
  const headPosition = useMemo(
    () => interpolate(points, clampedCursorMs),
    [points, clampedCursorMs],
  )
  const playedPoints = useMemo(
    () => playedSubset(points, clampedCursorMs),
    [points, clampedCursorMs],
  )

  return {
    playing,
    speed,
    follow,
    cursorMs: clampedCursorMs,
    minMs,
    maxMs,
    headPosition,
    playedPoints,
    togglePlay,
    setSpeed,
    cycleSpeed,
    toggleFollow,
    seekTo,
    step,
    stepTime,
    reset,
  }
}

import { useEffect } from 'react'
import type { PlaybackState } from './usePlayback.js'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

const MINUTE_MS = 60_000

export function usePlaybackKeys(playback: PlaybackState): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('dialog[open]')) return
      const target = e.target as Element | null
      if (e.key === ' ' && target?.closest?.('button, a, select, [role="button"], [role="option"]')) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          playback.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) playback.stepTime(-MINUTE_MS)
          else playback.step(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) playback.stepTime(MINUTE_MS)
          else playback.step(1)
          break
        case '[':
          playback.cycleSpeed(-1)
          break
        case ']':
          playback.cycleSpeed(1)
          break
        case 'Home':
          e.preventDefault()
          playback.seekTo(playback.minMs)
          break
        case 'End':
          e.preventDefault()
          playback.seekTo(playback.maxMs)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playback])
}

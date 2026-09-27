import type { TrackPoint } from '../../../lib/shared/types.js'
import type { PlaybackState } from '../../hooks/usePlayback.js'
import { PLAYBACK_SPEEDS } from '../../hooks/usePlayback.js'
import { formatPlaybackClock } from '../../lib/format.js'
import { PauseIcon, PlayIcon } from '../icons.js'
import { Scrubber } from './Scrubber.js'

interface PlaybackBarProps {
  points: TrackPoint[]
  playback: PlaybackState
  cursorIso: string
}

export function PlaybackBar({ points, playback, cursorIso }: PlaybackBarProps) {
  if (points.length < 2) return null

  return (
    <div className="playback-bar glass">
      <button
        type="button"
        className="playback-play"
        onClick={playback.togglePlay}
        aria-label={playback.playing ? 'Pause' : 'Play'}
      >
        {playback.playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="playback-readout tabular-nums">{formatPlaybackClock(cursorIso)}</div>

      <div className="playback-scrubber">
        <Scrubber
          points={points}
          minMs={playback.minMs}
          maxMs={playback.maxMs}
          cursorMs={playback.cursorMs}
          onSeek={playback.seekTo}
        />
      </div>

      <div className="playback-speeds" role="group" aria-label="Playback speed">
        {PLAYBACK_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`playback-speed-chip${playback.speed === s ? ' playback-speed-chip--active' : ''}`}
            aria-pressed={playback.speed === s}
            onClick={() => playback.setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`playback-follow${playback.follow ? ' playback-follow--active' : ''}`}
        aria-pressed={playback.follow}
        onClick={playback.toggleFollow}
      >
        Follow
      </button>
    </div>
  )
}

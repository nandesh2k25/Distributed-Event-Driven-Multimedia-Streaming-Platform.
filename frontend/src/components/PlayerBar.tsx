import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { formatDuration } from '../lib/api';

export function PlayerBar() {
  const p = useAudioPlayer();
  const { currentTrack: track, duration, currentTime } = p;
  const pct = (value: number) => (duration > 0 ? Math.min(100, (value / duration) * 100) : 0);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex h-20 items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-4 sm:px-8"
      role="region"
      aria-label="Audio player"
    >
      <div className="min-w-0 flex-1 basis-0 sm:flex-none sm:basis-60">
        {track ? (
          <>
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="truncate text-xs text-zinc-400">{track.artist?.name}</p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Select a track to play</p>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-3">
          <button onClick={p.previous} disabled={!track} aria-label="Previous track" className="text-zinc-300 hover:text-white disabled:opacity-40">
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={p.togglePlay}
            disabled={!track}
            aria-label={p.isPlaying ? 'Pause' : 'Play'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-950 disabled:opacity-40"
          >
            {p.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-px" />}
          </button>
          <button onClick={p.next} disabled={!track} aria-label="Next track" className="text-zinc-300 hover:text-white disabled:opacity-40">
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        <div className="flex w-full max-w-xl items-center gap-2 text-xs tabular-nums text-zinc-400">
          <span className="w-10 text-right">{formatDuration(currentTime)}</span>
          <div className="relative h-5 flex-1">
            {/* track + buffered intervals + played portion */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-700">
              {p.buffered.map(([start, end], i) => (
                <div
                  key={i}
                  data-testid="buffered-range"
                  className="absolute inset-y-0 bg-zinc-500"
                  style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
                />
              ))}
              <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct(currentTime)}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              disabled={!track}
              onChange={(e) => p.seek(Number(e.target.value))}
              aria-label="Seek"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
            />
          </div>
          <span className="w-10">{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="hidden flex-1 basis-0 items-center justify-end gap-2 sm:flex sm:flex-none sm:basis-60">
        <button
          onClick={() => p.setVolume(p.volume === 0 ? 1 : 0)}
          aria-label={p.volume === 0 ? 'Unmute' : 'Mute'}
          className="text-zinc-300 hover:text-white"
        >
          {p.volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="w-28 accent-emerald-500"
        />
      </div>

      {p.error && <p className="absolute -top-8 left-4 rounded bg-red-900 px-3 py-1 text-sm" role="alert">{p.error}</p>}
    </div>
  );
}

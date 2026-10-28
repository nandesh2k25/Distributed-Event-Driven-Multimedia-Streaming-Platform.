import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Track } from '../lib/api';
import { getToken } from '../lib/session';

export type BufferedRange = [start: number, end: number];

interface AudioPlayerState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  buffered: BufferedRange[];
  error: string | null;
}

interface AudioPlayerActions {
  /** Plays `track`; `queue` (defaults to just the track) becomes the playback queue. */
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  next: () => void;
  previous: () => void;
}

const AudioPlayerContext = createContext<(AudioPlayerState & AudioPlayerActions) | null>(null);

/** An <audio> element cannot send headers, so a signed-in user's token rides in the URL. */
export function streamUrl(trackId: string) {
  const token = getToken();
  return `/api/stream/${trackId}${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;
}

function readBuffered(audio: HTMLAudioElement): BufferedRange[] {
  const ranges: BufferedRange[] = [];
  for (let i = 0; i < audio.buffered.length; i++) {
    ranges.push([audio.buffered.start(i), audio.buffered.end(i)]);
  }
  return ranges;
}

/**
 * Owns the single <audio> element. Mount it above the router so route changes never
 * remount the element or interrupt playback.
 */
export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<AudioPlayerState>({
    currentTrack: null,
    queue: [],
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    buffered: [],
    error: null
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback((track: Track, queue: Track[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = streamUrl(track.id);
    setState((s) => ({
      ...s,
      currentTrack: track,
      queue,
      currentTime: 0,
      duration: track.duration,
      buffered: [],
      isBuffering: true,
      error: null
    }));
    void audio.play().catch((err: Error) => {
      if (err.name !== 'AbortError') setState((s) => ({ ...s, isPlaying: false, error: 'Unable to play this track' }));
    });
  }, []);

  const playTrack = useCallback<AudioPlayerActions['playTrack']>(
    (track, queue) => {
      const current = stateRef.current;
      if (current.currentTrack?.id === track.id) {
        audioRef.current?.paused && void audioRef.current.play();
        return;
      }
      load(track, queue ?? [track]);
    },
    [load]
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      const { currentTrack, queue } = stateRef.current;
      if (!currentTrack) return;
      const nextTrack = queue[queue.findIndex((t) => t.id === currentTrack.id) + delta];
      if (nextTrack) load(nextTrack, queue);
    },
    [load]
  );

  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => {
    const audio = audioRef.current;
    // Standard player behaviour: restart the track first, go back only when near its start.
    if (audio && audio.currentTime > 3) audio.currentTime = 0;
    else step(-1);
  }, [step]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !stateRef.current.currentTrack) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = stateRef.current.duration || audio.duration || 0;
    // Setting currentTime makes the browser issue a new Range request for the target offset.
    audio.currentTime = Math.min(Math.max(0, seconds), max);
    setState((s) => ({ ...s, currentTime: audio.currentTime }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.min(1, Math.max(0, volume));
    if (audioRef.current) audioRef.current.volume = clamped;
    setState((s) => ({ ...s, volume: clamped }));
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => setState((s) => ({ ...s, buffered: readBuffered(audio) }));
    const handlers: Record<string, () => void> = {
      play: () => setState((s) => ({ ...s, isPlaying: true })),
      pause: () => setState((s) => ({ ...s, isPlaying: false })),
      timeupdate: () => setState((s) => ({ ...s, currentTime: audio.currentTime })),
      loadedmetadata: () =>
        setState((s) => ({ ...s, duration: Number.isFinite(audio.duration) ? audio.duration : s.duration })),
      progress: sync,
      waiting: () => setState((s) => ({ ...s, isBuffering: true })),
      canplay: () => setState((s) => ({ ...s, isBuffering: false, buffered: readBuffered(audio) })),
      ended: () => {
        const { currentTrack, queue } = stateRef.current;
        const idx = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
        if (idx >= 0 && queue[idx + 1]) next();
        else setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
      },
      error: () => setState((s) => ({ ...s, isPlaying: false, isBuffering: false, error: 'Playback error' }))
    };
    for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler);
    };
  }, [next]);

  const value = useMemo(
    () => ({ ...state, playTrack, togglePlay, seek, setVolume, next, previous }),
    [state, playTrack, togglePlay, seek, setVolume, next, previous]
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" />
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}

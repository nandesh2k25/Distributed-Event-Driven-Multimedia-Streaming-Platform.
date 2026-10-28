import { useEffect, useState } from 'react';
import { api, type Track } from '../lib/api';

/** Polls a track until it leaves PROCESSING (reaching READY or FAILED). */
export function useTrackStatus(trackId: string | null, intervalMs = 2000) {
  const [track, setTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTrack(null);
    setError(null);
    if (!trackId) return;

    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const { data } = await api.track(trackId, ctrl.signal);
        setTrack(data);
        if (data.status === 'PROCESSING' || data.status === 'PENDING') timer = setTimeout(poll, intervalMs);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message);
        timer = setTimeout(poll, intervalMs * 2); // transient failure: back off and retry
      }
    };
    void poll();

    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [trackId, intervalMs]);

  return { track, error };
}

import { useCallback, useEffect, useRef, useState } from 'react';

interface WaveformVisualizerProps {
  /** Normalised amplitude peaks, each in [0, 1] (the platform produces 128). */
  peaks: number[];
  /** Track length in seconds, used to convert pointer position to a seek time. */
  duration: number;
  /** Current playback position in seconds. */
  currentTime: number;
  onSeek: (seconds: number) => void;
  height?: number;
  disabled?: boolean;
}

const PLAYED_TOP = '#10b981';
const PLAYED_BOTTOM = '#6366f1';
const UNPLAYED = '#374151';

/** targetSeconds = (clickX / width) * trackDuration, clamped to the track. */
export function positionToSeconds(clientX: number, rect: { left: number; width: number }, duration: number): number {
  if (rect.width <= 0 || duration <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return ratio * duration;
}

export function WaveformVisualizer({
  peaks,
  duration,
  currentTime,
  onSeek,
  height = 40,
  disabled = false
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // While scrubbing we preview the target position and only seek on release, so a drag
  // produces one byte-range request instead of one per mouse move.
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);

  const shownSeconds = dragSeconds ?? currentTime;
  const progress = duration > 0 ? Math.min(1, Math.max(0, shownSeconds / duration)) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setWidth(canvas.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, PLAYED_TOP);
    gradient.addColorStop(1, PLAYED_BOTTOM);

    const slot = width / peaks.length;
    const barWidth = Math.max(1, slot * 0.7);
    const playedX = progress * width;

    // requestAnimationFrame keeps repaints aligned with the display and coalesces rapid updates.
    const frame = requestAnimationFrame(() => {
      peaks.forEach((peak, i) => {
        const barHeight = Math.max(2, peak * height);
        const x = i * slot + (slot - barWidth) / 2;
        ctx.fillStyle = x + barWidth / 2 <= playedX ? gradient : UNPLAYED;
        ctx.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [peaks, width, height, progress]);

  const secondsAt = useCallback(
    (clientX: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return rect ? positionToSeconds(clientX, rect, duration) : 0;
    },
    [duration]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragSeconds(secondsAt(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragSeconds !== null) setDragSeconds(secondsAt(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragSeconds === null) return;
    onSeek(secondsAt(e.clientX));
    setDragSeconds(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 5));
    else if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 5));
  };

  return (
    <canvas
      ref={canvasRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shownSeconds)}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragSeconds(null)}
      onKeyDown={onKeyDown}
      style={{ height, touchAction: 'none' }}
      className={`block w-full ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
    />
  );
}

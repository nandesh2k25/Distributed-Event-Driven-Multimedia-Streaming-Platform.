import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WaveformVisualizer, positionToSeconds } from './WaveformVisualizer';

const peaks = Array.from({ length: 128 }, (_, i) => i / 127);

beforeAll(() => {
  // jsdom cannot draw; painting is skipped when there is no 2D context.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  // jsdom has no PointerEvent; MouseEvent carries clientX which is all the component reads.
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
});

function renderWave(onSeek = vi.fn(), currentTime = 0) {
  render(<WaveformVisualizer peaks={peaks} duration={200} currentTime={currentTime} onSeek={onSeek} />);
  const slider = screen.getByRole('slider');
  slider.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, height: 40, right: 500, bottom: 40, x: 100, y: 0, toJSON: () => ({}) });
  return { slider, onSeek };
}

describe('positionToSeconds', () => {
  it('maps x to (x / width) * duration and clamps to the track', () => {
    const rect = { left: 100, width: 400 };
    expect(positionToSeconds(300, rect, 200)).toBe(100);
    expect(positionToSeconds(50, rect, 200)).toBe(0);
    expect(positionToSeconds(900, rect, 200)).toBe(200);
    expect(positionToSeconds(300, { left: 0, width: 0 }, 200)).toBe(0);
  });
});

describe('WaveformVisualizer', () => {
  it('seeks to the clicked position on release', () => {
    const { slider, onSeek } = renderWave();
    fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(50);
  });

  it('previews while dragging but only seeks once, at the release point', () => {
    const { slider, onSeek } = renderWave();
    fireEvent.pointerDown(slider, { clientX: 150, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1 });
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider.getAttribute('aria-valuenow')).toBe('100'); // live preview position
    fireEvent.pointerUp(slider, { clientX: 400, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(150);
  });

  it('supports keyboard seeking and reports progress to assistive tech', () => {
    const { slider, onSeek } = renderWave(vi.fn(), 20);
    expect(slider.getAttribute('aria-valuenow')).toBe('20');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenCalledWith(25);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onSeek).toHaveBeenCalledWith(15);
  });
});

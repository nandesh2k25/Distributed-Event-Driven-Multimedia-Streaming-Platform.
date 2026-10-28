import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayerProvider, useAudioPlayer } from './AudioPlayerContext';
import type { Track } from '../lib/api';

const track = (id: string): Track => ({ id, title: `Track ${id}`, duration: 100, status: 'READY' });
const queue = [track('a'), track('b')];

function Controls() {
  const p = useAudioPlayer();
  return (
    <div>
      <button onClick={() => p.playTrack(queue[0]!, queue)}>play-a</button>
      <button onClick={() => p.seek(42)}>seek</button>
      <button onClick={() => p.next()}>next</button>
      <span data-testid="current">{p.currentTrack?.id ?? 'none'}</span>
      <span data-testid="playing">{String(p.isPlaying)}</span>
    </div>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/one']}>
      <AudioPlayerProvider>
        <Controls />
        <Link to="/two">go-two</Link>
        <Routes>
          <Route path="/one" element={<p>page one</p>} />
          <Route path="/two" element={<p>page two</p>} />
        </Routes>
      </AudioPlayerProvider>
    </MemoryRouter>
  );
}

describe('AudioPlayerContext', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('starts streaming the track from the stream endpoint', () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByText('play-a'));

    expect(container.querySelector('audio')!.getAttribute('src')).toBe('/api/stream/a');
    expect(screen.getByTestId('current').textContent).toBe('a');
    expect(screen.getByTestId('playing').textContent).toBe('true');
  });

  it('keeps the same <audio> element and playback state across route changes', () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByText('play-a'));
    const audioBefore = container.querySelector('audio');

    fireEvent.click(screen.getByText('go-two'));

    expect(screen.getByText('page two')).toBeTruthy();
    expect(container.querySelector('audio')).toBe(audioBefore);
    expect(screen.getByTestId('current').textContent).toBe('a');
    expect(screen.getByTestId('playing').textContent).toBe('true');
  });

  it('seeks by setting currentTime on the audio element', () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByText('play-a'));
    fireEvent.click(screen.getByText('seek'));
    expect(container.querySelector('audio')!.currentTime).toBe(42);
  });

  it('advances through the queue and on track end', () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByText('play-a'));

    act(() => {
      container.querySelector('audio')!.dispatchEvent(new Event('ended'));
    });

    expect(screen.getByTestId('current').textContent).toBe('b');
    expect(container.querySelector('audio')!.getAttribute('src')).toBe('/api/stream/b');
  });
});

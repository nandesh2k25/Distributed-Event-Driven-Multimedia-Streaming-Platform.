import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaylistPage from './PlaylistPage';
import { AudioPlayerProvider } from '../context/AudioPlayerContext';
import { FavoritesProvider } from '../context/FavoritesContext';

const track = (id: string) => ({ id, title: `Song ${id}`, duration: 100, status: 'READY', artist: { id: 'a', name: 'Band' } });
const entries = (ids: string[]) => ids.map((id, i) => ({ trackId: id, position: i, addedAt: '', track: track(id) }));
const reply = (status: number, body?: unknown) =>
  Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));

let server: string[]; // the order the "server" holds
let calls: { method: string; url: string; body?: unknown }[];
let failNextWrite: boolean;

beforeEach(() => {
  server = ['t1', 't2', 't3'];
  calls = [];
  failNextWrite = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url, body });

      if (url === '/api/favorites/ids') return reply(200, { success: true, data: [] });
      if (url === '/api/playlists/p1' && method === 'GET') {
        return reply(200, { success: true, data: { id: 'p1', title: 'Mix', isPublic: true, isOwner: true, updatedAt: '', tracks: entries(server) } });
      }
      if (method === 'PUT' || method === 'DELETE') {
        if (failNextWrite) {
          failNextWrite = false;
          return reply(500, { success: false, error: { message: 'Save failed' } });
        }
        if (method === 'PUT') server = body.trackIds;
        else server = server.filter((id) => !url.endsWith(`/tracks/${id}`));
        return method === 'DELETE' ? reply(204) : reply(200, { success: true, data: {} });
      }
      return reply(404, { success: false, error: { message: 'unexpected' } });
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/playlists/p1']}>
      <AudioPlayerProvider>
        <FavoritesProvider>
          <Routes>
            <Route path="/playlists/:id" element={<PlaylistPage />} />
          </Routes>
        </FavoritesProvider>
      </AudioPlayerProvider>
    </MemoryRouter>
  );
}

const titles = () => within(screen.getByRole('list', { name: 'Playlist tracks' })).getAllByRole('listitem').map((li) => li.textContent?.match(/Song t\d/)?.[0]);
const writes = () => calls.filter((c) => c.method === 'PUT' || c.method === 'DELETE').filter((c) => !c.url.includes('/favorites'));

describe('PlaylistPage', () => {
  it('shows the tracklist in server order', async () => {
    renderPage();
    await screen.findByText('Song t1');
    expect(titles()).toEqual(['Song t1', 'Song t2', 'Song t3']);
  });

  it('moves a track with the down control: updates immediately and persists the new order', async () => {
    renderPage();
    await screen.findByText('Song t1');

    fireEvent.click(screen.getByRole('button', { name: 'Move down: Song t1' }));
    expect(titles()).toEqual(['Song t2', 'Song t1', 'Song t3']);

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: '/api/playlists/p1/tracks/order', body: { trackIds: ['t2', 't1', 't3'] } });
    expect(server).toEqual(['t2', 't1', 't3']);
  });

  it('sends rapid successive moves in click order so the last arrangement wins', async () => {
    renderPage();
    await screen.findByText('Song t1');

    fireEvent.click(screen.getByRole('button', { name: 'Move down: Song t1' })); // t2 t1 t3
    fireEvent.click(screen.getByRole('button', { name: 'Move up: Song t3' })); //   t2 t3 t1

    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes().map((w) => (w.body as { trackIds: string[] }).trackIds)).toEqual([['t2', 't1', 't3'], ['t2', 't3', 't1']]);
    expect(server).toEqual(['t2', 't3', 't1']);
  });

  it('reorders by drag and drop', async () => {
    renderPage();
    await screen.findByText('Song t1');
    const items = within(screen.getByRole('list', { name: 'Playlist tracks' })).getAllByRole('listitem');

    fireEvent.dragStart(items[0]!);
    fireEvent.dragOver(items[2]!);
    fireEvent.drop(items[2]!);

    expect(titles()).toEqual(['Song t2', 'Song t3', 'Song t1']);
    await waitFor(() => expect(server).toEqual(['t2', 't3', 't1']));
  });

  it('removes a track optimistically and persists it', async () => {
    renderPage();
    await screen.findByText('Song t2');

    fireEvent.click(screen.getByRole('button', { name: 'Remove from playlist: Song t2' }));
    expect(titles()).toEqual(['Song t1', 'Song t3']);
    await waitFor(() => expect(server).toEqual(['t1', 't3']));
  });

  it('re-syncs from the server and shows an error when saving fails', async () => {
    renderPage();
    await screen.findByText('Song t1');
    failNextWrite = true;

    fireEvent.click(screen.getByRole('button', { name: 'Move down: Song t1' }));
    expect(titles()).toEqual(['Song t2', 'Song t1', 'Song t3']); // optimistic

    expect((await screen.findByRole('alert')).textContent).toBe('Save failed');
    await waitFor(() => expect(titles()).toEqual(['Song t1', 'Song t2', 'Song t3'])); // rolled back to server truth
  });

  it('disables moves past the ends of the list', async () => {
    renderPage();
    await screen.findByText('Song t1');
    expect((screen.getByRole('button', { name: 'Move up: Song t1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move down: Song t3' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

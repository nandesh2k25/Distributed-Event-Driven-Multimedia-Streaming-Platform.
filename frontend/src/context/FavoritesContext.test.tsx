import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { FavoritesProvider } from './FavoritesContext';
import { clearSession, setSession } from '../lib/session';
import { HeartButton } from '../components/HeartButton';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const user = { id: 'u1', email: 'a@b.co', displayName: 'Ada' };

describe('favorites (optimistic UI)', () => {
  let fetchMock: ReturnType<typeof vi.fn<any[], any>>;
  let mutation: ((value: Response) => void) | null;

  beforeEach(() => {
    mutation = null;
    setSession({ token: 'tok', user });
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/me')) return json(200, { success: true, data: { user } });
      if (url.endsWith('/favorites/ids')) return json(200, { success: true, data: ['t2'] });
      // hold PUT/DELETE open so the test can look at the UI while the request is in flight
      return new Promise<Response>((resolve) => {
        mutation = resolve;
        void init;
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  const renderHearts = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <FavoritesProvider>
                  <HeartButton trackId="t1" title="One" />
                  <HeartButton trackId="t2" title="Two" />
                </FavoritesProvider>
              }
            />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

  it('sends a guest to the login page instead of saving a favorite', async () => {
    clearSession();
    renderHearts();
    fireEvent.click(screen.getByRole('button', { name: /One/ }));

    expect(await screen.findByText('login page')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/favorites/t1', expect.anything());
  });

  it('loads existing favorites', async () => {
    renderHearts();
    await waitFor(() => expect(screen.getByRole('button', { name: /Two/ }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: /One/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('flips the heart before the server answers and keeps it on success', async () => {
    renderHearts();
    const heart = screen.getByRole('button', { name: /One/ });
    fireEvent.click(heart);

    expect(heart.getAttribute('aria-pressed')).toBe('true'); // immediate, request still pending
    expect(fetchMock).toHaveBeenCalledWith('/api/favorites/t1', expect.objectContaining({ method: 'PUT' }));

    await act(async () => mutation!(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })));
    expect(heart.getAttribute('aria-pressed')).toBe('true');
  });

  it('un-favorites with DELETE and rolls back with a message when the API fails', async () => {
    renderHearts();
    const two = await screen.findByRole('button', { name: /Two/ });
    await waitFor(() => expect(two.getAttribute('aria-pressed')).toBe('true'));

    fireEvent.click(two);
    expect(two.getAttribute('aria-pressed')).toBe('false');
    expect(fetchMock).toHaveBeenCalledWith('/api/favorites/t2', expect.objectContaining({ method: 'DELETE' }));

    await act(async () =>
      mutation!(new Response(JSON.stringify({ success: false, error: { message: 'Service down' } }), { status: 502 }))
    );
    expect(two.getAttribute('aria-pressed')).toBe('true'); // reverted
    expect((await screen.findByRole('alert')).textContent).toBe('Service down');
  });
});

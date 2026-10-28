import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { AudioPlayerProvider } from '../context/AudioPlayerContext';
import { TrackRow } from '../components/Cards';
import { clearSession, getToken } from '../lib/session';
import AuthPage from './AuthPage';

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const user = { id: 'u1', email: 'ada@example.com', displayName: 'Ada' };

let fetchMock: ReturnType<typeof vi.fn<any[], any>>;

beforeEach(() => {
  clearSession();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearSession();
});

function renderAt(path: string, state?: object) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <AuthProvider>
        <AudioPlayerProvider>
          <Routes>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/" element={<p>home</p>} />
            <Route path="/albums/1" element={<p>album page</p>} />
            <Route
              path="/tracks"
              element={
                <ul>
                  <TrackRow track={{ id: 'free', title: 'Free Song', duration: 60, status: 'READY', isFree: true }} />
                  <TrackRow track={{ id: 'prem', title: 'Premium Song', duration: 60, status: 'READY', isFree: false }} />
                </ul>
              }
            />
          </Routes>
        </AudioPlayerProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('login page', () => {
  it('signs in, keeps the token, and returns to where the guest came from', async () => {
    fetchMock.mockReturnValue(reply(200, { success: true, data: { token: 'jwt-1', user } }));
    renderAt('/login', { from: '/albums/1' });

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('album page')).toBeTruthy();
    expect(getToken()).toBe('jwt-1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse' }) })
    );
  });

  it('shows the server message and stays signed out on bad credentials', async () => {
    fetchMock.mockReturnValue(
      reply(401, { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } })
    );
    renderAt('/login');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Incorrect email or password');
    expect(getToken()).toBeNull();
  });

  it('signs up with a display name', async () => {
    fetchMock.mockReturnValue(reply(201, { success: true, data: { token: 'jwt-2', user } }));
    renderAt('/signup');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(getToken()).toBe('jwt-2'));
    expect(await screen.findByText('home')).toBeTruthy();
  });
});

describe('premium tracks for guests', () => {
  it('lock premium tracks and send the guest to sign in, but leave free tracks playable', async () => {
    renderAt('/tracks');

    expect(screen.getByRole('button', { name: 'Play Free Song' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to play Premium Song' }));

    expect(await screen.findByText('Sign in to play premium tracks.')).toBeTruthy();
  });
});

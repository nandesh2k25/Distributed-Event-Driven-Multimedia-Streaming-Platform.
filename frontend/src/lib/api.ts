import { authHeaders, clearSession, type SessionUser } from './session';
export interface Genre { id: string; name: string; slug: string }
export interface Artist {
  id: string; name: string; bio?: string | null; avatarUrl?: string | null;
  _count?: { tracks: number; albums: number };
}
export interface Album {
  id: string; title: string; coverUrl?: string | null; releaseYear?: number | null;
  artistId: string; artist?: Artist; tracks?: Track[]; _count?: { tracks: number };
}
export interface Track {
  id: string; title: string; duration: number; status: string; trackNumber?: number | null;
  artist?: Artist; album?: Album | null; genre?: Genre | string | null; waveformPeaks?: number[];
  /** Guests can only play free tracks. */
  isFree?: boolean;
}
export interface Meta { page?: number; limit?: number; total?: number; totalPages?: number }
export interface SearchResults { tracks: Track[]; artists: Artist[]; albums: Album[]; query: string }

interface Envelope<T> { success: boolean; data: T; meta?: Meta; error?: { code?: string; message: string } }

export interface AuthResult { token: string; user: SessionUser }

export interface Playlist {
  id: string; title: string; description?: string | null; isPublic: boolean;
  trackCount?: number; updatedAt: string;
}
export interface PlaylistEntry { trackId: string; position: number; addedAt: string; track: Track | null }
export interface PlaylistDetail extends Playlist { isOwner: boolean; tracks: PlaylistEntry[] }
export interface FavoriteEntry { favoritedAt: string; track: Track }

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<{ data: T; meta?: Meta }> {
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 204) return { data: undefined as T };
  const parsed = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !parsed?.success) {
    // The gateway rejected our token (expired or forged): drop it so the UI falls back to guest.
    if (parsed?.error?.code === 'TOKEN_INVALID') clearSession();
    throw new Error(parsed?.error?.message ?? `Request failed (${res.status})`);
  }
  return { data: parsed.data, meta: parsed.meta };
}

const get = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal);

export const api = {
  signup: (input: { email: string; password: string; displayName: string }) =>
    request<AuthResult>('POST', '/auth/signup', input),
  login: (input: { email: string; password: string }) => request<AuthResult>('POST', '/auth/login', input),
  me: (signal?: AbortSignal) => get<{ user: SessionUser }>('/auth/me', signal),

  tracks: (params = '', signal?: AbortSignal) => get<Track[]>(`/tracks${params}`, signal),
  track: (id: string, signal?: AbortSignal) => get<Track>(`/tracks/${id}`, signal),
  artists: (signal?: AbortSignal) => get<Artist[]>('/artists', signal),
  artist: (id: string, signal?: AbortSignal) => get<Artist & { albums: Album[]; tracks: Track[] }>(`/artists/${id}`, signal),
  albums: (signal?: AbortSignal) => get<Album[]>('/albums', signal),
  album: (id: string, signal?: AbortSignal) => get<Album>(`/albums/${id}`, signal),
  genres: (signal?: AbortSignal) => get<Genre[]>('/genres', signal),
  search: (q: string, signal?: AbortSignal) =>
    get<SearchResults>(`/search?q=${encodeURIComponent(q)}`, signal),

  playlists: (signal?: AbortSignal) => get<Playlist[]>('/playlists', signal),
  playlist: (id: string, signal?: AbortSignal) => get<PlaylistDetail>(`/playlists/${id}`, signal),
  createPlaylist: (input: { title: string; description?: string; isPublic: boolean }) =>
    request<Playlist>('POST', '/playlists', input),
  deletePlaylist: (id: string) => request<void>('DELETE', `/playlists/${id}`),
  addToPlaylist: (id: string, trackId: string) => request<unknown>('POST', `/playlists/${id}/tracks`, { trackId }),
  removeFromPlaylist: (id: string, trackId: string) => request<void>('DELETE', `/playlists/${id}/tracks/${trackId}`),
  reorderPlaylist: (id: string, trackIds: string[]) => request<unknown>('PUT', `/playlists/${id}/tracks/order`, { trackIds }),

  favorites: (signal?: AbortSignal) => get<FavoriteEntry[]>('/favorites', signal),
  favoriteIds: (signal?: AbortSignal) => get<string[]>('/favorites/ids', signal),
  setFavorite: (trackId: string, favorited: boolean) =>
    request<unknown>(favorited ? 'PUT' : 'DELETE', `/favorites/${trackId}`)
};

/** Returns a copy of `list` with the item at `from` moved to index `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.min(Math.max(to, 0), next.length - 1);
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

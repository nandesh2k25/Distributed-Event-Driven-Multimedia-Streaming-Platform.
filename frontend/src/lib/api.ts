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
  artist?: Artist; album?: Album | null; genre?: Genre | null; waveformPeaks?: number[];
}
export interface Meta { page?: number; limit?: number; total?: number; totalPages?: number }
export interface SearchResults { tracks: Track[]; artists: Artist[]; albums: Album[]; query: string }

interface Envelope<T> { success: boolean; data: T; meta?: Meta; error?: { message: string } }

async function get<T>(path: string, signal?: AbortSignal): Promise<{ data: T; meta?: Meta }> {
  const res = await fetch(`/api${path}`, { signal });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return { data: body.data, meta: body.meta };
}

export const api = {
  tracks: (params = '', signal?: AbortSignal) => get<Track[]>(`/tracks${params}`, signal),
  artists: (signal?: AbortSignal) => get<Artist[]>('/artists', signal),
  artist: (id: string, signal?: AbortSignal) => get<Artist & { albums: Album[]; tracks: Track[] }>(`/artists/${id}`, signal),
  albums: (signal?: AbortSignal) => get<Album[]>('/albums', signal),
  album: (id: string, signal?: AbortSignal) => get<Album>(`/albums/${id}`, signal),
  genres: (signal?: AbortSignal) => get<Genre[]>('/genres', signal),
  search: (q: string, signal?: AbortSignal) =>
    get<SearchResults>(`/search?q=${encodeURIComponent(q)}`, signal)
};

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

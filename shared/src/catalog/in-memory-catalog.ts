import {
  CatalogUnavailableError,
  type CatalogClient,
  type CatalogTrack,
  type RegisterUploadInput,
  type TrackReadyData
} from './types.js';

export interface InMemoryCatalog extends CatalogClient {
  /** Test setup: puts a track in the catalog (defaults to a READY, playable one). */
  addTrack(track: Partial<CatalogTrack> & { id: string }): CatalogTrack;
  /** Test inspection: every track currently stored. */
  tracks(): CatalogTrack[];
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Test adapter for {@link CatalogClient}. It matches the real Catalog's observable behaviour
 * (the shared contract suite enforces that): case-insensitive find-or-create, placeholder
 * tracks in PROCESSING, unknown ids absent, writes to unknown tracks rejected.
 */
export function createInMemoryCatalog(): InMemoryCatalog {
  const store = new Map<string, CatalogTrack>();
  const artists = new Map<string, { id: string; name: string }>();
  const albums = new Map<string, { id: string; title: string; artistId: string }>();
  const genres = new Map<string, { id: string; name: string; slug: string }>();
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

  function requireTrack(id: string): CatalogTrack {
    const track = store.get(id);
    if (!track) throw new CatalogUnavailableError(`Catalog PATCH /tracks/${id} was rejected (404)`, 404);
    return track;
  }

  return {
    addTrack(track) {
      const full: CatalogTrack = { title: track.id, status: 'READY', duration: 0, storageKey: null, ...track };
      store.set(full.id, full);
      return full;
    },

    tracks: () => [...store.values()].map(json),

    async getTrack(id) {
      const track = store.get(id);
      return track ? json(track) : null;
    },

    async getTracks(ids) {
      return [...new Set(ids)].flatMap((id) => (store.has(id) ? [json(store.get(id)!)] : []));
    },

    async registerUpload(input: RegisterUploadInput) {
      const artistKey = input.artistName.trim().toLowerCase();
      const artist = artists.get(artistKey) ?? { id: nextId('artist'), name: input.artistName.trim() };
      artists.set(artistKey, artist);

      const genreSlug = slugify(input.genre);
      const genre = genres.get(genreSlug) ?? { id: nextId('genre'), name: input.genre.trim(), slug: genreSlug };
      genres.set(genreSlug, genre);

      let album: { id: string; title: string; artistId: string } | undefined;
      if (input.albumTitle?.trim()) {
        const albumKey = `${artist.id}:${input.albumTitle.trim().toLowerCase()}`;
        album = albums.get(albumKey) ?? { id: nextId('album'), title: input.albumTitle.trim(), artistId: artist.id };
        albums.set(albumKey, album);
      }

      const track: CatalogTrack = {
        id: nextId('track'),
        title: input.title.trim(),
        status: 'PROCESSING',
        duration: 0,
        storageKey: null,
        rawStorageKey: input.rawStorageKey,
        originalFormat: input.originalFormat,
        artist,
        album: album ?? null,
        genre
      };
      store.set(track.id, track);
      return { trackId: track.id };
    },

    async markTrackReady(trackId, data: TrackReadyData) {
      Object.assign(requireTrack(trackId), data, { status: 'READY' });
    },

    async markTrackFailed(trackId) {
      requireTrack(trackId).status = 'FAILED';
    }
  };
}

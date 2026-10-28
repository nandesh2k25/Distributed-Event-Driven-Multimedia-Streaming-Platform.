import type { BitrateVariant } from '../types/domain.js';

/**
 * A track as the Catalog presents it. Deliberately loose: callers read the few fields they need
 * (streaming reads `status` and `storageKey`; playlists forward the whole thing to the UI).
 */
export interface CatalogTrack {
  id: string;
  title: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  duration: number;
  /** Guests may stream free tracks only. Absent is treated as free. */
  isFree?: boolean;
  storageKey?: string | null;
  rawStorageKey?: string | null;
  [field: string]: unknown;
}

/** Everything the Catalog needs to register an upload that is about to be transcoded. */
export interface RegisterUploadInput {
  title: string;
  artistName: string;
  albumTitle?: string;
  genre: string;
  originalFormat: string;
  rawStorageKey: string;
}

/** What the transcode worker reports when a track is playable. */
export interface TrackReadyData {
  duration: number;
  waveformPeaks: number[];
  storageKey: string;
  bitrate: number;
  format: string;
  variants: BitrateVariant[];
}

export interface CatalogCallContext {
  correlationId?: string;
}

/**
 * The Catalog as seen by the other services. Two adapters satisfy it: HTTP (production) and
 * in-memory (tests); both run the same contract suite.
 *
 * Failure model: "does not exist" is an ordinary answer (`null` / absent from the result).
 * Anything else that goes wrong - unreachable, timed out, 5xx, a rejected request - throws
 * {@link CatalogUnavailableError}. Reads are retried once; writes are never retried.
 */
export interface CatalogClient {
  /** The track in any status, or `null` if it does not exist. */
  getTrack(id: string, ctx?: CatalogCallContext): Promise<CatalogTrack | null>;

  /** The tracks that exist, in no particular order. Unknown and duplicate ids are ignored. */
  getTracks(ids: string[], ctx?: CatalogCallContext): Promise<CatalogTrack[]>;

  /**
   * Atomically finds-or-creates the artist, album and genre (names match case-insensitively)
   * and creates a `PROCESSING` placeholder track.
   */
  registerUpload(input: RegisterUploadInput, ctx?: CatalogCallContext): Promise<{ trackId: string }>;

  /** Marks the track `READY` and records its transcoded asset. */
  markTrackReady(trackId: string, data: TrackReadyData, ctx?: CatalogCallContext): Promise<void>;

  markTrackFailed(trackId: string, ctx?: CatalogCallContext): Promise<void>;
}

export class CatalogUnavailableError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CatalogUnavailableError';
    this.status = status;
  }
}

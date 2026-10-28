import type { Readable } from 'node:stream';
import type { AudioTranscodeJob } from '@music/shared';

export interface RawAudioStore {
  /** Streams the body into the raw-audio bucket without buffering the whole file. */
  put(key: string, body: Readable, contentType: string): Promise<void>;
}

export interface CatalogClient {
  resolveArtist(name: string, correlationId: string): Promise<{ id: string }>;
  resolveGenre(name: string, correlationId: string): Promise<{ id: string }>;
  resolveAlbum(title: string, artistId: string, correlationId: string): Promise<{ id: string }>;
  createPlaceholder(
    data: {
      title: string;
      artistId: string;
      albumId?: string;
      genreId?: string;
      originalFormat: string;
      rawStorageKey: string;
    },
    correlationId: string
  ): Promise<{ id: string }>;
  markFailed(trackId: string, correlationId: string): Promise<void>;
}

export interface JobPublisher {
  publish(job: AudioTranscodeJob): Promise<void>;
}

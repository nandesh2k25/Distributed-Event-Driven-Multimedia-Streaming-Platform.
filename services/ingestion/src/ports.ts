import type { Readable } from 'node:stream';
import type { AudioTranscodeJob } from '@music/shared';

export interface RawAudioStore {
  /** Streams the body into the raw-audio bucket without buffering the whole file. */
  put(key: string, body: Readable, contentType: string): Promise<void>;
}

export interface JobPublisher {
  publish(job: AudioTranscodeJob): Promise<void>;
}

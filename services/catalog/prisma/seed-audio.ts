import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Generates a short synthetic tune per seeded track and stores it in MinIO under the track's
 * storage key, so `pnpm seed` leaves a catalog that is actually playable.
 */
const SAMPLE_RATE = 11025;
const MAX_SECONDS = 300;
const SCALE = [0, 2, 4, 7, 9, 12, 9, 7]; // major-pentatonic-ish arpeggio, semitones from root

function makeWav(seconds: number, seed: number): Buffer {
  const samples = Math.floor(seconds * SAMPLE_RATE);
  const data = Buffer.alloc(samples * 2);
  const root = 196 * Math.pow(2, (seed % 7) / 12);
  const noteLen = Math.floor(SAMPLE_RATE * 0.5);

  for (let i = 0; i < samples; i++) {
    const note = Math.floor(i / noteLen);
    const semis = SCALE[(note + seed) % SCALE.length] ?? 0;
    const freq = root * Math.pow(2, semis / 12);
    const pos = (i % noteLen) / noteLen;
    const envelope = Math.min(1, pos * 20) * (1 - pos * 0.6);
    const value = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * envelope * 0.35;
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export interface SeedTrackAudio {
  storageKey: string;
  title: string;
  duration: number;
}

export async function uploadDemoAudio(tracks: SeedTrackAudio[]): Promise<void> {
  const bucket = process.env.MINIO_BUCKET || 'processed-audio';
  const s3 = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
    region: process.env.MINIO_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
    }
  });

  try {
    for (const [index, track] of tracks.entries()) {
      const wav = makeWav(Math.min(track.duration || 30, MAX_SECONDS), index);
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: track.storageKey, Body: wav, ContentType: 'audio/wav' })
      );
      console.log(`uploaded ${track.storageKey} (${(wav.length / 1024 / 1024).toFixed(1)} MB) - ${track.title}`);
    }
  } catch (err) {
    throw new Error(
      `Could not upload demo audio to MinIO (is it running? try "pnpm docker:up"). Set SEED_SKIP_AUDIO=1 to seed metadata only. ${(err as Error).message}`
    );
  }
  console.log(`Uploaded ${tracks.length} demo tracks to ${bucket}`);
}

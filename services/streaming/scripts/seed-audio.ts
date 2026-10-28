/**
 * Dev helper: uploads a generated WAV tone for every READY catalog track to MinIO so the
 * seeded tracks are actually playable. Run after `pnpm seed` with Catalog + MinIO up.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../src/config.js';

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

async function main() {
  const res = await fetch(`${config.catalogUrl}/api/tracks?limit=100`);
  if (!res.ok) throw new Error(`Catalog returned ${res.status}`);
  const { data: tracks } = (await res.json()) as {
    data: { id: string; title: string; duration: number; storageKey: string | null }[];
  };

  const s3 = new S3Client({
    endpoint: config.minio.endpoint,
    region: config.minio.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.minio.accessKeyId, secretAccessKey: config.minio.secretAccessKey }
  });

  let uploaded = 0;
  for (const [index, track] of tracks.entries()) {
    if (!track.storageKey) continue;
    const wav = makeWav(Math.min(track.duration || 30, MAX_SECONDS), index);
    await s3.send(
      new PutObjectCommand({
        Bucket: config.minio.bucket,
        Key: track.storageKey,
        Body: wav,
        ContentType: 'audio/wav'
      })
    );
    uploaded++;
    console.log(`uploaded ${track.storageKey} (${(wav.length / 1024 / 1024).toFixed(1)} MB) - ${track.title}`);
  }
  console.log(`Done: ${uploaded} tracks uploaded to ${config.minio.bucket}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

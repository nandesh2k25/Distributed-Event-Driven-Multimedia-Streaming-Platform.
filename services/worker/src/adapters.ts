import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { CatalogUpdater, WorkerStorage } from './process-job.js';

export function createS3WorkerStorage(opts: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  rawBucket: string;
  processedBucket: string;
}): WorkerStorage {
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: true,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
  });

  return {
    async download(key, destPath) {
      const res = await client.send(new GetObjectCommand({ Bucket: opts.rawBucket, Key: key }));
      await pipeline(res.Body as Readable, createWriteStream(destPath));
    },
    async upload(key, filePath, contentType, size) {
      await client.send(
        new PutObjectCommand({
          Bucket: opts.processedBucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentLength: size,
          ContentType: contentType
        })
      );
    }
  };
}

export function createHttpCatalogUpdater(baseUrl: string): CatalogUpdater {
  async function patch(trackId: string, body: unknown, correlationId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/tracks/${encodeURIComponent(trackId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Catalog PATCH track ${trackId} failed (${res.status})`);
  }

  return {
    markReady: (trackId, payload, cid) => patch(trackId, payload, cid),
    markFailed: (trackId, cid) => patch(trackId, { status: 'FAILED' }, cid)
  };
}

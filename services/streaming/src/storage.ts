import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

export interface ObjectMeta {
  size: number;
  contentType: string;
}

/** Narrow storage port so the HTTP layer can be tested without MinIO. */
export interface ObjectStorage {
  head(key: string): Promise<ObjectMeta | null>;
  /** Streams bytes [start, end] inclusive. */
  getRange(key: string, start: number, end: number): Promise<Readable>;
}

export function createS3Storage(opts: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): ObjectStorage {
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: true,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
  });

  return {
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType || 'application/octet-stream' };
      } catch (err: any) {
        if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async getRange(key, start, end) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: opts.bucket, Key: key, Range: `bytes=${start}-${end}` })
      );
      return res.Body as Readable;
    }
  };
}

import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { RawAudioStore } from './ports.js';

export function createS3RawStore(opts: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  rawBucket: string;
}): RawAudioStore {
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: true,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
  });

  return {
    async put(key, body, contentType) {
      // Multipart upload from a stream: memory stays bounded regardless of file size.
      await new Upload({
        client,
        params: { Bucket: opts.rawBucket, Key: key, Body: body, ContentType: contentType }
      }).done();
    }
  };
}

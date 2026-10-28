import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import busboy from 'busboy';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import {
  AudioUploadMetadataSchema,
  CatalogUnavailableError,
  createErrorResponse,
  createSuccessResponse,
  type CatalogClient
} from '@music/shared';
import type { JobPublisher, RawAudioStore } from './ports.js';

export interface IngestionDeps {
  store: RawAudioStore;
  catalog: CatalogClient;
  publisher: JobPublisher;
  maxUploadBytes: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { field?: string; message: string }[]
  ) {
    super(message);
  }
}

const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/aac': 'aac',
  'audio/aacp': 'aac',
  'audio/x-aac': 'aac',
  'audio/mp4': 'aac',
  'audio/x-m4a': 'aac'
};
const EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a']);
const UNSUPPORTED_TYPE = 'Only audio files (WAV, FLAC, MP3, AAC) are supported.';

/** Resolves the source format, or throws if the MIME type / extension is not an accepted audio type. */
function detectFormat(mimeType: string, filename = ''): string {
  const ext = extname(filename).slice(1).toLowerCase();
  const fromMime = MIME_TO_EXT[mimeType.toLowerCase()];
  // Some browsers send application/octet-stream for FLAC; fall back to the extension only then.
  if (fromMime) return EXTENSIONS.has(ext) ? ext : fromMime;
  if (mimeType === 'application/octet-stream' && EXTENSIONS.has(ext)) return ext;
  throw new HttpError(400, 'INVALID_FILE_TYPE', UNSUPPORTED_TYPE);
}

export function createApp({ store, catalog, publisher, maxUploadBytes }: IngestionDeps): Express {
  const app: Express = express();
  const logger = pino({ name: 'ingestion-service' });

  app.use(cors({ exposedHeaders: ['X-Correlation-ID'] }));
  app.use(pinoHttp({ logger, genReqId: (req) => (req.headers['x-correlation-id'] as string) || randomUUID() }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'healthy', service: 'ingestion' } });
  });

  async function processFile(
    file: Readable & { truncated?: boolean },
    info: { filename?: string; mimeType: string },
    fields: Record<string, string>,
    correlationId: string
  ): Promise<{ trackId: string }> {
    const parsed = AudioUploadMetadataSchema.safeParse(fields);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid upload metadata (send metadata fields before the file)',
        parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
      );
    }
    const meta = parsed.data;
    const format = detectFormat(info.mimeType, info.filename);
    const rawKey = `raw/${randomUUID()}.${format}`;

    const { trackId } = await catalog.registerUpload(
      {
        title: meta.title,
        artistName: meta.artistName,
        albumTitle: meta.albumTitle || undefined,
        genre: meta.genre,
        originalFormat: format,
        rawStorageKey: rawKey
      },
      { correlationId }
    );

    try {
      await store.put(rawKey, file, info.mimeType);
      if (file.truncated) {
        throw new HttpError(413, 'FILE_TOO_LARGE', `File exceeds the ${maxUploadBytes} byte limit`);
      }
      await publisher.publish({
        trackId,
        rawFileKey: rawKey,
        originalFormat: format,
        targetBitrates: [320],
        correlationId,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      await catalog.markTrackFailed(trackId, { correlationId }).catch(() => undefined);
      throw err;
    }
    return { trackId };
  }

  const uploadHandler = (req: Request, res: Response) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    res.setHeader('X-Correlation-ID', correlationId);

    const fail = (err: unknown) => {
      if (res.headersSent) return;
      if (err instanceof HttpError) {
        res.status(err.status).json(createErrorResponse(err.code, err.message, err.details));
        return;
      }
      if (err instanceof CatalogUnavailableError) {
        req.log?.error({ err }, 'Catalog unavailable during upload');
        res.status(502).json(createErrorResponse('CATALOG_UNAVAILABLE', 'The catalog is unavailable, please retry'));
        return;
      }
      req.log?.error({ err }, 'Upload failed');
      res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to ingest audio upload'));
    };

    if (!req.is('multipart/form-data')) {
      fail(new HttpError(400, 'INVALID_CONTENT_TYPE', 'Expected multipart/form-data'));
      return;
    }

    let bb: busboy.Busboy;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxUploadBytes } });
    } catch {
      fail(new HttpError(400, 'MALFORMED_UPLOAD', 'Malformed multipart request'));
      return;
    }

    const fields: Record<string, string> = {};
    let work: Promise<{ trackId: string }> | null = null;

    bb.on('field', (name, value) => {
      fields[name] = value;
    });
    bb.on('file', (_name, file, info) => {
      work = processFile(file, info, fields, correlationId).catch((err) => {
        file.resume(); // drain so the request can finish and we can answer
        throw err;
      });
      work.catch(() => undefined); // awaited on close; avoids an unhandled-rejection window
    });
    bb.on('error', () => fail(new HttpError(400, 'MALFORMED_UPLOAD', 'Malformed multipart request')));
    bb.on('close', async () => {
      if (!work) {
        fail(new HttpError(400, 'FILE_REQUIRED', 'An audio file is required'));
        return;
      }
      try {
        const { trackId } = await work;
        res.status(202).json(createSuccessResponse({ trackId, status: 'PROCESSING' }));
      } catch (err) {
        fail(err);
      }
    });

    req.pipe(bb);
  };

  app.post('/api/ingest/upload', uploadHandler);
  app.post('/ingest/upload', uploadHandler);

  app.use((_req, res) => {
    res.status(404).json(createErrorResponse('NOT_FOUND', 'Requested ingestion route not found'));
  });

  return app;
}

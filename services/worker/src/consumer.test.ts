import { writeFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUEUES, type AudioTranscodeJob } from '@music/shared';
import { createInMemoryCatalog, type InMemoryCatalog } from '@music/shared/testing';
import { startConsumer, type ConsumerChannel } from './consumer.js';
import type { WorkerDeps } from './process-job.js';

type Message = { content: Buffer };
const log = { info: vi.fn(), error: vi.fn() };

/** A stand-in channel that records what the consumer asks of the broker and lets tests deliver messages. */
function fakeChannel() {
  let handler: (msg: Message | null) => void | Promise<void> = () => undefined;
  const channel = {
    prefetch: vi.fn(async () => undefined),
    consume: vi.fn(async (_queue: string, onMessage: typeof handler) => {
      handler = onMessage;
    }),
    ack: vi.fn(),
    nack: vi.fn()
  } satisfies ConsumerChannel;
  return { channel, deliver: (msg: Message | null) => handler(msg) };
}

let catalog: InMemoryCatalog;
let trackId: string;
let transcodeFails: boolean;

const deps = (): WorkerDeps => ({
  storage: { download: async (_k, dest) => writeFile(dest, 'raw'), upload: async () => undefined },
  media: {
    transcodeToMp3: async (_i, out) => {
      if (transcodeFails) throw new Error('ffmpeg exited with code 1');
      await writeFile(out, Buffer.alloc(64));
    },
    probeDuration: async () => 10,
    computePeaks: async () => [0.5]
  },
  catalog
});

const message = (overrides: Partial<AudioTranscodeJob> = {}): Message => ({
  content: Buffer.from(
    JSON.stringify({
      trackId,
      rawFileKey: 'raw/x.wav',
      originalFormat: 'wav',
      targetBitrates: [320],
      correlationId: 'cid',
      timestamp: new Date().toISOString(),
      ...overrides
    })
  )
});

beforeEach(async () => {
  transcodeFails = false;
  catalog = createInMemoryCatalog();
  ({ trackId } = await catalog.registerUpload({
    title: 'Song',
    artistName: 'Band',
    genre: 'Rock',
    originalFormat: 'wav',
    rawStorageKey: 'raw/x.wav'
  }));
});

describe('startConsumer', () => {
  it('takes one job at a time and consumes the transcode queue with manual acknowledgement', async () => {
    const { channel } = fakeChannel();
    await startConsumer(channel, deps(), log);

    expect(channel.prefetch).toHaveBeenCalledWith(1);
    expect(channel.consume).toHaveBeenCalledWith(QUEUES.AUDIO_TRANSCODE, expect.any(Function), { noAck: false });
  });

  it('acks a delivered job after it has been processed', async () => {
    const { channel, deliver } = fakeChannel();
    await startConsumer(channel, deps(), log);

    const msg = message();
    await deliver(msg);

    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
    expect((await catalog.getTrack(trackId))?.status).toBe('READY');
  });

  it('nacks without requeue when processing fails, so the broker dead-letters the job', async () => {
    const { channel, deliver } = fakeChannel();
    await startConsumer(channel, deps(), log);
    transcodeFails = true;

    const msg = message();
    await deliver(msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect((await catalog.getTrack(trackId))?.status).toBe('FAILED');
  });

  it('nacks a malformed message without requeue', async () => {
    const { channel, deliver } = fakeChannel();
    await startConsumer(channel, deps(), log);

    const msg = { content: Buffer.from('not json') };
    await deliver(msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it('does nothing when the broker cancels the consumer (null message)', async () => {
    const { channel, deliver } = fakeChannel();
    await startConsumer(channel, deps(), log);

    await deliver(null);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('settles each job independently, in delivery order', async () => {
    const { channel, deliver } = fakeChannel();
    await startConsumer(channel, deps(), log);

    const first = message();
    const second = message();
    await deliver(first);
    transcodeFails = true;
    await deliver(second);

    expect(channel.ack).toHaveBeenCalledWith(first);
    expect(channel.nack).toHaveBeenCalledWith(second, false, false);
  });
});

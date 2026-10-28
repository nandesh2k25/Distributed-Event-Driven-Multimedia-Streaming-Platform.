import { describe, expect, it } from 'vitest';
import { PEAK_COUNT, PeakAccumulator } from './peaks.js';

function pcm(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => buf.writeInt16LE(s, i * 2));
  return buf;
}

describe('PeakAccumulator', () => {
  it('always returns exactly 128 values within [0, 1]', () => {
    const acc = new PeakAccumulator();
    acc.push(pcm(Array.from({ length: 50_000 }, (_, i) => Math.round(Math.sin(i / 20) * 20000))));
    const peaks = acc.finish();

    expect(peaks).toHaveLength(PEAK_COUNT);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...peaks)).toBe(1);
  });

  it('normalises so the loudest bucket is 1 and reflects relative loudness', () => {
    // first half quiet (1000), second half loud (8000); negative samples count by magnitude
    const quiet = Array.from({ length: 64 * 1024 }, () => -1000);
    const loud = Array.from({ length: 64 * 1024 }, () => 8000);
    const acc = new PeakAccumulator();
    acc.push(pcm([...quiet, ...loud]));
    const peaks = acc.finish();

    expect(peaks[0]).toBeCloseTo(0.125, 3);
    expect(peaks[127]).toBe(1);
  });

  it('gives the same result regardless of chunk boundaries, including odd byte splits', () => {
    const samples = Array.from({ length: 20_000 }, (_, i) => Math.round(Math.sin(i / 7) * (i % 5000)));
    const whole = pcm(samples);

    const a = new PeakAccumulator();
    a.push(whole);

    const b = new PeakAccumulator();
    for (let o = 0; o < whole.length; o += 1001) b.push(whole.subarray(o, o + 1001)); // odd chunk size

    expect(b.finish()).toEqual(a.finish());
  });

  it('returns 128 zeros for silence and for empty input', () => {
    const silent = new PeakAccumulator();
    silent.push(pcm(new Array(5000).fill(0)));
    expect(silent.finish()).toEqual(new Array(PEAK_COUNT).fill(0));
    expect(new PeakAccumulator().finish()).toEqual(new Array(PEAK_COUNT).fill(0));
  });

  it('handles inputs shorter than 128 windows', () => {
    const acc = new PeakAccumulator();
    acc.push(pcm([100, -300, 200]));
    const peaks = acc.finish();
    expect(peaks).toHaveLength(PEAK_COUNT);
    expect(Math.max(...peaks)).toBe(1);
  });
});

export const PEAK_COUNT = 128;
const WINDOW_SAMPLES = 1024;

/**
 * Streaming amplitude-peak extractor for 16-bit little-endian PCM. It keeps one max per
 * fixed-size window (so memory stays tiny even for long tracks) and, once the total length is
 * known, reduces those windows into `PEAK_COUNT` buckets normalised to [0, 1].
 */
export class PeakAccumulator {
  private windows: number[] = [];
  private windowMax = 0;
  private windowFill = 0;
  private leftover: Buffer | null = null;

  push(chunk: Buffer): void {
    const buf = this.leftover ? Buffer.concat([this.leftover, chunk]) : chunk;
    const usable = buf.length - (buf.length % 2);
    this.leftover = usable < buf.length ? buf.subarray(usable) : null;

    for (let offset = 0; offset < usable; offset += 2) {
      const amplitude = Math.abs(buf.readInt16LE(offset));
      if (amplitude > this.windowMax) this.windowMax = amplitude;
      if (++this.windowFill === WINDOW_SAMPLES) this.closeWindow();
    }
  }

  finish(): number[] {
    if (this.windowFill > 0) this.closeWindow();

    const n = this.windows.length;
    const buckets = new Array<number>(PEAK_COUNT).fill(0);
    if (n === 0) return buckets;

    for (let b = 0; b < PEAK_COUNT; b++) {
      const from = Math.floor((b * n) / PEAK_COUNT);
      const to = Math.max(from + 1, Math.floor(((b + 1) * n) / PEAK_COUNT));
      let max = 0;
      for (let i = from; i < Math.min(to, n); i++) max = Math.max(max, this.windows[i]!);
      buckets[b] = max;
    }

    const global = Math.max(...buckets);
    if (global === 0) return buckets;
    return buckets.map((v) => Math.round((v / global) * 10000) / 10000);
  }

  private closeWindow(): void {
    this.windows.push(this.windowMax);
    this.windowMax = 0;
    this.windowFill = 0;
  }
}

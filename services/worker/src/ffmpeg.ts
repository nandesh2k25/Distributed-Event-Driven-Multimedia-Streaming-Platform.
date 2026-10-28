import { spawn } from 'node:child_process';
import { PeakAccumulator } from './peaks.js';

export interface MediaTools {
  transcodeToMp3(input: string, output: string): Promise<void>;
  probeDuration(file: string): Promise<number>;
  computePeaks(file: string): Promise<number[]>;
}

function run(cmd: string, args: string[], onStdout?: (chunk: Buffer) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      if (onStdout) onStdout(chunk);
      else stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000); // keep only the tail for error messages
    });
    child.on('error', (err) => reject(new Error(`Failed to start ${cmd}: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

export function createMediaTools(ffmpeg = 'ffmpeg', ffprobe = 'ffprobe'): MediaTools {
  return {
    async transcodeToMp3(input, output) {
      await run(ffmpeg, [
        '-y', '-v', 'error', '-i', input,
        '-vn', '-map_metadata', '-1',
        '-codec:a', 'libmp3lame', '-b:a', '320k',
        output
      ]);
    },

    async probeDuration(file) {
      const out = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
      const seconds = parseFloat(out.trim());
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Could not determine duration of ${file}`);
      return Math.round(seconds * 1000) / 1000;
    },

    async computePeaks(file) {
      const acc = new PeakAccumulator();
      // Decode to mono 8 kHz signed 16-bit PCM and stream it straight into the accumulator.
      await run(ffmpeg, ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'], (c) => acc.push(c));
      return acc.finish();
    }
  };
}

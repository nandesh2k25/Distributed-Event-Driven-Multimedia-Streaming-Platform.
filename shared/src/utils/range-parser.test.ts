import { describe, it, expect } from 'vitest';
import { parseRangeHeader, RangeNotSatisfiableError } from './range-parser.js';

describe('parseRangeHeader', () => {
  const fileSize = 1048576; // 1 MB (1,048,576 bytes)

  it('returns null when header is null or undefined or empty', () => {
    expect(parseRangeHeader(undefined, fileSize)).toBeNull();
    expect(parseRangeHeader(null, fileSize)).toBeNull();
    expect(parseRangeHeader('', fileSize)).toBeNull();
    expect(parseRangeHeader('   ', fileSize)).toBeNull();
  });

  it('returns null when header does not start with bytes=', () => {
    expect(parseRangeHeader('items=0-10', fileSize)).toBeNull();
  });

  it('parses standard range correctly (e.g., bytes=0-1048575)', () => {
    const result = parseRangeHeader('bytes=0-1048575', fileSize);
    expect(result).toEqual({
      start: 0,
      end: 1048575,
      contentLength: 1048576,
      contentRange: 'bytes 0-1048575/1048576',
      totalSize: 1048576
    });
  });

  it('parses initial slice correctly (e.g., bytes=0-499)', () => {
    const result = parseRangeHeader('bytes=0-499', fileSize);
    expect(result).toEqual({
      start: 0,
      end: 499,
      contentLength: 500,
      contentRange: 'bytes 0-499/1048576',
      totalSize: 1048576
    });
  });

  it('parses open-ended range correctly (e.g., bytes=500-)', () => {
    const result = parseRangeHeader('bytes=500-', fileSize);
    expect(result).toEqual({
      start: 500,
      end: 1048575,
      contentLength: 1048076,
      contentRange: 'bytes 500-1048575/1048576',
      totalSize: 1048576
    });
  });

  it('parses suffix range correctly (e.g., bytes=-500)', () => {
    const result = parseRangeHeader('bytes=-500', fileSize);
    expect(result).toEqual({
      start: 1048576 - 500,
      end: 1048575,
      contentLength: 500,
      contentRange: `bytes ${1048576 - 500}-1048575/1048576`,
      totalSize: 1048576
    });
  });

  it('clamps end position when requested end exceeds file size', () => {
    const result = parseRangeHeader('bytes=0-2000000', fileSize);
    expect(result).toEqual({
      start: 0,
      end: 1048575,
      contentLength: 1048576,
      contentRange: 'bytes 0-1048575/1048576',
      totalSize: 1048576
    });
  });

  it('throws RangeNotSatisfiableError when start exceeds or equals totalSize', () => {
    expect(() => parseRangeHeader('bytes=1048576-', fileSize)).toThrow(
      RangeNotSatisfiableError
    );
    expect(() => parseRangeHeader('bytes=2000000-2500000', fileSize)).toThrow(
      RangeNotSatisfiableError
    );
  });

  it('throws RangeNotSatisfiableError when start > end', () => {
    expect(() => parseRangeHeader('bytes=500-400', fileSize)).toThrow(
      RangeNotSatisfiableError
    );
  });

  it('throws RangeNotSatisfiableError when totalSize <= 0', () => {
    expect(() => parseRangeHeader('bytes=0-100', 0)).toThrow(
      RangeNotSatisfiableError
    );
  });
});

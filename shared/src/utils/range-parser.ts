export interface ByteRange {
  start: number;
  end: number;
  contentLength: number;
  contentRange: string;
  totalSize: number;
}

export class RangeNotSatisfiableError extends Error {
  constructor(message = 'Requested range not satisfiable') {
    super(message);
    this.name = 'RangeNotSatisfiableError';
  }
}

/**
 * Parses RFC 7233 HTTP Range header values.
 * Returns null if no range header is supplied.
 * Throws RangeNotSatisfiableError if range cannot be satisfied against totalSize.
 */
export function parseRangeHeader(
  rangeHeader: string | undefined | null,
  totalSize: number
): ByteRange | null {
  if (!rangeHeader || !rangeHeader.trim()) {
    return null;
  }

  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith('bytes=')) {
    return null;
  }

  if (totalSize <= 0) {
    throw new RangeNotSatisfiableError('File size is 0, range cannot be satisfied');
  }

  const rangePart = trimmed.slice(6).trim(); // remove 'bytes='
  // Take the first range if multiple comma-separated ranges are given
  const [firstRange] = rangePart.split(',');
  if (!firstRange) {
    throw new RangeNotSatisfiableError('Empty range specification');
  }

  const parts = firstRange.trim().split('-');
  if (parts.length !== 2) {
    throw new RangeNotSatisfiableError('Invalid range format');
  }

  const rawStart = parts[0];
  const rawEnd = parts[1];
  if (rawStart === undefined || rawEnd === undefined) {
    throw new RangeNotSatisfiableError('Invalid range format');
  }
  let start: number;
  let end: number;

  if (rawStart === '' && rawEnd !== '') {
    // Suffix byte range: e.g. bytes=-500 (last 500 bytes)
    const suffixLength = parseInt(rawEnd, 10);
    if (isNaN(suffixLength) || suffixLength <= 0) {
      throw new RangeNotSatisfiableError('Invalid suffix byte length');
    }
    if (suffixLength > totalSize) {
      start = 0;
    } else {
      start = totalSize - suffixLength;
    }
    end = totalSize - 1;
  } else if (rawStart !== '' && rawEnd === '') {
    // Open-ended range: e.g. bytes=500- (from 500 to end)
    start = parseInt(rawStart, 10);
    if (isNaN(start) || start < 0) {
      throw new RangeNotSatisfiableError('Invalid start byte position');
    }
    end = totalSize - 1;
  } else if (rawStart !== '' && rawEnd !== '') {
    // Explicit range: e.g. bytes=0-499
    start = parseInt(rawStart, 10);
    end = parseInt(rawEnd, 10);
    if (isNaN(start) || isNaN(end) || start < 0) {
      throw new RangeNotSatisfiableError('Invalid start or end byte position');
    }
    // Clamp end to file size - 1 if client requested beyond file boundary
    if (end >= totalSize) {
      end = totalSize - 1;
    }
  } else {
    throw new RangeNotSatisfiableError('Both start and end cannot be empty');
  }

  if (start >= totalSize || start > end) {
    throw new RangeNotSatisfiableError(
      `Range ${start}-${end} is not satisfiable for total size ${totalSize}`
    );
  }

  const contentLength = end - start + 1;
  const contentRange = `bytes ${start}-${end}/${totalSize}`;

  return {
    start,
    end,
    contentLength,
    contentRange,
    totalSize
  };
}

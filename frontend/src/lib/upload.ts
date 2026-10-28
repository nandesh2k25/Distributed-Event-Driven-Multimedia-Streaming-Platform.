import { authHeaders } from './session';

export interface UploadMetadata {
  title: string;
  artistName: string;
  albumTitle?: string;
  genre: string;
}

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['mp3', 'wav', 'flac', 'aac', 'm4a'];

export function isSupportedAudio(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ACCEPTED_EXTENSIONS.includes(ext) && (file.type === '' || file.type.startsWith('audio/') || file.type === 'application/octet-stream');
}

/** Uploads via XHR (fetch cannot report upload progress). Resolves with the new track id. */
export function uploadTrack(
  file: File,
  meta: UploadMetadata,
  onProgress: (fraction: number) => void
): Promise<{ trackId: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // The server needs the metadata before the file part, so append the file last.
    form.append('title', meta.title);
    form.append('artistName', meta.artistName);
    if (meta.albumTitle) form.append('albumTitle', meta.albumTitle);
    form.append('genre', meta.genre);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ingest/upload');
    for (const [name, value] of Object.entries(authHeaders())) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onload = () => {
      let body: { success?: boolean; data?: { trackId: string }; error?: { message?: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status === 202 && body.data?.trackId) resolve({ trackId: body.data.trackId });
      else reject(new Error(body.error?.message ?? `Upload failed (${xhr.status})`));
    };
    xhr.send(form);
  });
}

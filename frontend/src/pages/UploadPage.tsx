import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileAudio, Loader2, Play, UploadCloud, XCircle } from 'lucide-react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { useTrackStatus } from '../hooks/useTrackStatus';
import { MAX_UPLOAD_BYTES, isSupportedAudio, uploadTrack } from '../lib/upload';
import { WaveformVisualizer } from '../components/WaveformVisualizer';

type Phase = 'idle' | 'uploading' | 'submitted' | 'error';

const inputClass =
  'w-full rounded-md bg-zinc-800 px-3 py-2 text-sm outline-none ring-accent placeholder:text-zinc-500 focus:ring-2';

export default function UploadPage() {
  const player = useAudioPlayer();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);

  const { track, error: pollError } = useTrackStatus(trackId);
  const status = track?.status ?? 'PROCESSING';

  const choose = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!isSupportedAudio(candidate)) {
      setError('Only audio files (WAV, FLAC, MP3, AAC) are supported.');
      return;
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
      return;
    }
    setError(null);
    setFile(candidate);
    if (!title) setTitle(candidate.name.replace(/\.[^.]+$/, ''));
  };

  const reset = () => {
    setFile(null);
    setTitle('');
    setAlbumTitle('');
    setPhase('idle');
    setProgress(0);
    setError(null);
    setTrackId(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setPhase('uploading');
    setProgress(0);
    setError(null);
    try {
      const { trackId: id } = await uploadTrack(file, { title, artistName, albumTitle: albumTitle || undefined, genre }, setProgress);
      setTrackId(id);
      setPhase('submitted');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const busy = phase === 'uploading';

  if (phase === 'submitted') {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-2xl font-bold">Upload Studio</h1>
        <div className="rounded-lg bg-zinc-800 p-6" aria-live="polite">
          <p className="mb-4 truncate font-medium">{title}</p>
          {status === 'READY' && track ? (
            <>
              <p className="mb-4 flex items-center gap-2 text-accent" role="status">
                <CheckCircle2 className="h-5 w-5" /> READY
              </p>
              {track.waveformPeaks && track.waveformPeaks.length > 0 && (
                <div className="mb-4 rounded-md bg-zinc-900 p-3">
                  <WaveformVisualizer
                    peaks={track.waveformPeaks}
                    duration={track.duration}
                    currentTime={player.currentTrack?.id === track.id ? player.currentTime : 0}
                    onSeek={(s) => {
                      if (player.currentTrack?.id !== track.id) player.playTrack(track);
                      player.seek(s);
                    }}
                  />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => player.playTrack(track)}
                  className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-zinc-950"
                >
                  <Play className="h-4 w-4" /> Play now
                </button>
                <button onClick={reset} className="rounded-full bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600">
                  Upload another
                </button>
                <Link to="/" className="rounded-full px-4 py-2 text-sm text-zinc-400 hover:text-white">
                  Browse
                </Link>
              </div>
            </>
          ) : status === 'FAILED' ? (
            <>
              <p className="mb-4 flex items-center gap-2 text-red-400" role="alert">
                <XCircle className="h-5 w-5" /> FAILED - the file could not be processed
              </p>
              <button onClick={reset} className="rounded-full bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600">
                Try again
              </button>
            </>
          ) : (
            <p className="flex items-center gap-2 text-amber-300" role="status">
              <Loader2 className="h-5 w-5 animate-spin" /> PROCESSING - transcoding to 320 kbps MP3 and building waveform…
            </p>
          )}
          {pollError && <p className="mt-3 text-sm text-zinc-500">Reconnecting to the status service…</p>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold">Upload Studio</h1>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
        aria-label="Choose an audio file"
        className={`mb-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition ${
          dragging ? 'border-accent bg-zinc-800' : 'border-zinc-700 hover:border-zinc-500'
        }`}
      >
        {file ? (
          <>
            <FileAudio className="h-8 w-8 text-accent" />
            <p className="max-w-full truncate font-medium">{file.name}</p>
            <p className="text-sm text-zinc-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-zinc-500" />
            <p>Drag and drop an audio file, or click to browse</p>
            <p className="text-sm text-zinc-500">WAV, FLAC, MP3 or AAC, up to 200 MB</p>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".mp3,.wav,.flac,.aac,.m4a,audio/*"
          className="hidden"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-zinc-400">Title</span>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-400">Artist</span>
          <input className={inputClass} value={artistName} onChange={(e) => setArtistName(e.target.value)} required maxLength={200} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-400">Genre</span>
          <input className={inputClass} value={genre} onChange={(e) => setGenre(e.target.value)} required maxLength={50} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-zinc-400">Album (optional)</span>
          <input className={inputClass} value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} maxLength={200} />
        </label>
      </div>

      {error && <p className="mb-4 text-red-400" role="alert">{error}</p>}

      {busy && (
        <div className="mb-4" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm text-zinc-400">Uploading… {Math.round(progress * 100)}%</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!file || busy}
        className="rounded-full bg-accent px-6 py-2 font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  );
}

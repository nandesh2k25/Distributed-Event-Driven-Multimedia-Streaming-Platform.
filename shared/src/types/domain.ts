export type TrackStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface BitrateVariant {
  bitrate: number;
  codec: string;
  s3Key: string;
  fileSize: number;
}

export interface Track {
  id: string;
  title: string;
  duration: number; // in seconds
  artistId: string;
  albumId?: string | null;
  genre: string;
  status: TrackStatus;
  originalFormat: string;
  rawStorageKey: string;
  waveformPeaks: number[]; // 128 normalized amplitude peak floats (0.0 - 1.0)
  variants: BitrateVariant[];
  createdAt: string | Date;
  updatedAt: string | Date;
  artist?: Artist;
  album?: Album | null;
}

export interface Artist {
  id: string;
  name: string;
  bio?: string | null;
  avatarUrl?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  tracks?: Track[];
  albums?: Album[];
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  coverUrl?: string | null;
  releaseYear?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  artist?: Artist;
  tracks?: Track[];
}

export interface Playlist {
  id: string;
  title: string;
  description?: string | null;
  userId: string;
  isPublic: boolean;
  coverUrl?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  tracks?: PlaylistTrack[];
}

export interface PlaylistTrack {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: string | Date;
  track?: Track;
}

export interface Favorite {
  id: string;
  userId: string;
  trackId: string;
  createdAt: string | Date;
  track?: Track;
}

export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string | Date;
}

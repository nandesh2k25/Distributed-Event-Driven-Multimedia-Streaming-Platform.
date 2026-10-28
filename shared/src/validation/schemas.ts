import { z } from 'zod';

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg'
] as const;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional()
});

export const TrackQuerySchema = PaginationQuerySchema.extend({
  genre: z.string().trim().optional(),
  artistId: z.string().trim().optional(),
  albumId: z.string().trim().optional()
});

export const CreatePlaylistSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title cannot exceed 100 characters'),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
  isPublic: z.boolean().default(true)
});

export const UpdatePlaylistSchema = CreatePlaylistSchema.partial();

export const AddTrackToPlaylistSchema = z.object({
  trackId: z.string().trim().min(1, 'Track ID is required'),
  position: z.number().int().nonnegative().optional()
});

export const ReorderPlaylistTracksSchema = z.object({
  trackIds: z.array(z.string().min(1)).min(1, 'Must provide at least one track ID')
});

export const AudioUploadMetadataSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  artistName: z.string().trim().min(1, 'Artist name is required').max(200),
  albumTitle: z.string().trim().max(200).optional(),
  genre: z.string().trim().min(1, 'Genre is required').max(50),
  duration: z.coerce.number().positive().optional()
});

export const ResolveNameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200)
});

export const ResolveAlbumSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  artistId: z.string().trim().min(1, 'artistId is required')
});

/** Fields that may be changed through PATCH /tracks/:id. */
export const UpdateTrackSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
    duration: z.number().nonnegative(),
    bitrate: z.number().int().positive(),
    format: z.string().trim().min(1).max(20),
    storageKey: z.string().min(1),
    waveformPeaks: z.array(z.number().min(0).max(1)).max(512),
    variants: z.array(z.unknown())
  })
  .partial()
  .strict();

export type UpdateTrackInput = z.infer<typeof UpdateTrackSchema>;
export type PaginationQuery= z.infer<typeof PaginationQuerySchema>;
export type TrackQuery = z.infer<typeof TrackQuerySchema>;
export type CreatePlaylistInput = z.infer<typeof CreatePlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof UpdatePlaylistSchema>;
export type AddTrackToPlaylistInput = z.infer<typeof AddTrackToPlaylistSchema>;
export type ReorderPlaylistTracksInput = z.infer<typeof ReorderPlaylistTracksSchema>;
export type AudioUploadMetadata = z.infer<typeof AudioUploadMetadataSchema>;

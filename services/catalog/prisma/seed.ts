import { PrismaClient, TrackStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Generates an array of exactly 128 normalized float peaks (0.0 - 1.0) with realistic audio envelope
function generateRealisticPeaks(seed: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < 128; i++) {
    // Generate pseudo-waveform envelope (intro, verse, build-up, drop/chorus, bridge, outro)
    const position = i / 128;
    const envelope = Math.sin(position * Math.PI); // Arc shape
    const harmonic1 = Math.sin(position * Math.PI * 4 + seed);
    const harmonic2 = Math.cos(position * Math.PI * 8 + seed * 2);
    const noise = (Math.sin(i * 999 + seed) * 0.5 + 0.5) * 0.25;

    let value = envelope * (0.4 + 0.3 * harmonic1 + 0.2 * harmonic2) + noise;
    // Clamp between 0.05 and 0.98
    value = Math.max(0.05, Math.min(0.98, parseFloat(value.toFixed(3))));
    peaks.push(value);
  }
  return peaks;
}

async function main() {
  console.log('Seeding music catalog...');

  // 1. Genres
  const genresData = [
    { name: 'Electronic', slug: 'electronic' },
    { name: 'Synthwave', slug: 'synthwave' },
    { name: 'Lo-Fi', slug: 'lo-fi' },
    { name: 'Ambient', slug: 'ambient' },
    { name: 'Deep House', slug: 'deep-house' },
    { name: 'Cyberpunk', slug: 'cyberpunk' }
  ];

  const genres: Record<string, any> = {};
  for (const g of genresData) {
    genres[g.slug] = await prisma.genre.upsert({
      where: { slug: g.slug },
      update: { name: g.name },
      create: g
    });
  }

  // 2. Artists
  const artistsData = [
    {
      name: 'Neon Mirage',
      bio: 'Synthesizer wizard creating futuristic nocturnal soundscapes and retro-wave anthems.',
      avatarUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&auto=format&fit=crop&q=80'
    },
    {
      name: 'Solaris Echo',
      bio: 'Ethereal sound designer blending organic field recordings with analog modular synthesis.',
      avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80'
    },
    {
      name: 'Midnight Tape',
      bio: 'Analog lo-fi beatmaker crafting dusty vinyl nostalgia for late-night study and coding sessions.',
      avatarUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&auto=format&fit=crop&q=80'
    },
    {
      name: 'Krypton Drive',
      bio: 'Dark electro and cyberpunk producer with relentless drum machines and distorted analog bass.',
      avatarUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80'
    }
  ];

  const artists: Record<string, any> = {};
  for (const a of artistsData) {
    const existing = await prisma.artist.findFirst({ where: { name: a.name } });
    if (existing) {
      artists[a.name] = await prisma.artist.update({
        where: { id: existing.id },
        data: a
      });
    } else {
      artists[a.name] = await prisma.artist.create({ data: a });
    }
  }

  // 3. Albums
  const albumsData = [
    {
      title: 'Cyber Horizon',
      artistName: 'Neon Mirage',
      releaseYear: 2024,
      coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'
    },
    {
      title: 'Retrograde',
      artistName: 'Neon Mirage',
      releaseYear: 2023,
      coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80'
    },
    {
      title: 'Infinite Drift',
      artistName: 'Solaris Echo',
      releaseYear: 2024,
      coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80'
    },
    {
      title: 'Coffee & Cassettes',
      artistName: 'Midnight Tape',
      releaseYear: 2023,
      coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80'
    },
    {
      title: 'Neon Overdrive',
      artistName: 'Krypton Drive',
      releaseYear: 2024,
      coverUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80'
    }
  ];

  const albums: Record<string, any> = {};
  for (const alb of albumsData) {
    const artist = artists[alb.artistName];
    const existing = await prisma.album.findFirst({
      where: { title: alb.title, artistId: artist.id }
    });
    if (existing) {
      albums[alb.title] = await prisma.album.update({
        where: { id: existing.id },
        data: { coverUrl: alb.coverUrl, releaseYear: alb.releaseYear }
      });
    } else {
      albums[alb.title] = await prisma.album.create({
        data: {
          title: alb.title,
          coverUrl: alb.coverUrl,
          releaseYear: alb.releaseYear,
          artistId: artist.id
        }
      });
    }
  }

  // 4. Tracks
  const tracksData = [
    {
      title: 'Nightfall Velocity',
      artistName: 'Neon Mirage',
      albumTitle: 'Cyber Horizon',
      genreSlug: 'synthwave',
      duration: 234.5,
      bitrate: 320000,
      trackNumber: 1,
      format: 'mp3',
      storageKey: 'processed/neon-mirage-nightfall-velocity.mp3',
      seed: 1
    },
    {
      title: 'Chrome Sunset',
      artistName: 'Neon Mirage',
      albumTitle: 'Cyber Horizon',
      genreSlug: 'synthwave',
      duration: 198.2,
      bitrate: 320000,
      trackNumber: 2,
      format: 'mp3',
      storageKey: 'processed/neon-mirage-chrome-sunset.mp3',
      seed: 2
    },
    {
      title: 'Starlight Expressway',
      artistName: 'Neon Mirage',
      albumTitle: 'Retrograde',
      genreSlug: 'synthwave',
      duration: 265.0,
      bitrate: 320000,
      trackNumber: 1,
      format: 'mp3',
      storageKey: 'processed/neon-mirage-starlight-expressway.mp3',
      seed: 3
    },
    {
      title: 'Deep Stellar Drift',
      artistName: 'Solaris Echo',
      albumTitle: 'Infinite Drift',
      genreSlug: 'ambient',
      duration: 342.8,
      bitrate: 320000,
      trackNumber: 1,
      format: 'mp3',
      storageKey: 'processed/solaris-echo-deep-stellar-drift.mp3',
      seed: 4
    },
    {
      title: 'Subsurface Echoes',
      artistName: 'Solaris Echo',
      albumTitle: 'Infinite Drift',
      genreSlug: 'ambient',
      duration: 288.4,
      bitrate: 320000,
      trackNumber: 2,
      format: 'mp3',
      storageKey: 'processed/solaris-echo-subsurface-echoes.mp3',
      seed: 5
    },
    {
      title: 'Raindrops on 4th Street',
      artistName: 'Midnight Tape',
      albumTitle: 'Coffee & Cassettes',
      genreSlug: 'lo-fi',
      duration: 176.1,
      bitrate: 320000,
      trackNumber: 1,
      format: 'mp3',
      storageKey: 'processed/midnight-tape-raindrops-on-4th-street.mp3',
      seed: 6
    },
    {
      title: 'Late Night Espresso',
      artistName: 'Midnight Tape',
      albumTitle: 'Coffee & Cassettes',
      genreSlug: 'lo-fi',
      duration: 162.7,
      bitrate: 320000,
      trackNumber: 2,
      format: 'mp3',
      storageKey: 'processed/midnight-tape-late-night-espresso.mp3',
      seed: 7
    },
    {
      title: 'Midnight Reverie',
      artistName: 'Midnight Tape',
      albumTitle: 'Coffee & Cassettes',
      genreSlug: 'lo-fi',
      duration: 189.3,
      bitrate: 320000,
      trackNumber: 3,
      format: 'mp3',
      storageKey: 'processed/midnight-tape-midnight-reverie.mp3',
      seed: 8
    },
    {
      title: 'Grid Runner 2099',
      artistName: 'Krypton Drive',
      albumTitle: 'Neon Overdrive',
      genreSlug: 'cyberpunk',
      duration: 248.6,
      bitrate: 320000,
      trackNumber: 1,
      format: 'mp3',
      storageKey: 'processed/krypton-drive-grid-runner-2099.mp3',
      seed: 9
    },
    {
      title: 'Cyber Pulse Matrix',
      artistName: 'Krypton Drive',
      albumTitle: 'Neon Overdrive',
      genreSlug: 'cyberpunk',
      duration: 221.0,
      bitrate: 320000,
      trackNumber: 2,
      format: 'mp3',
      storageKey: 'processed/krypton-drive-cyber-pulse-matrix.mp3',
      seed: 10
    },
    {
      title: 'Neural Overload',
      artistName: 'Krypton Drive',
      albumTitle: 'Neon Overdrive',
      genreSlug: 'cyberpunk',
      duration: 275.3,
      bitrate: 320000,
      trackNumber: 3,
      format: 'mp3',
      storageKey: 'processed/krypton-drive-neural-overload.mp3',
      seed: 11
    },
    {
      title: 'Midnight Highway',
      artistName: 'Neon Mirage',
      albumTitle: 'Cyber Horizon',
      genreSlug: 'synthwave',
      duration: 215.4,
      bitrate: 320000,
      trackNumber: 3,
      format: 'mp3',
      storageKey: 'processed/neon-mirage-midnight-highway.mp3',
      seed: 12
    }
  ];

  for (const t of tracksData) {
    const artist = artists[t.artistName];
    const album = albums[t.albumTitle];
    const genre = genres[t.genreSlug];
    const peaks = generateRealisticPeaks(t.seed);

    const existing = await prisma.track.findFirst({
      where: { title: t.title, artistId: artist.id }
    });

    const trackPayload = {
      title: t.title,
      duration: t.duration,
      bitrate: t.bitrate,
      format: t.format,
      originalFormat: t.format,
      storageKey: t.storageKey,
      rawStorageKey: `raw/${t.storageKey.split('/').pop()}`,
      waveformPeaks: peaks,
      variants: [
        {
          bitrate: 320000,
          codec: 'mp3',
          s3Key: t.storageKey,
          fileSize: Math.round(t.duration * (320000 / 8))
        }
      ],
      status: TrackStatus.READY,
      trackNumber: t.trackNumber,
      // The last third of the catalog is premium so guests see both kinds.
      isFree: tracksData.indexOf(t) < 8,
      playCount: Math.floor(Math.random() * 500) + 50,
      artistId: artist.id,
      albumId: album?.id || null,
      genreId: genre?.id || null
    };

    if (existing) {
      await prisma.track.update({
        where: { id: existing.id },
        data: trackPayload
      });
    } else {
      await prisma.track.create({
        data: trackPayload
      });
    }
  }

  console.log(`Successfully seeded ${genresData.length} genres, ${artistsData.length} artists, ${albumsData.length} albums, and ${tracksData.length} tracks.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import {Track} from '../src/types/bot.js';
import {musicCatalog} from './musicCatalog.js';

interface ITunesResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
}

interface DeezerResult {
  id?: number;
  title?: string;
  duration?: number;
  preview?: string;
  artist?: {name?: string};
  album?: {title?: string; cover_medium?: string};
}

const PERSIAN_QUERY_FALLBACKS: Array<[RegExp, string]> = [
  [/بهنام\s*بانی/i, 'Behnam Bani'],
  [/شادمهر(\s*عقیلی)?/i, 'Shadmehr Aghili'],
  [/محسن\s*چاوشی/i, 'Mohsen Chavoshi'],
  [/محسن\s*یگانه/i, 'Mohsen Yeganeh'],
  [/محسن\s*ابراهیم[\s‌]*زاده/i, 'Mohsen Ebrahimzadeh'],
  [/هایده/i, 'Hayedeh'],
  [/مهستی/i, 'Mahasti'],
  [/معین/i, 'Moein'],
  [/ابی/i, 'Ebi'],
  [/گوگوش/i, 'Googoosh'],
  [/داریوش/i, 'Dariush'],
  [/سیاوش\s*قمیشی/i, 'Siavash Ghomayshi'],
  [/ماکان\s*بند/i, 'Macan Band'],
  [/علیرضا\s*طلیسچی/i, 'Alireza Talischi'],
  [/رضا\s*بهرام/i, 'Reza Bahram'],
  [/حمید\s*هیراد/i, 'Hamid Hiraad'],
  [/مرتضی\s*پاشایی/i, 'Morteza Pashaei'],
  [/حجت\s*اشرف[\s‌]*زاده/i, 'Hojjat Ashrafzadeh'],
  [/مجید\s*خراطها/i, 'Majid Kharatha'],
  [/آرش/i, 'Arash'],
  [/ساسی/i, 'Sasy'],
  [/تتلو/i, 'Amir Tataloo'],
  [/راغب/i, 'Ragheb'],
  [/لری/i, 'Lori Iranian Folk'],
  [/سنتی/i, 'Persian Traditional Music'],
  [/شاد/i, 'Persian Pop Happy'],
  [/غمگین/i, 'Persian Sad Song'],
];

function resolveLatinFallbackQuery(query: string): string | null {
  for (const [pattern, latin] of PERSIAN_QUERY_FALLBACKS) {
    if (pattern.test(query)) return latin;
  }
  return null;
}

export async function searchMusicReal(
  query: string,
  requestedBy = 'کاربر',
  allowFallback = true,
): Promise<Track[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];

  const tracks: Track[] = [];
  const nowIso = new Date().toISOString();

  // 0. Include matching tracks from the 1,000+ local verified catalog first
  const localMatches = musicCatalog.searchLocal(cleaned, 25);
  for (const item of localMatches) {
    tracks.push({
      ...item,
      requestedBy,
      requestedAt: nowIso,
    });
  }

  // 1. Query iTunes Search API (up to 50 real tracks)
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleaned)}&media=music&entity=song&limit=50`;
    const res = await fetch(itunesUrl, {
      headers: {'User-Agent': 'ParyaRubikaMusicBot/1.0'},
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as {results?: ITunesItemFallback[]};
      for (const item of data.results || []) {
        if (!item.previewUrl) continue;
        const exists = tracks.some(
          (t) =>
            t.streamUrl === item.previewUrl ||
            (t.title.toLowerCase() === (item.trackName || '').toLowerCase() &&
              t.artist.toLowerCase() === (item.artistName || '').toLowerCase()),
        );
        if (exists) continue;
        tracks.push({
          id: `itunes_${item.trackId ?? Math.random().toString(36).slice(2, 9)}`,
          title: item.trackName || cleaned,
          artist: item.artistName || 'هنرمند ناشناس',
          album: item.collectionName,
          durationSec: Math.max(30, Math.round((item.trackTimeMillis || 30000) / 1000)),
          streamUrl: item.previewUrl,
          sourceUrl: item.previewUrl,
          artworkUrl: item.artworkUrl100?.replace('100x100', '300x300'),
          source: 'itunes',
          requestedBy,
          requestedAt: nowIso,
        });
      }
    }
  } catch {
    // Fallback to Deezer below
  }

  // 2. Also query Deezer Public API (up to 25 tracks)
  if (tracks.length < 30) {
    try {
      const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(cleaned)}&limit=25`;
      const res = await fetch(deezerUrl, {
        headers: {'User-Agent': 'ParyaRubikaMusicBot/1.0'},
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as {data?: DeezerResult[]};
        for (const item of data.data || []) {
          if (!item.preview) continue;
          const exists = tracks.some(
            (t) =>
              t.streamUrl === item.preview ||
              (t.title.toLowerCase() === (item.title || '').toLowerCase() &&
                t.artist.toLowerCase() === (item.artist?.name || '').toLowerCase()),
          );
          if (exists) continue;
          tracks.push({
            id: `deezer_${item.id ?? Math.random().toString(36).slice(2, 9)}`,
            title: item.title || cleaned,
            artist: item.artist?.name || 'هنرمند ناشناس',
            album: item.album?.title,
            durationSec: item.duration || 30,
            streamUrl: item.preview,
            sourceUrl: item.preview,
            artworkUrl: item.album?.cover_medium,
            source: 'deezer',
            requestedBy,
            requestedAt: nowIso,
          });
        }
      }
    } catch {
      // Return whatever tracks were found
    }
  }

  if (tracks.length === 0 && allowFallback) {
    const latin = resolveLatinFallbackQuery(cleaned);
    if (latin) {
      return searchMusicReal(latin, requestedBy, false);
    }
  }

  return tracks;
}

type ITunesItemFallback = ITunesResult;

export function buildTrackFromDirectUrl(
  rawUrl: string,
  requestedBy: string,
  customTitle?: string,
  source: 'direct' | 'reply' = 'direct',
): Track | null {
  try {
    const cleaned = rawUrl.trim();
    if (cleaned.startsWith('/api/')) {
      return {
        id: `${source}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: customTitle || 'پیام صوتی چت',
        artist: requestedBy,
        durationSec: 60,
        streamUrl: cleaned,
        sourceUrl: cleaned,
        source,
        requestedBy,
        requestedAt: new Date().toISOString(),
      };
    }
    const parsed = new URL(cleaned);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    const fileName = decodeURIComponent(parsed.pathname.split('/').pop() || 'پخش مستقیم')
      .replace(/\.(mp3|m4a|ogg|wav|aac|flac|webm)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();

    return {
      id: `${source}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: customTitle || fileName || 'پخش مستقیم صوتی',
      artist: parsed.hostname,
      durationSec: 180,
      streamUrl: parsed.toString(),
      sourceUrl: parsed.toString(),
      source,
      requestedBy,
      requestedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

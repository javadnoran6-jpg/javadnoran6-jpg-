import {GoogleGenAI} from '@google/genai';
import {Track} from '../src/types/bot.js';
import {searchMusicReal} from './musicService.js';

export interface TrendingSongSuggestion {
  rank: number;
  reason?: string;
  track: Track;
}

export interface TrendingDiscoveryResult {
  suggestions: TrendingSongSuggestion[];
  sources: Array<{title: string; uri: string}>;
  provider: 'google_search_grounding' | 'live_music_charts';
  notice?: string;
  searchedAt: string;
}

interface ParsedSongCandidate {
  title: string;
  artist: string;
  reason?: string;
}

function parseJsonCandidates(rawText: string): ParsedSongCandidate[] {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => ({
            title: String(item.title || '').trim(),
            artist: String(item.artist || '').trim(),
            reason: item.reason ? String(item.reason).trim() : undefined,
          }))
          .filter((x) => x.title.length > 0);
      }
    } catch {
      // Fallback to line parsing
    }
  }

  // Fallback line-based extraction: "1. Song Title - Artist"
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: ParsedSongCandidate[] = [];
  for (const line of lines) {
    const m = line.match(/^(?:\d+[\.\)]\s*|[-*•]\s*)?(.+?)\s*[-–—:]\s*(.+)$/);
    if (m) {
      items.push({
        title: m[1].replace(/["*`]/g, '').trim(),
        artist: m[2].replace(/["*`]/g, '').trim(),
      });
    }
  }
  return items.slice(0, 12);
}

export async function discoverTrendingRubikaSongs(): Promise<TrendingDiscoveryResult> {
  const searchedAt = new Date().toISOString();
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Search online for the latest and most popular viral Persian songs trending right now on Rubika (روبیکا), Instagram Iran, and Persian music charts in 2026 / 1404-1405.
Return ONLY a JSON array of up to 10 real songs with this exact structure:
[
  { "title": "Song Title", "artist": "Artist Name", "reason": "کوتاه به فارسی درباره دلیل محبوبیت این آهنگ در روبیکا" }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      const text = response.text || '';
      const candidates = parseJsonCandidates(text);

      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: Array<{title: string; uri: string}> = [];
      for (const ch of rawChunks) {
        if (ch.web?.uri) {
          sources.push({
            title: ch.web.title || ch.web.uri,
            uri: ch.web.uri,
          });
        }
      }

      if (candidates.length > 0) {
        const resolved = await Promise.all(
          candidates.slice(0, 10).map(async (cand, idx): Promise<TrendingSongSuggestion | null> => {
            const query = `${cand.title} ${cand.artist}`.trim();
            const matches = await searchMusicReal(query, 'پیشنهاد ترند روبیکا');
            if (matches.length === 0) return null;
            return {
              rank: idx + 1,
              reason: cand.reason,
              track: {
                ...matches[0],
                requestedBy: 'ترند آنلاین روبیکا',
              },
            };
          }),
        );

        const valid = resolved.filter((x): x is TrendingSongSuggestion => x !== null);
        if (valid.length > 0) {
          return {
            suggestions: valid.map((item, i) => ({...item, rank: i + 1})),
            sources: sources.slice(0, 6),
            provider: 'google_search_grounding',
            searchedAt,
          };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطا در جستجوی آنلاین Gemini';
      // Fall through to live online music chart APIs while surfacing notice
      const fallback = await fetchLiveOnlinePersianCharts(searchedAt, message);
      return fallback;
    }
  }

  return fetchLiveOnlinePersianCharts(
    searchedAt,
    apiKey ? undefined : 'کلید جستجوی وب Gemini تنظیم نشده است؛ نتایج مستقیم از چارت آنلاین موسیقی دریافت شد.',
  );
}

async function fetchLiveOnlinePersianCharts(
  searchedAt: string,
  notice?: string,
): Promise<TrendingDiscoveryResult> {
  const queries = [
    'آهنگ جدید ایرانی پرطرفدار',
    'ریمیکس جدید شاد ایرانی',
    'حامیم جدید',
    'محسن چاوشی جدید',
    'آرون افشار جدید',
  ];

  const collected: Track[] = [];
  const seenUrls = new Set<string>();

  const batches = await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=6`,
          {
            headers: {'User-Agent': 'ParyaRubikaMusicBot/1.0'},
            signal: AbortSignal.timeout(7000),
          },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
          results?: Array<{
            trackId?: number;
            trackName?: string;
            artistName?: string;
            collectionName?: string;
            previewUrl?: string;
            artworkUrl100?: string;
            trackTimeMillis?: number;
          }>;
        };
        return (data.results || [])
          .filter((item) => Boolean(item.previewUrl))
          .map((item): Track => ({
            id: `trend_it_${item.trackId ?? Math.random().toString(36).slice(2, 8)}`,
            title: item.trackName || q,
            artist: item.artistName || 'هنرمند ایرانی',
            album: item.collectionName,
            durationSec: Math.max(30, Math.round((item.trackTimeMillis || 30000) / 1000)),
            streamUrl: item.previewUrl!,
            sourceUrl: item.previewUrl!,
            artworkUrl: item.artworkUrl100?.replace('100x100', '300x300'),
            source: 'itunes',
            requestedBy: 'ترند آنلاین',
            requestedAt: searchedAt,
          }));
      } catch {
        return [];
      }
    }),
  );

  for (const list of batches) {
    for (const t of list) {
      if (seenUrls.has(t.streamUrl)) continue;
      seenUrls.add(t.streamUrl);
      collected.push(t);
    }
  }

  return {
    suggestions: collected.slice(0, 10).map((track, idx) => ({
      rank: idx + 1,
      reason: 'دریافت‌شده از چارت آنلاین موسیقی فارسی',
      track,
    })),
    sources: [
      {title: 'iTunes Live Music Search', uri: 'https://itunes.apple.com'},
    ],
    provider: 'live_music_charts',
    notice,
    searchedAt,
  };
}

export async function smartSearchOnlineSongs(query: string): Promise<TrendingDiscoveryResult> {
  const cleaned = query.trim();
  const searchedAt = new Date().toISOString();
  if (!cleaned) {
    return {
      suggestions: [],
      sources: [],
      provider: 'live_music_charts',
      notice: 'عبارت جستجو وارد نشده است.',
      searchedAt,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const sources: Array<{title: string; uri: string}> = [];
  const collected: TrendingSongSuggestion[] = [];
  const seenUrls = new Set<string>();
  let notice: string | undefined;

  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `The user is searching for music for a Rubika group voice chat with this request:
"${cleaned}"

Search online music sources and Persian/global music charts for up to 8 real, specific songs matching this request (exact song title + artist name, preferring real well-known tracks available on music platforms).
Return ONLY a JSON array with this exact schema:
[
  { "title": "Exact Song Title", "artist": "Artist Name", "reason": "توضیح کوتاه فارسی درباره تناسب با جستجو" }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      const text = response.text || '';
      const candidates = parseJsonCandidates(text);
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      for (const ch of rawChunks) {
        if (ch.web?.uri) {
          sources.push({
            title: ch.web.title || ch.web.uri,
            uri: ch.web.uri,
          });
        }
      }

      if (candidates.length > 0) {
        const resolved = await Promise.all(
          candidates.slice(0, 8).map(async (cand): Promise<TrendingSongSuggestion | null> => {
            const q = `${cand.title} ${cand.artist}`.trim();
            const matches = await searchMusicReal(q, 'جستجوی هوشمند');
            if (matches.length === 0) return null;
            return {
              rank: 0,
              reason: cand.reason,
              track: {
                ...matches[0],
                requestedBy: 'جستجوی هوشمند آنلاین',
              },
            };
          }),
        );

        for (const item of resolved) {
          if (!item || seenUrls.has(item.track.streamUrl)) continue;
          seenUrls.add(item.track.streamUrl);
          collected.push({
            ...item,
            rank: collected.length + 1,
          });
        }
      }
    } catch (err) {
      notice = err instanceof Error ? err.message : 'جستجوی آنلاین مستقیم انجام شد.';
    }
  } else {
    notice = 'نتایج مستقیم از سرویس‌های آنلاین موسیقی (iTunes و Deezer) دریافت شد.';
  }

  // Merge direct live online search matches so even exact/partial Persian or English queries always return rich playable tracks
  const directMatches = await searchMusicReal(cleaned, 'جستجوی هوشمند آنلاین');
  for (const t of directMatches.slice(0, 10)) {
    if (seenUrls.has(t.streamUrl)) continue;
    seenUrls.add(t.streamUrl);
    collected.push({
      rank: collected.length + 1,
      reason: 'مطابقت مستقیم از منابع آنلاین موسیقی',
      track: t,
    });
  }

  if (sources.length === 0) {
    sources.push({title: 'iTunes & Deezer Online Music API', uri: 'https://itunes.apple.com'});
  }

  return {
    suggestions: collected.slice(0, 12).map((s, i) => ({...s, rank: i + 1})),
    sources: sources.slice(0, 6),
    provider: apiKey && apiKey !== 'MY_GEMINI_API_KEY' && !notice ? 'google_search_grounding' : 'live_music_charts',
    notice,
    searchedAt,
  };
}


import fs from 'fs';
import path from 'path';
import {
  MusicMood,
  PlaybackAnalyticsEvent,
  SmartPlaylistAdaptMode,
  SmartPlaylistTimeSlot,
  Track,
} from '../src/types/bot.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'music-catalog.json');

interface SeedQuery {
  term: string;
  mood: MusicMood;
}

const CATALOG_SEEDS: SeedQuery[] = [
  // شاد (Happy / Dance / Upbeat Persian)
  {term: 'بهنام بانی', mood: 'شاد'},
  {term: 'ماکان بند', mood: 'شاد'},
  {term: 'پازل بند', mood: 'شاد'},
  {term: 'اندی', mood: 'شاد'},
  {term: 'سندی', mood: 'شاد'},
  {term: 'شهرام شب پره', mood: 'شاد'},
  {term: 'ساسی', mood: 'شاد'},
  {term: 'بنیامین بهادری', mood: 'شاد'},
  {term: 'منصور', mood: 'شاد'},
  {term: 'کامران و هومن', mood: 'شاد'},
  {term: 'بلک کتس', mood: 'شاد'},
  {term: 'محسن ابراهیم زاده', mood: 'شاد'},
  {term: 'آهنگ شاد ایرانی', mood: 'شاد'},
  {term: 'بندری شاد', mood: 'شاد'},
  {term: 'حسن شماعی زاده', mood: 'شاد'},
  {term: 'سحر', mood: 'شاد'},
  {term: 'سپیده', mood: 'شاد'},
  {term: 'شهاب مظفری', mood: 'شاد'},
  {term: 'هوروش بند', mood: 'شاد'},
  {term: 'ایوان بند', mood: 'شاد'},
  {term: 'امیر عباس گلاب', mood: 'شاد'},
  {term: 'امو بند', mood: 'شاد'},
  {term: 'سپهر خلسه', mood: 'شاد'},
  {term: 'سوگند', mood: 'شاد'},
  {term: 'شهرام کاشانی', mood: 'شاد'},
  {term: 'افشین', mood: 'شاد'},
  {term: 'بهزاد لیتو', mood: 'شاد'},

  // غمگین (Sad / Emotional Persian)
  {term: 'محسن چاوشی', mood: 'غمگین'},
  {term: 'محسن یگانه', mood: 'غمگین'},
  {term: 'مرتضی پاشایی', mood: 'غمگین'},
  {term: 'مجید خراطها', mood: 'غمگین'},
  {term: 'رضا بهرام', mood: 'غمگین'},
  {term: 'مهدی احمدوند', mood: 'غمگین'},
  {term: 'علی یاسینی', mood: 'غمگین'},
  {term: 'داریوش', mood: 'غمگین'},
  {term: 'هایده', mood: 'غمگین'},
  {term: 'مهستی', mood: 'غمگین'},
  {term: 'فریدون فروغی', mood: 'غمگین'},
  {term: 'احسان خواجه امیری', mood: 'غمگین'},
  {term: 'رضا صادقی', mood: 'غمگین'},
  {term: 'علی عبدالمالکی', mood: 'غمگین'},
  {term: 'مسعود صادقلو', mood: 'غمگین'},
  {term: 'سامان جلیلی', mood: 'غمگین'},
  {term: 'آهنگ غمگین ایرانی', mood: 'غمگین'},
  {term: 'ناصر عبداللهی', mood: 'غمگین'},
  {term: 'بهنام صفوی', mood: 'غمگین'},
  {term: 'مازیار فلاحی', mood: 'غمگین'},
  {term: 'فرزاد فرخ', mood: 'غمگین'},
  {term: 'شایع', mood: 'غمگین'},
  {term: 'یاس', mood: 'غمگین'},
  {term: 'علی زند وکیلی', mood: 'غمگین'},
  {term: 'پویا بیاتی', mood: 'غمگین'},

  // محلی و لری (Regional / Lori / Kurdish / Turkish / Gilaki)
  {term: 'آهنگ لری', mood: 'محلی و لری'},
  {term: 'لری بختیاری', mood: 'محلی و لری'},
  {term: 'سجاد رزمجو', mood: 'محلی و لری'},
  {term: 'آهنگ کردی شاد', mood: 'محلی و لری'},
  {term: 'آهنگ ترکی شاد', mood: 'محلی و لری'},
  {term: 'فرج علیپور', mood: 'محلی و لری'},
  {term: 'مسعود بختیاری', mood: 'محلی و لری'},
  {term: 'سعید کریمی', mood: 'محلی و لری'},

  // سنتی (Traditional Persian)
  {term: 'همایون شجریان', mood: 'سنتی'},
  {term: 'علیرضا قربانی', mood: 'سنتی'},
  {term: 'محمدرضا شجریان', mood: 'سنتی'},
  {term: 'سالار عقیلی', mood: 'سنتی'},
  {term: 'کیهان کلهر', mood: 'سنتی'},

  // پاپ و نوستالژی
  {term: 'شادمهر عقیلی', mood: 'پاپ'},
  {term: 'سیروان خسروی', mood: 'پاپ'},
  {term: 'آرون افشار', mood: 'پاپ'},
  {term: 'گرشا رضایی', mood: 'پاپ'},
  {term: 'حامیم', mood: 'پاپ'},
  {term: 'راغب', mood: 'پاپ'},
  {term: 'معین', mood: 'نوستالژی'},
  {term: 'ابی', mood: 'نوستالژی'},
  {term: 'سیاوش قمیشی', mood: 'نوستالژی'},
  {term: 'گوگوش', mood: 'نوستالژی'},
  {term: 'حمیرا', mood: 'نوستالژی'},
  {term: 'امید', mood: 'نوستالژی'},
  {term: 'ستار', mood: 'نوستالژی'},

  // آرام و بی‌کلام
  {term: 'Ludovico Einaudi', mood: 'آرام'},
  {term: 'Yanni', mood: 'آرام'},
  {term: 'انوشیروان روحانی', mood: 'آرام'},
  {term: 'پیانو غمگین', mood: 'آرام'},
];

interface ITunesItem {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
}

class MusicCatalogService {
  private tracks: Track[] = [];
  private isIndexing = false;
  private lastSyncedAt: string | null = null;
  private seedCursor = 0;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {recursive: true});
      }
      if (fs.existsSync(CATALOG_FILE)) {
        const raw = fs.readFileSync(CATALOG_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as {tracks?: Track[]; lastSyncedAt?: string; seedCursor?: number};
        if (Array.isArray(parsed.tracks)) {
          this.tracks = parsed.tracks;
          this.lastSyncedAt = parsed.lastSyncedAt || null;
          this.seedCursor = parsed.seedCursor || 0;
        }
      }
    } catch {
      this.tracks = [];
    }
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {recursive: true});
      }
      fs.writeFileSync(
        CATALOG_FILE,
        JSON.stringify(
          {
            lastSyncedAt: this.lastSyncedAt,
            seedCursor: this.seedCursor,
            tracks: this.tracks,
          },
          null,
          2,
        ),
        'utf-8',
      );
    } catch (err) {
      console.error('Failed to save music catalog:', err);
    }
  }

  private async fetchSeedBatch(seed: SeedQuery): Promise<Track[]> {
    const out: Track[] = [];
    const nowIso = new Date().toISOString();
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(seed.term)}&media=music&entity=song&limit=50`;
      const res = await fetch(url, {
        headers: {'User-Agent': 'ParyaRubikaMusicBot/1.0'},
        signal: AbortSignal.timeout(9000),
      });
      if (res.ok) {
        const data = (await res.json()) as {results?: ITunesItem[]};
        for (const item of data.results || []) {
          if (!item.previewUrl) continue;
          out.push({
            id: `cat_it_${item.trackId ?? Math.random().toString(36).slice(2, 9)}`,
            title: item.trackName || seed.term,
            artist: item.artistName || 'هنرمند ناشناس',
            album: item.collectionName,
            durationSec: Math.max(30, Math.round((item.trackTimeMillis || 30000) / 1000)),
            streamUrl: item.previewUrl,
            sourceUrl: item.previewUrl,
            artworkUrl: item.artworkUrl100?.replace('100x100', '300x300'),
            source: 'itunes',
            mood: seed.mood,
            requestedBy: 'آرشیو ربات',
            requestedAt: nowIso,
          });
        }
      }
    } catch {
      // Ignore single seed network timeout
    }
    return out;
  }

  private mergeTracks(incoming: Track[]): number {
    const seenKeys = new Set(
      this.tracks.map((t) => `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`),
    );
    const seenUrls = new Set(this.tracks.map((t) => t.streamUrl));
    let added = 0;
    for (const item of incoming) {
      const key = `${item.title.toLowerCase()}::${item.artist.toLowerCase()}`;
      if (seenKeys.has(key) || seenUrls.has(item.streamUrl)) continue;
      seenKeys.add(key);
      seenUrls.add(item.streamUrl);
      this.tracks.push(item);
      added++;
    }
    return added;
  }

  public async ensureHydrated(targetCount = 1150): Promise<void> {
    if (this.isIndexing || this.tracks.length >= targetCount) return;
    await this.syncCatalog(targetCount);
  }

  public async syncCatalog(targetCount = 1300): Promise<{
    total: number;
    added: number;
    isIndexing: boolean;
  }> {
    if (this.isIndexing) {
      return {total: this.tracks.length, added: 0, isIndexing: true};
    }
    this.isIndexing = true;
    let totalAdded = 0;

    try {
      const concurrency = 6;
      let loops = 0;
      while (this.tracks.length < targetCount && loops < Math.ceil(CATALOG_SEEDS.length / concurrency) + 2) {
        const batch: SeedQuery[] = [];
        for (let i = 0; i < concurrency; i++) {
          batch.push(CATALOG_SEEDS[this.seedCursor % CATALOG_SEEDS.length]);
          this.seedCursor = (this.seedCursor + 1) % CATALOG_SEEDS.length;
        }
        const results = await Promise.all(batch.map((seed) => this.fetchSeedBatch(seed)));
        for (const list of results) {
          totalAdded += this.mergeTracks(list);
        }
        this.lastSyncedAt = new Date().toISOString();
        this.saveToDisk();
        loops++;
        if (this.seedCursor === 0 && loops >= Math.ceil(CATALOG_SEEDS.length / concurrency)) {
          break;
        }
      }
    } finally {
      this.isIndexing = false;
      this.lastSyncedAt = new Date().toISOString();
      this.saveToDisk();
    }

    return {
      total: this.tracks.length,
      added: totalAdded,
      isIndexing: false,
    };
  }

  public getStats(): {
    total: number;
    isIndexing: boolean;
    lastSyncedAt: string | null;
    countsByMood: Record<string, number>;
  } {
    const countsByMood: Record<string, number> = {
      'همه': this.tracks.length,
      'شاد': 0,
      'غمگین': 0,
      'محلی و لری': 0,
      'سنتی': 0,
      'پاپ': 0,
      'نوستالژی': 0,
      'آرام': 0,
    };
    for (const t of this.tracks) {
      const m = t.mood || 'پاپ';
      countsByMood[m] = (countsByMood[m] || 0) + 1;
    }
    return {
      total: this.tracks.length,
      isIndexing: this.isIndexing,
      lastSyncedAt: this.lastSyncedAt,
      countsByMood,
    };
  }

  public queryCatalog(params: {
    mood?: string;
    q?: string;
    offset?: number;
    limit?: number;
  }): {
    tracks: Track[];
    totalMatched: number;
    stats: ReturnType<MusicCatalogService['getStats']>;
  } {
    const moodFilter = (params.mood || '').trim();
    const q = (params.q || '').trim().toLowerCase();
    const offset = Math.max(0, params.offset || 0);
    const limit = Math.min(100, Math.max(1, params.limit || 40));

    let filtered = this.tracks;
    if (moodFilter && moodFilter !== 'همه') {
      filtered = filtered.filter((t) => t.mood === moodFilter);
    }
    if (q) {
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album || '').toLowerCase().includes(q) ||
          (t.mood || '').toLowerCase().includes(q),
      );
    }

    return {
      tracks: filtered.slice(offset, offset + limit),
      totalMatched: filtered.length,
      stats: this.getStats(),
    };
  }

  public searchLocal(query: string, limit = 25): Track[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.tracks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.mood || '').toLowerCase().includes(q),
      )
      .slice(0, limit);
  }

  public pickRandom(mood?: MusicMood, count = 1, requestedBy = 'کاربر'): Track[] {
    let pool = mood ? this.tracks.filter((t) => t.mood === mood) : this.tracks;
    if (pool.length === 0) pool = this.tracks;
    if (pool.length === 0) return [];

    const copy = [...pool];
    const picked: Track[] = [];
    const nowIso = new Date().toISOString();
    const target = Math.min(count, copy.length);
    for (let i = 0; i < target; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      const [item] = copy.splice(idx, 1);
      picked.push({
        ...item,
        requestedBy,
        requestedAt: nowIso,
      });
    }
    return picked;
  }

  public resolveTimeSlot(
    slot: SmartPlaylistTimeSlot = 'auto_now',
    timezoneOffsetMinutes = -210,
  ): {
    slot: Exclude<SmartPlaylistTimeSlot, 'auto_now'>;
    label: string;
    recommendedMoods: MusicMood[];
    hour: number;
  } {
    const nowLocal = new Date(Date.now() - timezoneOffsetMinutes * 60 * 1000);
    const hour = nowLocal.getUTCHours();

    let resolved: Exclude<SmartPlaylistTimeSlot, 'auto_now'>;
    if (slot !== 'auto_now') {
      resolved = slot;
    } else if (hour >= 6 && hour < 12) {
      resolved = 'morning';
    } else if (hour >= 12 && hour < 18) {
      resolved = 'afternoon';
    } else if (hour >= 18 && hour < 22) {
      resolved = 'evening';
    } else {
      resolved = 'night';
    }

    switch (resolved) {
      case 'morning':
        return {
          slot: 'morning',
          label: 'بازه صبحگاهی (۰۶:۰۰ تا ۱۲:۰۰)',
          recommendedMoods: ['شاد', 'پاپ', 'محلی و لری'],
          hour,
        };
      case 'afternoon':
        return {
          slot: 'afternoon',
          label: 'بازه عصرگاهی (۱۲:۰۰ تا ۱۸:۰۰)',
          recommendedMoods: ['پاپ', 'شاد', 'محلی و لری'],
          hour,
        };
      case 'evening':
        return {
          slot: 'evening',
          label: 'بازه غروب و دورهمی (۱۸:۰۰ تا ۲۲:۰۰)',
          recommendedMoods: ['پاپ', 'نوستالژی', 'سنتی'],
          hour,
        };
      case 'night':
      default:
        return {
          slot: 'night',
          label: 'بازه شبانه و آخر شب (۲۲:۰۰ تا ۰۶:۰۰)',
          recommendedMoods: ['آرام', 'غمگین', 'نوستالژی', 'سنتی'],
          hour,
        };
    }
  }

  public buildSmartMix(params: {
    moods: MusicMood[];
    totalCount: number;
    balanceMode: 'interleaved' | 'shuffled';
    requestedBy?: string;
    adaptMode?: SmartPlaylistAdaptMode;
    timeSlot?: SmartPlaylistTimeSlot;
    timezoneOffsetMinutes?: number;
    popularityEvents?: PlaybackAnalyticsEvent[];
    history?: Track[];
  }): {
    tracks: Track[];
    breakdown: Record<string, number>;
    adaptSummary: string;
    resolvedSlot?: string;
    effectiveMoods: MusicMood[];
  } {
    const adaptMode: SmartPlaylistAdaptMode = params.adaptMode || 'manual';
    const requestedBy =
      params.requestedBy ||
      (adaptMode === 'vc_popularity'
        ? 'محبوبیت ویسکال'
        : adaptMode === 'time_slot'
          ? 'تطبیق زمانی هوشمند'
          : 'پلی‌لیست هوشمند');

    const targetTotal = Math.min(80, Math.max(2, params.totalCount || 20));
    const nowIso = new Date().toISOString();

    if (adaptMode === 'vc_popularity') {
      const events = params.popularityEvents || [];
      const historyTracks = params.history || [];

      const trackCounts = new Map<string, number>();
      const titleArtistCounts = new Map<string, number>();
      const artistCounts = new Map<string, number>();
      const moodCounts = new Map<MusicMood, number>();
      const extraTracksByKey = new Map<string, Track>();

      for (const t of historyTracks) {
        if (!t.streamUrl) continue;
        const key = `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`;
        extraTracksByKey.set(key, t);
        titleArtistCounts.set(key, (titleArtistCounts.get(key) || 0) + 1);
        trackCounts.set(t.id, (trackCounts.get(t.id) || 0) + 1);
        artistCounts.set(t.artist.toLowerCase(), (artistCounts.get(t.artist.toLowerCase()) || 0) + 1);
        if (t.mood) {
          moodCounts.set(t.mood, (moodCounts.get(t.mood) || 0) + 1);
        }
      }

      for (const ev of events) {
        const key = `${ev.title.toLowerCase()}::${ev.artist.toLowerCase()}`;
        trackCounts.set(ev.trackId, (trackCounts.get(ev.trackId) || 0) + 2);
        titleArtistCounts.set(key, (titleArtistCounts.get(key) || 0) + 2);
        artistCounts.set(ev.artist.toLowerCase(), (artistCounts.get(ev.artist.toLowerCase()) || 0) + 2);
        if (ev.mood) {
          moodCounts.set(ev.mood, (moodCounts.get(ev.mood) || 0) + 2);
        }
      }

      const sortedMoods = Array.from(moodCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([m]) => m);

      const effectiveMoods: MusicMood[] =
        sortedMoods.length > 0
          ? sortedMoods.slice(0, 4)
          : params.moods.length > 0
            ? params.moods
            : ['پاپ', 'شاد'];

      const candidateMap = new Map<string, {track: Track; score: number}>();
      const scoreTrack = (t: Track): number => {
        const key = `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`;
        const directScore =
          (trackCounts.get(t.id) || 0) * 10 + (titleArtistCounts.get(key) || 0) * 6;
        const artistScore = (artistCounts.get(t.artist.toLowerCase()) || 0) * 3;
        const moodScore = t.mood ? (moodCounts.get(t.mood) || 0) * 1.5 : 0;
        const userMoodBoost = t.mood && effectiveMoods.includes(t.mood) ? 1 : 0;
        return directScore + artistScore + moodScore + userMoodBoost + Math.random() * 0.4;
      };

      for (const t of extraTracksByKey.values()) {
        const key = `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`;
        candidateMap.set(key, {track: t, score: scoreTrack(t)});
      }

      const catalogPool =
        params.moods.length > 0 && sortedMoods.length === 0
          ? this.tracks.filter((t) => !t.mood || params.moods.includes(t.mood))
          : this.tracks;

      for (const t of catalogPool) {
        const key = `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`;
        const existing = candidateMap.get(key);
        const s = scoreTrack(t);
        if (!existing || s > existing.score) {
          candidateMap.set(key, {track: t, score: s});
        }
      }

      let ranked = Array.from(candidateMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, targetTotal)
        .map((x) => ({
          ...x.track,
          requestedBy,
          requestedAt: nowIso,
        }));

      if (params.balanceMode === 'shuffled') {
        for (let i = ranked.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
        }
      }

      const breakdown: Record<string, number> = {};
      for (const t of ranked) {
        const m = t.mood || 'پاپ';
        breakdown[m] = (breakdown[m] || 0) + 1;
      }

      const totalSignals = events.length + historyTracks.length;
      const topArtists = Array.from(artistCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([a]) => a);

      const adaptSummary =
        totalSignals > 0
          ? `چیدمان خودکار بر اساس محبوبیت در ویسکال (${totalSignals} پخش ثبت‌شده${topArtists.length > 0 ? ` · هنرمندان پرطرفدار: ${topArtists.join('، ')}` : ''})`
          : 'چیدمان بر اساس محبوب‌ترین سبک‌های کاتالوگ (با ثبت پخش‌های ویسکال خودکار آپدیت می‌شود)';

      return {
        tracks: ranked,
        breakdown,
        adaptSummary,
        effectiveMoods,
      };
    }

    let resolvedSlotInfo:
      | ReturnType<MusicCatalogService['resolveTimeSlot']>
      | undefined;
    let activeMoods: MusicMood[];

    if (adaptMode === 'time_slot') {
      resolvedSlotInfo = this.resolveTimeSlot(
        params.timeSlot || 'auto_now',
        params.timezoneOffsetMinutes ?? -210,
      );
      const slotMoods = resolvedSlotInfo.recommendedMoods.filter((m) =>
        this.tracks.some((t) => t.mood === m),
      );
      activeMoods = slotMoods.length > 0 ? slotMoods : resolvedSlotInfo.recommendedMoods;
    } else {
      const validMoods = params.moods.filter((m) => this.tracks.some((t) => t.mood === m));
      activeMoods = validMoods.length > 0 ? validMoods : ['شاد', 'غمگین'];
    }

    const perMoodQuota = Math.ceil(targetTotal / activeMoods.length);
    const perMoodPicked: Record<string, Track[]> = {};
    const usedIds = new Set<string>();

    for (const mood of activeMoods) {
      const pool = this.tracks.filter((t) => t.mood === mood);
      const copy = [...pool];
      const chosen: Track[] = [];
      while (chosen.length < perMoodQuota && copy.length > 0) {
        const randIdx = Math.floor(Math.random() * copy.length);
        const [item] = copy.splice(randIdx, 1);
        if (usedIds.has(item.id)) continue;
        usedIds.add(item.id);
        chosen.push({
          ...item,
          requestedBy,
          requestedAt: nowIso,
        });
      }
      perMoodPicked[mood] = chosen;
    }

    const combined: Track[] = [];
    if (params.balanceMode === 'interleaved') {
      let round = 0;
      while (combined.length < targetTotal) {
        let pushedInRound = false;
        for (const mood of activeMoods) {
          const list = perMoodPicked[mood];
          if (round < list.length && combined.length < targetTotal) {
            combined.push(list[round]);
            pushedInRound = true;
          }
        }
        if (!pushedInRound) break;
        round++;
      }
    } else {
      for (const mood of activeMoods) {
        combined.push(...perMoodPicked[mood]);
      }
      // Fisher-Yates shuffle
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
    }

    const finalTracks = combined.slice(0, targetTotal);
    const breakdown: Record<string, number> = {};
    for (const t of finalTracks) {
      const m = t.mood || 'پاپ';
      breakdown[m] = (breakdown[m] || 0) + 1;
    }

    const adaptSummary = resolvedSlotInfo
      ? `تطبیق خودکار با ${resolvedSlotInfo.label} (سبک‌های متناسب: ${activeMoods.join('، ')})`
      : `ترکیب دستی سبک‌ها: ${activeMoods.join(' + ')}`;

    return {
      tracks: finalTracks,
      breakdown,
      adaptSummary,
      resolvedSlot: resolvedSlotInfo?.slot,
      effectiveMoods: activeMoods,
    };
  }
}

export const musicCatalog = new MusicCatalogService();

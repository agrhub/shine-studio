import { Logger } from '../utils/logger.js';
import { trendRadarAgent } from '../agents/TrendRadarAgent.js';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { TrendTopicOutput, ViralTrendItem, ViralTrendPaginationResult, LANGUAGE_NAMES } from '@/types.js';
import { getDatabaseProvider } from '@/database/index.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { loadSkill } from '@/utils/SkillLoader.js';

/**
 * Mapping of country names, aliases, and ISO codes to standard uppercase 2-letter ISO code.
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // Asia & Southeast Asia
  vn: 'VN', vietnam: 'VN', 'viet nam': 'VN', sea: 'VN',
  cn: 'CN', china: 'CN',
  tw: 'TW', taiwan: 'TW',
  hk: 'HK', 'hong kong': 'HK',
  jp: 'JP', japan: 'JP',
  kr: 'KR', korea: 'KR', 'south korea': 'KR',
  th: 'TH', thailand: 'TH',
  id: 'ID', indonesia: 'ID',
  my: 'MY', malaysia: 'MY',
  ph: 'PH', philippines: 'PH',
  in: 'IN', india: 'IN',
  sg: 'SG', singapore: 'SG',
  pk: 'PK', pakistan: 'PK',
  bd: 'BD', bangladesh: 'BD',

  // Europe
  gb: 'GB', uk: 'GB', 'united kingdom': 'GB', england: 'GB',
  fr: 'FR', france: 'FR',
  de: 'DE', germany: 'DE', deutschland: 'DE',
  es: 'ES', spain: 'ES', 'españa': 'ES',
  it: 'IT', italy: 'IT', italia: 'IT',
  pt: 'PT', portugal: 'PT',
  ru: 'RU', russia: 'RU',
  ua: 'UA', ukraine: 'UA',
  pl: 'PL', poland: 'PL',
  nl: 'NL', netherlands: 'NL',
  tr: 'TR', turkey: 'TR',

  // Americas
  us: 'US', usa: 'US', 'united states': 'US', global: 'US',
  ca: 'CA', canada: 'CA',
  mx: 'MX', mexico: 'MX', 'méxico': 'MX',
  br: 'BR', brazil: 'BR', brasil: 'BR',
  ar: 'AR', argentina: 'AR',
  co: 'CO', colombia: 'CO',
  cl: 'CL', chile: 'CL',
  pe: 'PE', peru: 'PE',

  // Middle East & Oceania
  sa: 'SA', 'saudi arabia': 'SA',
  ae: 'AE', uae: 'AE', 'united arab emirates': 'AE',
  au: 'AU', australia: 'AU',
  nz: 'NZ', 'new zealand': 'NZ',
};

/**
 * Native/primary language for popular markets.
 */
const POPULAR_MARKETS: Record<string, string> = {
  US: 'en',
  VN: 'vi',
  CN: 'zh',
  JP: 'ja',
  KR: 'ko',
  GB: 'en',
  FR: 'fr',
  DE: 'de',
  ES: 'es',
  BR: 'pt',
  MX: 'es',
  IN: 'hi',
  TW: 'zh',
  HK: 'zh',
  SG: 'en',
  MY: 'ms',
  TH: 'th',
  ID: 'id',
  PH: 'en',
  SA: 'ar',
  AE: 'ar',
  TR: 'tr',
  IT: 'it',
  PL: 'pl',
  NL: 'nl',
  RU: 'ru',
  UA: 'uk',
};

/** Cache TTL: 4 hours */
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/** Background refresh interval: every 4 hours */
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Max trends stored per market */
const MAX_TRENDS_PER_MARKET = 50;

export class ViralTrendService {
  private static instance: ViralTrendService;
  /** Keyed by `${countryCode}_${langCode}` e.g. "VN_vi", "US_vi", "JP_en" */
  private cache: Map<string, ViralTrendItem[]> = new Map();
  private lastUpdated: Map<string, Date> = new Map();
  private inProgress: Set<string> = new Set();

  private constructor() {
    // 1. Restore cached trends from MongoDB on startup
    this.loadFromDatabase().then(() => {
      // 2. Seed missing primary markets in background
      this.seedAllMarketsOnStartup();
    });

    // Schedule periodic background refresh
    setInterval(() => {
      this.refreshAllPopularMarketsInBackground().catch((err) =>
        Logger.warn(`[ViralTrendService] Background sweep error: ${err.message}`)
      );
    }, REFRESH_INTERVAL_MS);
  }

  public static getInstance(): ViralTrendService {
    if (!ViralTrendService.instance) {
      ViralTrendService.instance = new ViralTrendService();
    }
    return ViralTrendService.instance;
  }

  // ─── Database Persistence Helpers ──────────────────────────────────────────

  private async loadFromDatabase(): Promise<void> {
    try {
      const db = await getDatabaseProvider();
      const records = await db.getAllCachedViralTrends();
      if (Array.isArray(records) && records.length > 0) {
        for (const r of records) {
          if (r.cache_key && Array.isArray(r.items) && r.items.length > 0) {
            this.cache.set(r.cache_key, r.items);
            this.lastUpdated.set(r.cache_key, new Date(r.updated_at));
          }
        }
        Logger.info(`[ViralTrendService] Restored ${records.length} localized market caches from MongoDB.`);
      }
    } catch (err: any) {
      Logger.warn(`[ViralTrendService] Could not load caches from database: ${err.message}`);
    }
  }

  private async persistToDatabase(countryCode: string, langCode: string, items: ViralTrendItem[]): Promise<void> {
    try {
      const db = await getDatabaseProvider();
      await db.saveViralTrends(countryCode, langCode, items);
    } catch (err: any) {
      Logger.warn(`[ViralTrendService] DB persist failed for ${countryCode}_${langCode}: ${err.message}`);
    }
  }

  // ─── Normalization Helpers ──────────────────────────────────────────────────

  public normalizeCountryCode(countryStr?: string): string {
    if (!countryStr || typeof countryStr !== 'string') return 'US';
    const cleaned = countryStr.toLowerCase().trim();
    if (COUNTRY_NAME_TO_CODE[cleaned]) {
      return COUNTRY_NAME_TO_CODE[cleaned];
    }
    const upper = countryStr.trim().toUpperCase();
    if (upper.length === 2) return upper;
    return 'US';
  }

  public normalizeLangCode(langStr?: string): string {
    if (!langStr || typeof langStr !== 'string') return 'en';
    const cleaned = langStr.toLowerCase().trim();
    const primary = cleaned.split('-')[0].split('_')[0];
    if (primary === 'jp') return 'ja';
    if (primary === 'zh') return 'zh';
    if (primary === 'vi') return 'vi';
    if (primary === 'es') return 'es';
    if (primary === 'fr') return 'fr';
    if (primary === 'de') return 'de';
    if (primary === 'ja') return 'ja';
    if (primary === 'ko') return 'ko';
    if (primary === 'th') return 'th';
    if (primary === 'id') return 'id';
    if (primary === 'pt') return 'pt';
    if (primary === 'hi') return 'hi';
    if (primary === 'ar') return 'ar';
    if (primary === 'ru') return 'ru';
    if (primary === 'it') return 'it';
    return primary || 'en';
  }

  private getCacheKey(countryCode: string, langCode: string): string {
    return `${countryCode}_${langCode}`;
  }

  private isCacheStale(cacheKey: string): boolean {
    const updated = this.lastUpdated.get(cacheKey);
    if (!updated) return true;
    return Date.now() - updated.getTime() > CACHE_TTL_MS;
  }

  private formatItems(raw: TrendTopicOutput[], country: string, prefix = 'trend'): ViralTrendItem[] {
    return raw.map((it, idx) => ({
      ...it,
      id: it.id || `${prefix}_${country.toLowerCase()}_${Date.now()}_${idx}`,
      country,
      category: it.trope || it.genre || 'Drama',
      created_at: new Date().toISOString(),
    }));
  }

  private deduplicateAndCap(items: ViralTrendItem[]): ViralTrendItem[] {
    const seen = new Set<string>();
    const unique: ViralTrendItem[] = [];
    for (const item of items) {
      const key = (item.topic || '').toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    return unique.slice(0, MAX_TRENDS_PER_MARKET);
  }

  // ─── AI Translation & Localization Engine ───────────────────────────────────

  /**
   * Translates and culturally adapts an array of viral trend items to the target language.
   */
  public async translateTrends(items: ViralTrendItem[], targetLang: string, countryCode: string): Promise<ViralTrendItem[]> {
    if (!items || items.length === 0) return [];
    const languageName = LANGUAGE_NAMES[targetLang] || targetLang.toUpperCase();
    Logger.info(`[ViralTrendService] Translating ${items.length} trends (${countryCode}) into "${languageName}" (${targetLang})...`);

    const payload = items.map((it) => ({
      id: it.id,
      topic: it.topic,
      description: it.description,
      trope: it.trope,
      competitor_hook: it.competitor_hook,
      category: it.category || it.genre,
      genre: it.genre,
      hashtag_velocity: it.hashtag_velocity,
      engagement_score: it.engagement_score,
      country: it.country,
      target_episodes: it.target_episodes,
      duration_seconds: it.duration_seconds,
    }));

    const prompt = PromptLoader.render('trend/trend_translate', {
      languageName,
      targetLang,
      countryCode,
      inputJson: JSON.stringify(payload, null, 2),
    });

    const trendSkill = loadSkill('trend_radar');

    try {
      const rawText = await aiProviderRouter.generateText({
        prompt,
        systemInstruction: trendSkill,
        jsonMode: true,
      });

      if (!rawText || !rawText.trim()) {
        throw new Error('Empty response from translation model');
      }

      const parsed = JSON.parse(rawText);
      const list = Array.isArray(parsed) ? parsed : (parsed.topics || parsed.items || []);
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('Parsed translated JSON is not a valid non-empty array');
      }

      // Map back to full ViralTrendItem
      const translatedItems: ViralTrendItem[] = list.map((it: any, idx: number) => {
        const original = items[idx] || {};
        return {
          ...original,
          ...it,
          id: original.id || it.id,
          country: countryCode,
          category: it.category || it.genre || original.category,
          created_at: original.created_at || new Date().toISOString(),
        };
      });

      // Persist translated items to MongoDB
      this.persistToDatabase(countryCode, targetLang, translatedItems);

      return translatedItems;
    } catch (err: any) {
      Logger.warn(`[ViralTrendService] Translation to ${targetLang} failed: ${err.message}. Returning source items.`);
      return items;
    }
  }

  // ─── Startup Seed ───────────────────────────────────────────────────────────

  private async seedAllMarketsOnStartup(): Promise<void> {
    const primaryMarkets = ['VN', 'US', 'CN', 'JP', 'KR', 'GB', 'FR', 'DE', 'ES', 'BR', 'MX', 'IN'];
    Logger.info(`[ViralTrendService] Checking & seeding ${primaryMarkets.length} primary markets on startup...`);
    for (const country of primaryMarkets) {
      try {
        const nativeLang = POPULAR_MARKETS[country] || 'en';
        const nativeKey = this.getCacheKey(country, nativeLang);

        // Only fetch if not already loaded from DB
        if (!this.cache.has(nativeKey) || this.cache.get(nativeKey)!.length < 10) {
          await this.fetchAndStore(country, nativeLang);
        }

        // If nativeLang is not English, also ensure English translation exists
        if (nativeLang !== 'en') {
          const enKey = this.getCacheKey(country, 'en');
          if (!this.cache.has(enKey) || this.cache.get(enKey)!.length < 10) {
            const items = this.cache.get(nativeKey);
            if (items && items.length > 0) {
              const enItems = await this.translateTrends(items, 'en', country);
              this.cache.set(enKey, enItems);
              this.lastUpdated.set(enKey, new Date());
              this.persistToDatabase(country, 'en', enItems);
            }
          }
        }
        await new Promise((r) => setTimeout(r, 1200)); // 1.2s gap between requests
      } catch (err: any) {
        Logger.warn(`[ViralTrendService] Startup seed check failed for ${country}: ${err.message}`);
      }
    }
    Logger.info(`[ViralTrendService] Startup seed complete. ${this.cache.size} localized market caches active.`);
  }

  // ─── Core Fetch + Store ─────────────────────────────────────────────────────

  /**
   * Fetch live trends from TrendRadarAgent (AI + Parallel MCP) for a given country & language.
   */
  private async fetchAndStore(countryCode: string, langCode: string): Promise<ViralTrendItem[]> {
    const cleanCountry = this.normalizeCountryCode(countryCode);
    const cleanLang = this.normalizeLangCode(langCode);
    const cacheKey = this.getCacheKey(cleanCountry, cleanLang);

    // Prevent concurrent fetches for same key
    if (this.inProgress.has(cacheKey)) {
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          if (!this.inProgress.has(cacheKey)) {
            clearInterval(poll);
            resolve();
          }
        }, 200);
      });
      return this.cache.get(cacheKey) || [];
    }

    this.inProgress.add(cacheKey);
    Logger.info(`[ViralTrendService] Fetching live viral trends for market ${cleanCountry} in language "${cleanLang}"...`);

    try {
      const freshTopics = await trendRadarAgent.execute(cleanCountry, cleanLang);

      if (!Array.isArray(freshTopics) || freshTopics.length === 0) {
        throw new Error(`TrendRadarAgent returned no results for ${cleanCountry} in ${cleanLang}`);
      }

      const newItems = this.formatItems(freshTopics, cleanCountry);
      const existing = this.cache.get(cacheKey) || [];
      const merged = this.deduplicateAndCap([...newItems, ...existing]);

      this.cache.set(cacheKey, merged);
      this.lastUpdated.set(cacheKey, new Date());
      Logger.info(`[ViralTrendService] ${cacheKey}: successfully cached ${merged.length} trends in memory.`);

      // Persist to MongoDB
      this.persistToDatabase(cleanCountry, cleanLang, merged);

      return merged;
    } finally {
      this.inProgress.delete(cacheKey);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Refresh a single market manually in the requested language.
   */
  public async refreshMarket(country: string, lang: string = 'en'): Promise<ViralTrendItem[]> {
    const countryCode = this.normalizeCountryCode(country);
    const langCode = this.normalizeLangCode(lang);
    return this.fetchAndStore(countryCode, langCode);
  }

  /**
   * Background sweep: refresh all popular markets in sequence.
   */
  public async refreshAllPopularMarketsInBackground(): Promise<void> {
    Logger.info('[ViralTrendService] Starting background market sweep for all popular markets...');
    for (const [country, lang] of Object.entries(POPULAR_MARKETS)) {
      try {
        await this.fetchAndStore(country, lang);
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err: any) {
        Logger.warn(`[ViralTrendService] Sweep error for ${country}: ${err.message}`);
      }
    }
    Logger.info('[ViralTrendService] Background sweep complete.');
  }

  /**
   * Get viral trends with multi-language support, caching, database persistence, pagination, and filtering.
   * Flow:
   * 1. Check memory cache.
   * 2. If missing in memory, check MongoDB.
   * 3. If missing in MongoDB, translate from existing cached country data or live fetch 15-20 items.
   * 4. Save result to MongoDB and memory.
   */
  public async getTrends(params: {
    country?: string;
    lang?: string;
    page?: number;
    pageSize?: number;
    genre?: string;
    search?: string;
    forceRefresh?: boolean;
  }): Promise<ViralTrendPaginationResult> {
    const countryCode = this.normalizeCountryCode(params.country);
    const langCode = this.normalizeLangCode(params.lang);
    const cacheKey = this.getCacheKey(countryCode, langCode);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 8));

    let fromCache = false;

    if (!params.forceRefresh && this.cache.has(cacheKey) && !this.isCacheStale(cacheKey) && this.cache.get(cacheKey)!.length >= 10) {
      fromCache = true;
    } else if (params.forceRefresh) {
      await this.fetchAndStore(countryCode, langCode);
    } else {
      // Step A: Check MongoDB first
      const db = await getDatabaseProvider();
      const dbRecord = await db.getViralTrends(countryCode, langCode);
      if (dbRecord && Array.isArray(dbRecord.items) && dbRecord.items.length >= 10 && !this.isCacheStale(cacheKey)) {
        this.cache.set(cacheKey, dbRecord.items);
        this.lastUpdated.set(cacheKey, new Date(dbRecord.updated_at));
        fromCache = true;
      } else {
        // Step B: Check if we have cached trends for this country in ANY language
        let sourceItems: ViralTrendItem[] | null = null;
        for (const [k, items] of this.cache.entries()) {
          if (k.startsWith(`${countryCode}_`) && items.length >= 10) {
            sourceItems = items;
            break;
          }
        }

        if (sourceItems && sourceItems.length > 0) {
          // Fast Translation from existing cached source items
          const translated = await this.translateTrends(sourceItems, langCode, countryCode);
          this.cache.set(cacheKey, translated);
          this.lastUpdated.set(cacheKey, new Date());
          this.persistToDatabase(countryCode, langCode, translated);
        } else {
          // Live Fetch directly in requested language (generates 15-20 items)
          await this.fetchAndStore(countryCode, langCode);
        }
      }
    }

    let all = this.cache.get(cacheKey) || [];

    // Fallback: If still empty, fetch live
    if (all.length === 0) {
      all = await this.fetchAndStore(countryCode, langCode);
    }

    if (!all || all.length === 0) {
      throw new Error(`No viral trend data available for market "${countryCode}" in "${langCode}". Please retry.`);
    }

    // Filter by genre
    if (params.genre && params.genre !== 'All') {
      const gLower = params.genre.toLowerCase();
      all = all.filter(
        (it) =>
          (it.genre || '').toLowerCase().includes(gLower) ||
          (it.trope || '').toLowerCase().includes(gLower) ||
          (it.category || '').toLowerCase().includes(gLower)
      );
    }

    // Filter by search query
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      all = all.filter(
        (it) =>
          (it.topic || '').toLowerCase().includes(q) ||
          (it.description || '').toLowerCase().includes(q) ||
          (it.trope || '').toLowerCase().includes(q)
      );
    }

    const total = all.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const items = all.slice(startIndex, startIndex + pageSize);

    return {
      items,
      total,
      page,
      pageSize: pageSize,
      totalPages: totalPages,
      country: countryCode,
      updatedAt: (this.lastUpdated.get(cacheKey) || new Date()).toISOString(),
      fromCache: fromCache,
    };
  }

  /**
   * Check which markets and languages currently have valid cache.
   */
  public getCacheStatus(): Record<string, { cached: boolean; stale: boolean; count: number; updatedAt: string | null }> {
    const result: Record<string, { cached: boolean; stale: boolean; count: number; updatedAt: string | null }> = {};
    for (const [key, items] of this.cache.entries()) {
      const updatedAt = this.lastUpdated.get(key);
      result[key] = {
        cached: !!items && items.length > 0,
        stale: this.isCacheStale(key),
        count: items?.length ?? 0,
        updatedAt: updatedAt?.toISOString() ?? null,
      };
    }
    return result;
  }
}

export const viralTrendService = ViralTrendService.getInstance();

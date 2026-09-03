import axios from 'axios';
import { nanoid } from 'nanoid';
import { EnvConfig } from '@/config/env.js';
import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { Logger } from '@/utils/logger.js';
import { PromptLoader } from '@/utils/PromptLoader.js';

import { SfxCandidate } from '@/types.js';

const FLEXCLIP_SFX_JSON_URL = 'https://resource.flexclip.com/json/stock/audio/stock_audio-audioSoundEffect-1.json';
let flexclipStockCache: { timestamp: number; items: SfxCandidate[] } | null = null;

export class SfxService {
  /**
   * Get active API keys from MongoDB System Settings or EnvConfig
   */
  private static async getProviderKeys() {
    let freesoundKey = EnvConfig.freesound.apiKey;
    let pixabayKey = EnvConfig.pixabay.apiKey;
    let parallelKey = EnvConfig.parallel.apiKey;
    let freesoundEndpoint = EnvConfig.freesound.endpoint;
    let pixabayEndpoint = EnvConfig.pixabay.endpoint;
    let parallelEndpoint = EnvConfig.parallel.endpoint;

    try {
      const { SystemSettingModel } = await import('@/database/MongoDBProvider.js');
      const settings: any[] = await SystemSettingModel.find({
        key: { $in: ['freesound', 'pixabay', 'parallel'] }
      }).lean();

      for (const s of settings) {
        if (s.key === 'freesound' && s.value?.apiKey) freesoundKey = s.value.apiKey;
        if (s.key === 'pixabay' && s.value?.apiKey) pixabayKey = s.value.apiKey;
        if (s.key === 'parallel' && s.value?.apiKey) parallelKey = s.value.apiKey;

        if (s.key === 'freesound' && s.value?.endpoint) freesoundEndpoint = s.value.endpoint;
        if (s.key === 'pixabay' && s.value?.endpoint) pixabayEndpoint = s.value.endpoint;
        if (s.key === 'parallel' && s.value?.endpoint) parallelEndpoint = s.value.endpoint;
      }
    } catch {}

    return { freesoundKey, pixabayKey, parallelKey, freesoundEndpoint, pixabayEndpoint, parallelEndpoint };
  }

  /**
   * Extract 1-2 concise English audio keywords via AI
   */
  static async extractAudioKeywords(rawPrompt: string, genre?: string, visualStyle?: string): Promise<string> {
    const combined = `${rawPrompt || ''} ${genre || ''} ${visualStyle || ''}`.trim();
    if (!combined) return 'cinematic suspense';

    try {
      const prompt = PromptLoader.render('audio/sfx_keyword_extraction', { description: combined });
      const aiRes = await aiProviderRouter.generateText(prompt);
      const cleaned = (typeof aiRes === 'string' ? aiRes : (aiRes as any)?.text || '').replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
      if (cleaned && cleaned.length > 1) {
        return cleaned.split(/\s+/).slice(0, 2).join(' ');
      }
    } catch (err: any) {
      Logger.warn(`[SfxService] extractAudioKeywords fallback: ${err.message}`);
    }

    return combined.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).slice(0, 2).join(' ') || 'cinematic suspense';
  }

  /**
   * Provider 1: Freesound API Search
   */
  static async searchFreesound(query: string, apiKey: string, endpoint: string, durationMax: number = 20): Promise<SfxCandidate[]> {
    if (!apiKey) return [];
    const candidates: SfxCandidate[] = [];

    try {
      Logger.info(`[SfxService] Querying Freesound API for "${query}"`);
      const res = await axios.get(endpoint, {
        params: {
          query: query.trim(),
          token: apiKey,
          filter: `duration:[1.0 TO ${Math.max(15, durationMax)}]`,
          fields: 'id,name,previews,duration,tags,description',
          page_size: 6,
          sort: 'rating_desc',
        },
        timeout: 6000,
      });

      if (res.data?.results && Array.isArray(res.data.results)) {
        for (const item of res.data.results) {
          const previewUrl = item.previews?.['preview-hq-mp3'] || item.previews?.['preview-lq-mp3'] || item.previews?.['preview-hq-ogg'];
          if (previewUrl) {
            candidates.push({
              id: `freesound_${item.id}`,
              title: item.name || `${query} SFX`,
              url: previewUrl,
              duration: Math.round(Number(item.duration) || 6),
              tags: item.tags || [],
              provider: 'freesound',
            });
          }
        }
      }
      Logger.info(`[SfxService] Freesound returned ${candidates.length} candidates`);
    } catch (err: any) {
      Logger.warn(`[SfxService] Freesound API query error: ${err.response?.data || err.message}`);
    }

    return candidates;
  }

  /**
   * Provider 2: Pixabay API Search
   */
  static async searchPixabay(query: string, apiKey: string, endpoint: string): Promise<SfxCandidate[]> {
    if (!apiKey) return [];
    const candidates: SfxCandidate[] = [];

    try {
      Logger.info(`[SfxService] Querying Pixabay API for "${query}"`);
      const res = await axios.get(endpoint, {
        params: {
          key: apiKey,
          q: encodeURIComponent(query),
          safesearch: true,
          per_page: 5,
        },
        timeout: 4000,
      });

      if (res.data?.hits && Array.isArray(res.data.hits)) {
        for (const hit of res.data.hits) {
          const url = hit.audio || hit.preview_url || hit.videos?.medium?.url;
          if (url) {
            candidates.push({
              id: `pixabay_${hit.id}`,
              title: hit.tags || `${query} audio`,
              url,
              duration: hit.duration || 15,
              tags: (hit.tags || '').split(',').map((t: string) => t.trim().toLowerCase()),
              provider: 'pixabay',
            });
          }
        }
      }
      Logger.info(`[SfxService] Pixabay returned ${candidates.length} candidates`);
    } catch (err: any) {
      Logger.warn(`[SfxService] Pixabay API query error: ${err.message}`);
    }

    return candidates;
  }

  /**
   * Provider 3: FlexClip Stock Sound Effects JSON Catalog
   */
  static async searchFlexClipStock(query: string): Promise<SfxCandidate[]> {
    const now = Date.now();
    let allItems: SfxCandidate[] = [];

    if (flexclipStockCache && (now - flexclipStockCache.timestamp) < 24 * 60 * 60 * 1000) {
      allItems = flexclipStockCache.items;
    } else {
      try {
        Logger.info(`[SfxService] Fetching FlexClip Stock SFX catalog from ${FLEXCLIP_SFX_JSON_URL}`);
        const res = await axios.get(FLEXCLIP_SFX_JSON_URL, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });

        const categories = res.data?.category || [];
        for (const cat of categories) {
          const catName = cat.cateName || '';
          for (const it of (cat.data || [])) {
            if (it.preview_url) {
              allItems.push({
                id: `flexclip_${it.id || nanoid(6)}`,
                title: it.title || `${catName} SFX`,
                url: it.preview_url,
                duration: it.duration || 10,
                tags: [catName.toLowerCase(), ...(it.title ? it.title.toLowerCase().split(/\s+/) : [])],
                provider: 'flexclip',
              });
            }
          }
        }

        if (allItems.length > 0) {
          flexclipStockCache = { timestamp: now, items: allItems };
          Logger.info(`[SfxService] Cached ${allItems.length} FlexClip sound effects`);
        }
      } catch (err: any) {
        Logger.warn(`[SfxService] FlexClip stock load error: ${err.message}`);
        allItems = flexclipStockCache?.items || [];
      }
    }

    if (allItems.length === 0) return [];

    const tokens = query.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 1);
    if (tokens.length === 0) return allItems.slice(0, 8);

    const scored = allItems.map(item => {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const tagsJoined = (item.tags || []).join(' ').toLowerCase();

      for (const token of tokens) {
        if (titleLower.includes(token)) score += 10;
        if (tagsJoined.includes(token)) score += 5;
      }

      return { item, score };
    });

    const matched = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);

    Logger.info(`[SfxService] FlexClip SFX search for "${query}" found ${matched.length} matches`);
    return matched;
  }

  /**
   * Provider 4: Parallel AI / Web Search MCP Fallback
   */
  static async searchParallelMcp(query: string, apiKey: string, endpoint: string): Promise<SfxCandidate[]> {
    if (!apiKey) return [];
    const candidates: SfxCandidate[] = [];

    try {
      Logger.info(`[SfxService] Querying Parallel MCP task for sound effects: "${query}"`);
      const res = await axios.post(endpoint,
        {
          task: `Find direct MP3/WAV royalty-free sound effect audio preview URL for keyword: ${query}`,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 6000,
        }
      );

      const audioUrl = res.data?.audio_url || res.data?.preview_url || res.data?.url;
      if (audioUrl && typeof audioUrl === 'string' && audioUrl.startsWith('http')) {
        candidates.push({
          id: `parallel_${nanoid(6)}`,
          title: `${query} SFX (Parallel AI)`,
          url: audioUrl,
          duration: 10,
          provider: 'parallel',
        });
      }
    } catch (err: any) {
      Logger.warn(`[SfxService] Parallel MCP search fallback: ${err.message}`);
    }

    return candidates;
  }

  /**
   * Download remote audio stream into Buffer with provider-tailored browser headers
   */
  static async downloadAudioBuffer(url: string, provider?: string): Promise<Buffer | null> {
    try {
      let headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Range': 'bytes=0-',
      };

      if (provider === 'pixabay' || url.includes('pixabay.com')) {
        headers = {
          ...headers,
          'Origin': 'https://pixabay.com',
          'Referer': 'https://pixabay.com/',
          'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'audio',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
        };
      } else if (provider === 'freesound' || url.includes('freesound.org')) {
        headers = {
          ...headers,
          'Referer': 'https://freesound.org/',
          'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'audio',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'same-site',
        };
      } else if (provider === 'flexclip' || url.includes('cloudfront.net') || url.includes('flexclip.com')) {
        headers = {
          ...headers,
          'Referer': 'https://www.flexclip.com/',
          'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'audio',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Storage-Access': 'active',
        };
      }

      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers,
        timeout: 10000,
      });

      if ((res.status === 200 || res.status === 206) && res.data && res.data.length > 500) {
        return Buffer.from(res.data);
      }
    } catch (err: any) {
      Logger.warn(`[SfxService] Audio download failed (${url}): ${err.message}`);
    }
    return null;
  }

  /**
   * Main unified entry point: Searches all configured providers in waterfall order,
   * uploads valid audio to S3, and returns the internal endpoint URL.
   */
  static async getSceneAudio(options: {
    prompt: string;
    genre?: string;
    visualStyle?: string;
    duration?: number;
  }): Promise<{ audioUrl: string; s3Key: string; sizeBytes: number; title: string; duration: number; provider: string }> {
    const durationSeconds = options.duration || 8;
    const keywords = await this.extractAudioKeywords(options.prompt, options.genre, options.visualStyle);
    const { freesoundKey, pixabayKey, parallelKey, freesoundEndpoint, pixabayEndpoint, parallelEndpoint } = await this.getProviderKeys();

    const allCandidates: SfxCandidate[] = [];

    // 1. Check Freesound API (Primary SFX database if configured)
    if (freesoundKey) {
      const fsCandidates = await this.searchFreesound(keywords, freesoundKey, freesoundEndpoint, durationSeconds);
      allCandidates.push(...fsCandidates);
    }

    // 2. Check Pixabay API (if configured)
    if (pixabayKey && allCandidates.length === 0) {
      const pbCandidates = await this.searchPixabay(keywords, pixabayKey, pixabayEndpoint);
      allCandidates.push(...pbCandidates);
    }

    // 3. Fallback to FlexClip Stock SFX Catalog
    if (allCandidates.length === 0) {
      Logger.info(`[SfxService] Searching FlexClip Stock SFX catalog for "${keywords}"`);
      const fcCandidates = await this.searchFlexClipStock(keywords);
      allCandidates.push(...fcCandidates);
    }

    // 4. Fallback to Parallel AI / MCP
    if (allCandidates.length === 0 && parallelKey) {
      Logger.info(`[SfxService] Searching Parallel MCP for "${keywords}"`);
      const parCandidates = await this.searchParallelMcp(keywords, parallelKey, parallelEndpoint);
      allCandidates.push(...parCandidates);
    }

    // Iterate through candidates and download
    let downloadedBuffer: Buffer | null = null;
    let chosenCandidate: SfxCandidate | null = null;
    let fileExt = 'mp3';
    let fileMime = 'audio/mpeg';

    for (const cand of allCandidates) {
      Logger.info(`[SfxService] Attempting download from [${cand.provider}] ${cand.title}: ${cand.url}`);
      const buf = await this.downloadAudioBuffer(cand.url, cand.provider);
      if (buf && buf.length > 1000) {
        downloadedBuffer = buf;
        chosenCandidate = cand;
        fileExt = cand.url.includes('.ogg') ? 'ogg' : cand.url.includes('.wav') ? 'wav' : 'mp3';
        fileMime = fileExt === 'ogg' ? 'audio/ogg' : fileExt === 'wav' ? 'audio/wav' : 'audio/mpeg';
        break;
      }
    }

    // If no candidate downloaded successfully
    if (!downloadedBuffer || !chosenCandidate) {
      Logger.error(`[SfxService] No sound effect found for keywords: "${keywords}" across all providers`);
      throw new Error(`No sound effect found for keywords: "${keywords}"`);
    }

    // Upload directly to S3 / Local Storage via StorageFactory
    const s3Key = `assets/music/${nanoid(10)}.${fileExt}`;
    const adapter = await StorageFactory.getActiveAdapter();
    await adapter.uploadFile(s3Key, downloadedBuffer, fileMime);

    const internalUrl = `/api/assets/file/${s3Key}`;
    const providerLabels: Record<string, string> = {
      freesound: 'Freesound.org',
      pixabay: 'Pixabay Audio',
      flexclip: 'FlexClip Stock SFX',
      parallel: 'Parallel AI',
    };

    const displayProvider = providerLabels[chosenCandidate.provider] || 'Sound Effects Engine';
    Logger.info(`[SfxService] Successfully ingested [${displayProvider}] SFX to S3: ${s3Key} (${downloadedBuffer.length} bytes)`);

    return {
      audioUrl: internalUrl,
      s3Key,
      sizeBytes: downloadedBuffer.length,
      title: chosenCandidate.title,
      duration: durationSeconds,
      provider: displayProvider,
    };
  }
}

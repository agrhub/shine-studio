import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { mcpClient } from '../integrations/mcp/ParallelMCPClient.js';
import { loadSkill } from '../utils/SkillLoader.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { Logger } from '../utils/logger.js';

import { TrendTopicOutput, LANGUAGE_NAMES, MAX_TRENDS } from '../types.js';

export class TrendRadarAgent {
  async execute(region: string = 'US', lang: string = 'en'): Promise<TrendTopicOutput[]> {
    const cleanRegion = region.trim().toUpperCase() || 'US';
    const cleanLang = (lang || 'en').trim().toLowerCase();
    const languageName = LANGUAGE_NAMES[cleanLang] || LANGUAGE_NAMES[cleanLang.split('-')[0]] || 'English';

    let mcpItems: TrendTopicOutput[] = [];
    try {
      Logger.info(`[TrendRadarAgent] Attempting real-time scan via Parallel MCP for region: ${cleanRegion}, language: ${languageName}...`);
      const mcpTopics = await mcpClient.scanViralTrends(cleanRegion, cleanLang);

      if (Array.isArray(mcpTopics) && mcpTopics.length > 0) {
        Logger.info(`[TrendRadarAgent] Retrieved ${mcpTopics.length} viral trends from Parallel MCP.`);
        mcpItems = mcpTopics.map((item: any, idx: number) => ({
          id: item.id || `${cleanRegion.toLowerCase()}_${idx + 1}`,
          topic: item.title || item.topic || `Viral Trend ${idx + 1}`,
          description: item.description || `Trending micro-drama trope: ${(item.tropes || []).join(', ') || 'High-stakes conflict'}`,
          genre: item.genre || 'revenge',
          trope: (Array.isArray(item.tropes) && item.tropes[0]) || item.trope || 'High-Converting Trope',
          hashtag_velocity: item.hashtagVelocity || `+${item.viralScore ? item.viralScore * 5 : 480}% (TikTok/Reels/Shorts)`,
          competitor_hook: item.competitorHook || `3-second opening hook for ${item.title || item.topic || 'story'}`,
          country: item.region || cleanRegion,
          engagement_score: item.viralScore || item.engagementScore || (98 - idx * 2),
        }));

        if (mcpItems.length >= 15) {
          return mcpItems;
        }
      }
    } catch (mcpError: any) {
      Logger.warn(`[TrendRadarAgent] Parallel MCP scan unavailable (${mcpError.message}). Falling back to Gemini AI + Trend Radar Skill.`);
    }

    // 2. Gemini AI + trend_radar.md Skill (Guarantees full set of 15-20 localized drama topics)
    const aiItems = await this.executeGeminiLocalized(cleanRegion, cleanLang);

    // Merge MCP items and AI items without duplicates
    const seen = new Set<string>();
    const combined: TrendTopicOutput[] = [];
    for (const item of [...mcpItems, ...aiItems]) {
      const key = (item.topic || '').toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(item);
      }
    }
    return combined.slice(0, 25);
  }

  private async executeGeminiLocalized(region: string, lang: string): Promise<TrendTopicOutput[]> {
    const trendSkill = loadSkill('trend_radar');
    if (!trendSkill) {
      throw new Error('Trend Radar skill definition "trend_radar.md" could not be loaded.');
    }
    const cleanRegion = region.trim().toUpperCase() || 'US';
    const languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES[lang.split('-')[0]] || 'English';
    Logger.info(`[TrendRadarAgent] Running Gemini AI trend scan with trend_radar skill for region: ${region}, language: ${languageName}`);

    const prompt = PromptLoader.render('trend/trend_radar_scan', {
      region: cleanRegion,
      languageName,
      lang,
	    maxTrends: MAX_TRENDS
    });

    const rawText = await aiProviderRouter.generateText({
      prompt,
      systemInstruction: trendSkill,
      jsonMode: true,
    });

    if (!rawText || !rawText.trim()) {
      throw new Error(`Trend Radar AI returned an empty response for region: ${cleanRegion}`);
    }

    try {
      const parsed = JSON.parse(rawText);
      const list = Array.isArray(parsed) ? parsed : parsed.topics || [];
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('Parsed Trend Radar JSON is not a valid non-empty array.');
      }
      return list;
    } catch (parseErr: any) {
      throw new Error(`Failed to parse Trend Radar response as JSON: ${parseErr.message}\nRaw Text: ${rawText.slice(0, 200)}...`);
    }
  }
}

export const trendRadarAgent = new TrendRadarAgent();

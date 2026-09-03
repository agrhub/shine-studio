import { geminiClient } from '../integrations/ai/gemini/GeminiClient.js';
import { EpisodeSkeleton, MasterPlanOutput, RefinePlanInput, RefinePlanOutput } from '@/types.js';
import { storySkeletonAgent } from './StorySkeletonAgent.js';
import { loadSkill } from '../utils/SkillLoader.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { Logger } from '../utils/logger.js';
import { getLanguageForCountry } from '../utils/LanguageMapping.js';

export class MasterPlanRefineAgent {
  async execute(input: RefinePlanInput): Promise<RefinePlanOutput> {
    const { currentPlan, userInstruction } = input;
    if (!currentPlan || !userInstruction) {
      throw new Error('currentPlan and userInstruction are required parameters.');
    }

    const refineSkill = loadSkill('script_refine_master_plan');
    if (!refineSkill) {
      throw new Error('Script Refine Master Plan skill definition "script_refine_master_plan.md" could not be loaded.');
    }

    const country = currentPlan.country || 'United States';
    const langInfo = currentPlan.language ? getLanguageForCountry(currentPlan.language) : getLanguageForCountry(country);

    Logger.info(`[MasterPlanRefineAgent] Refining master plan for setting "${country}" in script language "${langInfo.name}": "${userInstruction}"`);

    const prompt = PromptLoader.render('screenplay/master_plan_refine', {
      userInstruction,
      country,
      languageName: langInfo.name,
      languageNativeName: langInfo.nativeName,
      languageInstruction: langInfo.promptInstruction,
      currentPlanJson: JSON.stringify(currentPlan, null, 2),
    });

    const rawText = await geminiClient.generateText({
      prompt,
      systemInstruction: `${refineSkill}\n\nCRITICAL LANGUAGE DIRECTIVE: ${langInfo.promptInstruction}`,
      jsonMode: true,
    });

    if (!rawText || !rawText.trim()) {
      throw new Error('Gemini model returned empty response for refining master plan.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr: any) {
      throw new Error(`Failed to parse Refine Master Plan response as JSON: ${parseErr.message}\nRaw Text: ${rawText.slice(0, 200)}...`);
    }

    const updatedPlan: MasterPlanOutput = parsed.updatedPlan || parsed.updated_plan || parsed;
    const targetEpisodes = Number(updatedPlan.total_episodes) || Number(currentPlan.total_episodes || currentPlan.totalEpisodes) || 24;
    const durationSecs = Number(updatedPlan.total_duration_seconds) || Number(currentPlan.total_duration_seconds || currentPlan.totalDurationSeconds) || 90;
    
    updatedPlan.total_episodes = targetEpisodes;
    updatedPlan.total_duration_seconds = durationSecs;
    updatedPlan.country = country;
    updatedPlan.language = langInfo.name;
    updatedPlan.visual_style = currentPlan.visual_style || currentPlan.visualStyle || updatedPlan.visual_style || 'realistic';
    updatedPlan.visual_style_prompt = currentPlan.visual_style_prompt || currentPlan.visualStylePrompt || updatedPlan.visual_style_prompt || '';
    updatedPlan.ratio = currentPlan.ratio || updatedPlan.ratio || '9:16';

    if (!updatedPlan.series_id) {
      updatedPlan.series_id = currentPlan.series_id || currentPlan.seriesId || `series_${Date.now()}`;
    }

    // Step 2: Automatic Chunk Mode Expansion for Large Episode Counts
    const returnedEpisodes = updatedPlan.episodes || [];
    if (returnedEpisodes.length < targetEpisodes) {
      Logger.info(`[MasterPlanRefineAgent] Target episodes (${targetEpisodes}) exceeds returned episodes (${returnedEpisodes.length}). Auto-expanding with Chunk Mode...`);
      const skillInstruction = loadSkill('script_skeleton') || refineSkill;
      const allEpisodes = await storySkeletonAgent.generateEpisodesInChunks(
        updatedPlan,
        targetEpisodes,
        returnedEpisodes,
        skillInstruction,
        langInfo.promptInstruction,
        country
      );
      updatedPlan.episodes = allEpisodes;
    } else if (returnedEpisodes.length > targetEpisodes) {
      updatedPlan.episodes = returnedEpisodes.slice(0, targetEpisodes);
    } else {
      updatedPlan.episodes = returnedEpisodes;
    }

    const durationDisplay = `${durationSecs}s (${Math.floor(durationSecs / 60)}m ${durationSecs % 60 ? `${durationSecs % 60}s` : ''}`.trim() + ')';

    return {
      updatedPlan,
      explanation: parsed.explanation || `Master plan successfully refined to ${targetEpisodes} episodes (${durationDisplay}/ep).`,
    };
  }
}

export const masterPlanRefineAgent = new MasterPlanRefineAgent();

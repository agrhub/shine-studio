import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import { storySkeletonAgent } from '@/agents/StorySkeletonAgent.js';
import { scriptAgent } from '@/agents/ScriptAgent.js';
import { supervisionAgent } from '@/agents/SupervisionAgent.js';
import { characterService } from '@/services/CharacterService.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { executeWithRetry, withCreditDeduction, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';

export class MasterPlanToolExecutors {
  /**
   * Generate initial Master Plan (Story Core, Synopsis, Characters, Episode Outlines)
   */
  static async generateMasterPlan(params: {
    userId: string;
    seriesId: string;
    title?: string;
    synopsis?: string;
    genre?: string;
    totalEpisodes?: number;
    durationSeconds?: number;
    visualStyle?: string;
    country?: string;
    language?: string;
  }): Promise<ToolExecutionResult> {
    try {
      const title = params.title;
      const synopsis = params.synopsis;
      const genre = params.genre;
      const totalEpisodes = params.totalEpisodes;
      const durationSeconds = params.durationSeconds;
      const visualStyle = params.visualStyle;
      const country = params.country;
      const language = params.language;
      if (!title) {
        return { success: false, message: `Series title is required` };
      }
      if (!synopsis) {
        return { success: false, message: `Series synopsis is required` };
      }
      if(!genre){
        return { success: false, message: `Series genre is required` };
      }
      if(!totalEpisodes){
        return { success: false, message: `Series total episodes is required` };
      }
      if(!durationSeconds){
        return { success: false, message: `Series duration is required` };
      }
      if(!visualStyle){
        return { success: false, message: `Series visual style is required` };
      }
      if(!country){
        return { success: false, message: `Series target country is required` };
      }
      if(!language){
        return { success: false, message: `Series language is required` };
      }

      const { result } = await executeWithRetry('Generate Master Plan', async () => {
        return await withCreditDeduction(params.userId, 'scriptGeneration', 'Master Plan Generation', `Generated series master plan for "${title}"`, async () => {
          return await storySkeletonAgent.execute({
            title,
            synopsis,
            genre,
            total_episodes: totalEpisodes,
            episode_duration_seconds: durationSeconds,
            visual_style: visualStyle,
            country,
            language,
          });
        });
      });

      const rawPlan = result as any;
      const normalizedChars = Array.isArray(rawPlan.characters)
        ? rawPlan.characters.map((c: any) => EntityNormalizer.normalizeCharacter(c))
        : [];

      const masterPlanData = {
        ...rawPlan,
        series_id: params.seriesId,
        characters: normalizedChars,
      };
      
      const ctx = getActiveChatContext();
      if (ctx?.contextData) {
        ctx.contextData.currentPlan = masterPlanData;
        ctx.contextData.masterPlan = masterPlanData;
        if (ctx.contextData.session) {
          ctx.contextData.session.currentPlan = masterPlanData;
          ctx.contextData.session.masterPlan = masterPlanData;
        }
      }

      return {
        success: true,
        message: `Successfully generated Master Plan for "${masterPlanData.title}" (${normalizedChars.length} characters, ${rawPlan.episodes?.length || totalEpisodes} episodes).`,
        data: { series_id: params.seriesId, master_plan: masterPlanData },
      };
    } catch (err: any) {
      Logger.error(`[MasterPlanTools] Failed to generate master plan: ${err.message}`);
      return { success: false, message: `Failed to generate master plan: ${err.message}`, error: err.message };
    }
  }

  /**
   * Generate detailed episode screenplay with scenes, shots, dialogues, and visual prompts
   */
  static async generateEpisodeScreenplay(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    episodeNumber?: number;
    synopsisOverride?: string;
    forceRegenerate?: boolean;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      if (!params.forceRegenerate && episode.scenes && episode.scenes.length > 0) {
        return {
          success: true,
          message: `Episode #${episode.episode_number || 1} already has ${episode.scenes.length} scene(s) generated.`,
          data: { episode_id: params.episodeId, scenes: episode.scenes },
        };
      }

      const allChars = await characterService.listCharacters(params.seriesId);
      const epNum = params.episodeNumber || episode.episode_number || 1;

      const { result } = await executeWithRetry(`Generate Screenplay for Episode #${epNum}`, async () => {
        return await withCreditDeduction(params.userId, 'scriptGeneration', 'Episode Screenplay Generation', `Generated screenplay for Episode #${epNum}`, async () => {
          return await scriptAgent.execute({
            series_id: params.seriesId,
            episode_number: epNum,
            title: episode.title,
            genre: series.genre,
            visual_style: series.visual_style,
            visual_style_prompt: series.visual_style_prompt,
            synopsis: params.synopsisOverride || episode.synopsis || series.synopsis,
            scene_core: episode.scene_core,
            conflict_escalation: episode.conflict_escalation,
            cliffhanger_hook: episode.cliffhanger_hook,
            characters: allChars,
            locations: series.locations,
            props: series.props,
            country: series.country,
          });
        });
      });

      const scriptOutput = result as any;
      const rawScenes = Array.isArray(scriptOutput.scenes) ? scriptOutput.scenes : [];
      const normalizedScenes = rawScenes.map((s: any, idx: number) => EntityNormalizer.normalizeScene(s, idx + 1));

      const updatedLocations = Array.isArray(scriptOutput.locations)
        ? scriptOutput.locations.map((l: any) => EntityNormalizer.normalizeLocation(l))
        : [];
      const updatedProps = Array.isArray(scriptOutput.props)
        ? scriptOutput.props.map((p: any) => EntityNormalizer.normalizeProp(p))
        : [];

      await db.updateEpisode(params.episodeId, {
        scenes: normalizedScenes,
        reference_assets: {
          character_ids: allChars.map(c => c.id),
          location_ids: updatedLocations.map((l: any) => l.id),
          prop_ids: updatedProps.map((p: any) => p.id),
        },
        status: 'SCRIPT' as any,
      });

      return {
        success: true,
        message: `Successfully generated screenplay for Episode #${epNum} "${episode.title}" (${normalizedScenes.length} scenes, ${updatedLocations.length} locations, ${updatedProps.length} props).`,
        data: { episode_id: params.episodeId, scenes: normalizedScenes, locations: updatedLocations, props: updatedProps },
      };
    } catch (err: any) {
      Logger.error(`[MasterPlanTools] Failed to generate screenplay: ${err.message}`);
      return { success: false, message: `Failed to generate screenplay: ${err.message}`, error: err.message };
    }
  }

  /**
   * Create and persist finalized Series, initial episodes, and master plan to the database
   */
  static async createSeries(params: {
    userId: string;
    totalEpisodes: number;
    masterPlan?: any;
  }): Promise<ToolExecutionResult> {
    try {
      const { SeriesService } = await import('@/services/SeriesService.js');
      const ctx = getActiveChatContext();
      const contextData = ctx?.contextData;

      let masterPlanObj = params.masterPlan || contextData?.currentPlan || contextData?.masterPlan || contextData?.session?.currentPlan || contextData?.session?.masterPlan;
      if (typeof masterPlanObj === 'string') {
        try {
          masterPlanObj = JSON.parse(masterPlanObj);
        } catch {}
      }

      const finalTitle = contextData?.title || masterPlanObj?.title;
      const finalGenre = contextData?.genre || masterPlanObj?.genre;
      const finalSynopsis = contextData?.synopsis || masterPlanObj?.synopsis || masterPlanObj?.storyCore?.coreAttraction || masterPlanObj?.story_core?.core_attraction || 'New dramatic micro-drama series';
      const finalCountry = contextData?.country || masterPlanObj?.country || 'United States';
      const finalLanguage = contextData?.language || masterPlanObj?.language || 'en-US';
      const finalStyle = contextData?.visualStyle || masterPlanObj?.visual_style || masterPlanObj?.visualStyle || 'realistic';
      const finalStylePrompt = contextData?.visualStylePrompt || masterPlanObj?.visual_style_prompt || masterPlanObj?.visualStylePrompt || '';
      const finalRatio = contextData?.ratio || masterPlanObj?.ratio || '9:16';
      const finalEpisodeCount = Number(contextData?.targetEpisodes) || Number(masterPlanObj?.total_episodes) || Number(masterPlanObj?.totalEpisodes) || (Array.isArray(masterPlanObj?.episodes) && masterPlanObj.episodes.length > 0 ? masterPlanObj.episodes.length : 24);
      if (!masterPlanObj) {
        return {
          success: false,
          message: 'Cannot create series: Master plan has not been generated yet. Please ask the AI to generate the Master Plan first.',
          error: 'Master plan is missing',
        }
      }

      const availableEps = Array.isArray(masterPlanObj.episodes) ? masterPlanObj.episodes.length : 0;
      if (availableEps < finalEpisodeCount) {
        return {
          success: false,
          message: `Cannot create series: Master plan is incomplete (${availableEps}/${finalEpisodeCount} episodes). All ${finalEpisodeCount} episodes must be generated before creating the series.`,
          error: `Master plan is incomplete: only ${availableEps}/${finalEpisodeCount} episodes present`,
        };
      }

      const result = await SeriesService.createSeries({
        user_id: params.userId,
        title: finalTitle,
        genre: finalGenre,
        synopsis: finalSynopsis,
        visual_style: finalStyle,
        visual_style_prompt: finalStylePrompt,
        country: finalCountry,
        language: finalLanguage,
        ratio: finalRatio,
        episode_count: finalEpisodeCount,
        master_plan: masterPlanObj,
        characters: masterPlanObj.characters,
        locations: masterPlanObj.locations,
        props: masterPlanObj.props,
      });

      return {
        success: true,
        message: `Successfully created Series "${result.series.title}" (ID: ${result.series.id}) with ${result.episodes.length} episodes initialized.`,
        data: {
          id: result.series.id,
          series_id: result.series.id,
          series: result.series,
          episodes: result.episodes,
        },
      };
    } catch (err: any) {
      Logger.error(`[MasterPlanTools] Failed to create series: ${err.message}`, err);
      return { success: false, message: `Failed to create series: ${err.message}`, error: err.message };
    }
  }
}

export function createMasterPlanTools(context?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'generate_master_plan',
      description: 'Generate complete series master plan including story core, character bios, and episode arcs.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Title of the series' },
          synopsis: { type: Type.STRING, description: 'Synopsis of the series' },
          genre: { type: Type.STRING, description: 'Series genre (e.g. CEO Revenge, Romantic Drama)' },
          total_episodes: { type: Type.NUMBER, description: 'Total episodes count (e.g. 10)' },
          visual_style: { type: Type.STRING, description: 'Art/visual style preset' },
          country: { type: Type.STRING, description: 'Country of the series' },
          language: { type: Type.STRING, description: 'Language of the series' },
        },
      },
      execute: async (args: any) => {
        const ctx = getActiveChatContext();
        const userId = args.userId || args.user_id || context?.userId || ctx?.userId;
        const seriesId = args.series_id || args.seriesId || context?.seriesId || ctx?.seriesId;
        const onItemUpdated = context?.onItemUpdated || ctx?.onItemUpdated;

        if (!userId) {
          return { success: false, message: 'User ID is required' };
        }
        const res = await MasterPlanToolExecutors.generateMasterPlan({
          userId,
          seriesId: seriesId || `series_${Date.now()}`,
          title: args.title,
          synopsis: args.synopsis,
          genre: args.genre,
          totalEpisodes: args.total_episodes || args.totalEpisodes,
          durationSeconds: args.duration_seconds || args.durationSeconds,
          visualStyle: args.visual_style || args.visualStyle,
          country: args.country,
          language: args.language,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'master_plan_generated', data: res.data });
        }
        return res;
      },
    }),

    new FunctionTool({
      name: 'verify_compliance',
      description: 'Audit the master plan against platform safety, copyright, and regional cultural sensitivities.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          country: { type: Type.STRING, description: 'Optional target country override' },
          ratio: { type: Type.STRING, description: 'Optional aspect ratio override' },
        },
      },
      execute: async (args: any) => {
        const ctx = getActiveChatContext();
        const contextData = context?.contextData || ctx?.contextData;
        const onItemUpdated = context?.onItemUpdated || ctx?.onItemUpdated;
        const plan = contextData?.currentPlan || contextData?.masterPlan;
        const country = args.country || plan?.country || contextData?.country || 'United States';
        const ratio = args.ratio || plan?.ratio || contextData?.ratio || '9:16';

        const result = await supervisionAgent.verifyMasterPlanCompliance({
          masterPlan: plan || { title: contextData?.title || 'Series' },
          country,
          ratio,
        });

        onItemUpdated?.({ type: 'compliance_verified', data: result });
        return {
          success: true,
          score: result.overall_score,
          status: result.is_compliant ? 'PASSED' : 'FLAGGED',
          message: `Master plan scored ${result.overall_score}% compliance in ${country}.`,
          complianceResult: result,
        };
      },
    }),

    new FunctionTool({
      name: 'create_series',
      description: 'Create and persist the finalized series into the database. Master plan and project context are automatically loaded from current session. After successful creation, IMMEDIATELY delegate to screenplay_writer_agent to generate the detailed shot-by-shot screenplay for Episode 1.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Optional series title override' },
          genre: { type: Type.STRING, description: 'Optional series genre override' },
          synopsis: { type: Type.STRING, description: 'Optional synopsis override' },
        },
      },
      execute: async (args: any) => {
        const ctx = getActiveChatContext();
        const userId = args.userId || args.user_id || context?.userId || ctx?.userId;
        const onItemUpdated = context?.onItemUpdated || ctx?.onItemUpdated;
        const contextData = context?.contextData || ctx?.contextData;

        if (!userId) {
          return { success: false, message: 'User ID is required' };
        }

        const res = await MasterPlanToolExecutors.createSeries({
          userId,
          totalEpisodes: args.total_episodes || args.totalEpisodes || contextData?.targetEpisodes,
          masterPlan: args.master_plan || args.masterPlan || contextData?.currentPlan || contextData?.masterPlan,
        });

        if (res.success && res.data) {
          const ep1 = Array.isArray(res.data.episodes) ? res.data.episodes[0] : null;
          onItemUpdated?.({ type: 'series_created', data: res.data });
          return {
            ...res,
            message: res.message,
            data: {
              ...res.data,
              next_action: 'GENERATE_EP1_SCREENPLAY',
              next_action_hint: ep1
                ? `Series created successfully. NOW delegate to screenplay_writer_agent with series_id="${res.data.series_id}" and episode_id="${ep1.id}" to write the detailed shot-by-shot screenplay for Episode 1 "${ep1.title}". Do NOT skip this step.`
                : 'Series created. Ask screenplay_writer_agent to generate Episode 1 screenplay.',
              ep1_episode_id: ep1?.id,
              ep1_title: ep1?.title,
            },
          };
        }
        return res;
      },
    }),

    new FunctionTool({
      name: 'generate_episode_screenplay',
      description: 'Generate multi-scene screenplay with shot breakdowns and dialogues for an episode.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          episode_number: { type: Type.NUMBER, description: 'Optional episode number override' },
          synopsis_override: { type: Type.STRING, description: 'Optional synopsis override' },
          force_regenerate: { type: Type.BOOLEAN, description: 'Force regeneration' },
        },
      },
      execute: async (args: any) => {
        const ctx = getActiveChatContext();
        const userId = args.userId || args.user_id || context?.userId || ctx?.userId;
        const seriesId = args.series_id || args.seriesId || context?.seriesId || ctx?.seriesId;
        const episodeId = args.episode_id || args.episodeId || context?.episodeId || ctx?.episodeId || '1';
        const onItemUpdated = context?.onItemUpdated || ctx?.onItemUpdated;

        if (!userId) {
          return { success: false, message: 'User ID is required' };
        }
        if (!seriesId) {
          return { success: false, message: 'Series ID is required' };
        }
        const res = await MasterPlanToolExecutors.generateEpisodeScreenplay({
          userId,
          seriesId,
          episodeId,
          episodeNumber: args.episode_number || args.episodeNumber,
          synopsisOverride: args.synopsis_override || args.synopsisOverride,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'screenplay_generated', data: res.data });
        }
        return res;
      },
    }),
  ];
}

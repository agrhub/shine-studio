import { storySkeletonAgent } from './StorySkeletonAgent.js';
import type {
  StorySkeletonInput,
  MasterPlanOutput,
  FullScriptPipelineRequest,
  FullScriptPipelineResponse,
  SupervisionResult,
  ScriptAgentInput,
  ScriptItem,
} from '@/types.js';
import { adaptationStrategyAgent } from './AdaptationStrategyAgent.js';
import { scriptAgent } from './ScriptAgent.js';
import { supervisionAgent } from './SupervisionAgent.js';

export class DirectorAgent {
  async runPipeline(request: FullScriptPipelineRequest): Promise<FullScriptPipelineResponse> {
    // 1. Generate story skeleton outline
    const outline = await storySkeletonAgent.execute({
      title: request.title,
      genre: request.genre,
      visual_style: request.visual_style || request.visualStyle,
      synopsis: request.synopsis,
      total_episodes: request.total_episodes || request.totalEpisodes || 20,
    });

    // 2. Compute adaptation strategy
    const adaptation = await adaptationStrategyAgent.execute({
      synopsis: request.synopsis,
      targetEpisodeCount: outline.total_episodes,
      pacingStyle: 'aggressive_hook',
    });

    // 3. Generate target episode script
    const targetEpisode = request.episode_number || request.episodeNumber || 1;
    const scriptItem = await scriptAgent.execute({
      series_id: outline.series_id,
      episode_number: targetEpisode,
      genre: request.genre,
      visual_style: request.visual_style,
      synopsis: request.synopsis,
    });

    if (!scriptItem) {
      throw new Error(`Failed to generate script for episode ${targetEpisode}`);
    }

    // 4. Quality supervision check
    const supervision = await supervisionAgent.execute(scriptItem);

    return {
      outline,
      adaptation,
      scriptItem,
      supervision,
    };
  }
}

export const directorAgent = new DirectorAgent();

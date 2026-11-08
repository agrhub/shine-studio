import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { loadSkill } from '@/utils/SkillLoader.js';
import { Logger } from '@/utils/logger.js';
import { getDatabaseProvider } from '@/database/index.js';
import type {
  EpisodeEntity,
  SeriesEntity,
  EpisodeAnalyticsSummary,
  EpisodeCommentItem,
  EpisodeAudienceInsight,
  AnalyzeEpisodeFeedbackParams,
  ApplyAudienceFeedbackResult,
} from '@/types.js';

export class AudienceIntelligenceAgent {
  /**
   * Analyzes viewer comments, engagement metrics, and narrative context for an episode,
   * producing actionable screenplay evolution directives for upcoming episodes.
   */
  public async analyzeEpisodeFeedback(params: AnalyzeEpisodeFeedbackParams): Promise<EpisodeAudienceInsight> {
    const { episode, comments, metrics, series } = params;

    const skill = loadSkill('audience_feedback_analyst');
    if (!skill) {
      Logger.warn('[AudienceIntelligenceAgent] Skill "audience_feedback_analyst.md" not found, using baseline directives.');
    }

    const commentsSummary = comments
      .slice(0, 30)
      .map((c, i) => `${i + 1}. [${c.platform.toUpperCase()}] "${c.author_name}": ${c.comment_text} (Likes: ${c.likes})`)
      .join('\n');

    const prompt = `Analyze audience feedback and metrics for the following micro-drama episode:

SERIES CONTEXT:
- Series Title: "${series?.title || 'Micro-Drama Series'}"
- Genre: "${series?.genre || 'Drama'}"
- Target Country: "${series?.country || 'US'}"
- Synopsis: "${series?.synopsis || 'N/A'}"

EPISODE CONTEXT:
- Episode ID: "${episode.id}"
- Episode Number: ${episode.episode_number}
- Episode Title: "${episode.title}"
- Synopsis: "${episode.synopsis || 'N/A'}"
- Cliffhanger Hook: "${episode.cliffhanger_hook || 'N/A'}"
- Conflict Escalation: "${episode.conflict_escalation || 'N/A'}"

PERFORMANCE METRICS:
- Total Views: ${metrics.total_views.toLocaleString()}
- Total Likes: ${metrics.total_likes.toLocaleString()}
- Comments Count: ${metrics.total_comments.toLocaleString()}
- Shares: ${metrics.total_shares.toLocaleString()}
- Retention Rate: ${metrics.retention_rate_pct || 78}%
- Top Viewer Regions: ${metrics.top_countries.map(c => `${c.country} (${c.percentage}%)`).join(', ')}

AUDIENCE COMMENTS SAMPLE (${comments.length} items):
${commentsSummary || 'No user comments available yet.'}

TASK:
Evaluate the audience response according to the Audience Intelligence & Script Evolution Skill.
Formulate clear, impactful directives that the screenwriter should apply when writing Episode ${episode.episode_number + 1} and subsequent episodes.
Return the structured analysis matching the EpisodeAudienceInsight JSON schema.`;

    // Returned when there is nothing real to analyze. It carries no invented
    // sentiment, character scores or directives, and is not persisted.
    const emptyInsight: EpisodeAudienceInsight = {
      episode_id: episode.id,
      series_id: episode.series_id,
      analyzed_at: new Date().toISOString(),
      sample_comments_count: comments.length,
      sentiment_distribution: { positive_pct: 0, neutral_pct: 0, negative_pct: 0, dominant_emotion: 'insufficient_data' },
      character_reception: [],
      pacing_and_retention_critique: {
        drop_off_risk_scenes: [],
        highlight_scenes: [],
        pacing_rating: 'balanced',
        verdict: 'Not enough real audience data yet — publish the episode and sync analytics once viewers respond.',
      },
      plot_flaws_and_questions: [],
      audience_theories_and_desires: [],
      recommendations_for_next_episodes: [],
    } as EpisodeAudienceInsight;

    const hasMetrics = Boolean(metrics.total_views || metrics.total_likes || metrics.total_comments || metrics.total_shares);
    if (comments.length === 0 && !hasMetrics) {
      Logger.info(`[AudienceIntelligenceAgent] Episode ${episode.episode_number}: no real comments or metrics, skipping analysis.`);
      return emptyInsight;
    }

    try {
      const insight = await aiProviderRouter.generateJSON<EpisodeAudienceInsight>(prompt, undefined, {
        systemInstruction: skill || 'You are an audience intelligence analyst optimizing short-form serialized dramas.',
      });

      // Ensure required IDs and dates are present
      insight.episode_id = episode.id;
      insight.series_id = episode.series_id;
      insight.analyzed_at = new Date().toISOString();
      insight.sample_comments_count = comments.length;

      // Persist audience insight on the episode document
      const db = await getDatabaseProvider();
      await db.updateEpisode(episode.id, {
        audience_insight: insight,
        updated_at: new Date().toISOString(),
      });

      Logger.info(`[AudienceIntelligenceAgent] Successfully analyzed feedback for Episode ${episode.episode_number}. Generated ${insight.recommendations_for_next_episodes?.length || 0} screenplay recommendations.`);

      return insight;
    } catch (err: any) {
      Logger.warn(`[AudienceIntelligenceAgent] Feedback analysis failed: ${err.message}`);
      return emptyInsight;
    }
  }

  /**
   * Applies the analyzed audience directives from a given episode to optimize
   * the screenplay, conflict escalation, and cliffhanger of the subsequent episode (Episode N+1).
   */
  public async applyInsightsToNextEpisode(episodeId: string, customInstruction?: string): Promise<ApplyAudienceFeedbackResult> {
    const db = await getDatabaseProvider();
    const currentEpisode = await db.getEpisodeById(episodeId);
    if (!currentEpisode) {
      throw new Error(`Current episode not found: ${episodeId}`);
    }

    const series = await db.getSeriesById(currentEpisode.series_id);
    const episodes = await db.getEpisodesBySeriesId(currentEpisode.series_id);

    const nextEpisodeNumber = currentEpisode.episode_number + 1;
    const nextEpisode = episodes.find(e => e.episode_number === nextEpisodeNumber);

    if (!nextEpisode) {
      return {
        success: false,
        targetEpisode: null,
        appliedDirectives: [],
        message: `Next episode (${nextEpisodeNumber}) does not exist in series yet.`,
      };
    }

    const insight = currentEpisode.audience_insight;
    const directives = insight?.recommendations_for_next_episodes || [];
    // Never rewrite a script from invented feedback: require real recommendations
    // (from analyzed audience data) or an explicit instruction from the creator.
    if (directives.length === 0 && !customInstruction) {
      return {
        success: false,
        targetEpisode: null,
        appliedDirectives: [],
        message: 'No real audience feedback has been analyzed for this episode yet. Sync analytics after viewers respond, or provide your own instruction.',
      };
    }

    const prompt = `You are an elite micro-drama director and screenwriter.
Refine and optimize the screenplay outline for Episode ${nextEpisode.episode_number} of "${series?.title || 'Micro-Drama'}" based on real audience feedback from Episode ${currentEpisode.episode_number}.

AUDIENCE DIRECTIVES FROM PREVIOUS EPISODE:
${directives.map((d, i) => `${i + 1}. ${d}`).join('\n')}

CHARACTER RECEPTION NOTES:
${(insight?.character_reception || []).map(c => `- ${c.character_name}: ${c.feedback_summary}`).join('\n') || 'None'}

PAYWALL ADVICE:
${insight?.paywall_optimization_advice ? `${insight.paywall_optimization_advice.recommended_cliffhanger_type} at second ${insight.paywall_optimization_advice.hook_placement_second}: ${insight.paywall_optimization_advice.reasoning}` : 'Build maximum tension at the 60-90s mark.'}

ADDITIONAL USER INSTRUCTION:
${customInstruction || 'Seamlessly blend audience desires while keeping narrative tension high.'}

CURRENT EPISODE ${nextEpisode.episode_number} DRAFT:
- Title: "${nextEpisode.title}"
- Synopsis: "${nextEpisode.synopsis}"
- Scene Core: "${nextEpisode.scene_core || 'Core conflict'}"
- Conflict Escalation: "${nextEpisode.conflict_escalation || 'Rising tension'}"
- Cliffhanger Hook: "${nextEpisode.cliffhanger_hook || 'Dramatic ending'}"

TASK:
Return an updated JSON object with revised narrative elements that address the feedback:
{
  "title": "${nextEpisode.title}",
  "synopsis": "Revised synopsis incorporating feedback...",
  "scene_core": "Revised core conflict...",
  "conflict_escalation": "Revised rising tension...",
  "cliffhanger_hook": "Revised hook setting up peak retention..."
}`;

    const fallback = {
      title: nextEpisode.title,
      synopsis: nextEpisode.synopsis,
      scene_core: nextEpisode.scene_core || 'Core conflict',
      conflict_escalation: nextEpisode.conflict_escalation || 'Rising tension',
      cliffhanger_hook: nextEpisode.cliffhanger_hook || 'Dramatic ending',
    };

    const refined = await aiProviderRouter.generateJSON<typeof fallback>(prompt, fallback, {
      systemInstruction: 'You are an adaptive screenwriter refining episodes based on live audience analytics.',
    });

    const updated = await db.updateEpisode(nextEpisode.id, {
      title: refined.title || nextEpisode.title,
      synopsis: refined.synopsis || nextEpisode.synopsis,
      scene_core: refined.scene_core || nextEpisode.scene_core,
      conflict_escalation: refined.conflict_escalation || nextEpisode.conflict_escalation,
      cliffhanger_hook: refined.cliffhanger_hook || nextEpisode.cliffhanger_hook,
      updated_at: new Date().toISOString(),
    });

    Logger.info(`[AudienceIntelligenceAgent] Successfully refined Episode ${nextEpisode.episode_number} using audience feedback from Episode ${currentEpisode.episode_number}.`);

    return {
      success: true,
      targetEpisode: updated,
      appliedDirectives: directives,
      message: `Episode ${nextEpisode.episode_number} screenplay directives successfully optimized based on audience feedback.`,
    };
  }
}

export const audienceIntelligenceAgent = new AudienceIntelligenceAgent();


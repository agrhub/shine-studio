/**
 * Standard Multi-Agent Instruction Builders for Shine AI Copilot & Production Pipeline
 * Follows the 4-Part Structure:
 * 1. Agent Description (Role, scope, and responsibilities of the Agent)
 * 2. Available Tools & Sub-Agents (Tool registry and trigger conditions)
 * 3. Data Schema & Error Handling (Input/output contracts, schema compliance, error handling)
 * 4. Finally Summary for User (Executive summary, progress reporting, visual previews)
 * Loads static system prompt instructions & skills purely from `src/skills/*.md`
 */
import { PromptLoader } from '@/utils/PromptLoader.js';
import { loadSkill } from '@/utils/SkillLoader.js';
import { getDatabaseProvider } from '~/database';
import { GEMINI_FEMALE_VOICES, GEMINI_MALE_VOICES, GEMINI_NEUTRAL_VOICES } from '~/integrations/ai/gemini/GeminiClient';
import { getLanguageInfo } from '~/utils/LanguageMapping';

export interface AgentContextParams {
  userId?: string;
  seriesId?: string;
  episodeId?: string;
  seriesTitle?: string;
  genre?: string;
  visualStyle?: string;
  visualStylePrompt?: string;
  language?: string;
  country?: string;
  ratio?: string;
  totalEpisodes?: number;
  totalDurationSeconds?: number;
  synopsis?: string;
  charactersCount?: number;
  charactersSummary?: string;
  locationsCount?: number;
  locationsSummary?: string;
  propsCount?: number;
  propsSummary?: string;
  scenesCount?: number;
  scenesSummary?: string;
  masterPlanInfo?: any;
  context?: any;
}

/**
 * 1. ROOT ORCHESTRATOR AGENT INSTRUCTION (STATIC SYSTEM INSTRUCTION)
 * Loaded from `skills/agent_root_orchestrator.md`, `prompts/chatbot/copilot_agent.md`, `skills/script_refine_master_plan.md`, `skills/compliance_check.md`
 */
export function getRootAgentInstruction(_params: AgentContextParams = {}): string {
  const orchestratorSkill = loadSkill('agent_root_orchestrator');
  const refineSkill = loadSkill('script_refine_master_plan');
  const complianceSkill = loadSkill('compliance_check');

  return `${orchestratorSkill}

---

### 6. SCRIPT REFINEMENT & COMPLIANCE SKILLS (LOADED FROM SKILLS)
${refineSkill ? `=== SCRIPT REFINEMENT SKILL ===\n${refineSkill}\n` : ''}
${complianceSkill ? `=== COMPLIANCE & SAFETY SKILL ===\n${complianceSkill}\n` : ''}
`;
}

/**
 * 2. MASTER PLAN ARCHITECT SUB-AGENT INSTRUCTION (STATIC SYSTEM INSTRUCTION)
 * Defines screenplay architecture, dramaturgy rules, and loaded skills.
 * Loaded from `skills/agent_master_plan_architect.md`, `skills/script_skeleton.md`, `skills/script_refine_master_plan.md`, `skills/compliance_check.md`
 */
export function getMasterPlanAgentInstruction(_params: AgentContextParams = {}): string {
  const masterPlanSkill = loadSkill('agent_master_plan_architect');
  const skeletonSkill = loadSkill('script_skeleton');
  const refineSkill = loadSkill('script_refine_master_plan');
  const complianceSkill = loadSkill('compliance_check');

  return `${masterPlanSkill}

---

### 5. CANONICAL STORY SKELETON SKILL (LOADED FROM SKILLS)
${skeletonSkill}

---

### 6. SCRIPT REFINEMENT & COMPLIANCE SKILLS (LOADED FROM SKILLS)
${refineSkill ? `=== SCRIPT REFINEMENT SKILL ===\n${refineSkill}\n` : ''}
${complianceSkill ? `=== COMPLIANCE & SAFETY SKILL ===\n${complianceSkill}\n` : ''}
`;
}

/**
 * 3. PRODUCTION PIPELINE & ASSET SUB-AGENT INSTRUCTION (STATIC SYSTEM INSTRUCTION)
 * Full tool scoping rules, media URL mandates, storyboard, frame prompt, and scene shot skills
 * Loaded from `skills/agent_production_pipeline.md`, `skills/production_storyboard.md`, `skills/production_frame_prompt.md`, `skills/scene_shot_system.md`
 */
export function getProductionPipelineAgentInstruction(_params: AgentContextParams = {}): string {
  const pipelineSkill = loadSkill('agent_production_pipeline');
  const storyboardSkill = loadSkill('production_storyboard');
  const framePromptSkill = loadSkill('production_frame_prompt');

  return `${pipelineSkill}

---

### 5. PRODUCTION STORYBOARD & PROMPT ENGINEERING SKILLS (LOADED FROM SKILLS)
${storyboardSkill ? `=== STORYBOARD PRODUCTION SKILL ===\n${storyboardSkill}\n` : ''}
${framePromptSkill ? `=== FRAME PROMPT SPECIFICATION SKILL ===\n${framePromptSkill}\n` : ''}
`;
}

/**
 * 4. TIMELINE EDITOR SUB-AGENT INSTRUCTION
 * Full tool parameters, timeline critique, and scene shot skills
 */
export function getTimelineEditorAgentInstruction(_params: AgentContextParams = {}): string {
  const timelineEditorSkill = loadSkill('agent_timeline_editor');

  return `${timelineEditorSkill}
`;
}

/**
 * 5. SCREENPLAY WRITER SUB-AGENT INSTRUCTION
 * Writes detailed episode screenplays with shot-by-shot breakdown optimized for 9:16 AI micro-drama.
 * Loaded from `skills/agent_screenplay_writer.md`, `skills/compliance_check.md`
 */
export function getScreenplayAgentInstruction(_params: AgentContextParams = {}): string {
  const screenplaySkill = loadSkill('agent_screenplay_writer');
  const complianceSkill = loadSkill('compliance_check');

  return `${screenplaySkill}

---

### 5. COMPLIANCE SKILL (LOADED FROM SKILLS)
${complianceSkill ? `=== COMPLIANCE & SAFETY SKILL ===\n${complianceSkill}\n` : ''}
`;
}
/**
   * Build live data context snapshot from database (Characters, Locations, Props, Scenes status, Voices)
   * Note: Agent instructions and skills are already loaded once in prompts.ts.
   */
export async function buildLiveContextSnapshot(seriesId?: string, episodeId?: string, context?: any): Promise<string> {
    try {
      const db = await getDatabaseProvider();
      const series = seriesId && !seriesId.startsWith('wiz_') && !seriesId.startsWith('temp_') ? await db.getSeriesById(seriesId) : null;
      const episode = episodeId && episodeId !== '1' ? await db.getEpisodeById(episodeId) : null;

      // ─── Case 0: Global Context (Dashboard, Assets, Analytics, Settings) ─────
      if (seriesId === 'global' || seriesId?.startsWith('global') || context?.pageContext === 'dashboard' || context?.pageContext === 'analytics' || context?.pageContext === 'assets' || context?.pageContext === 'settings') {
        const userId = context?.userId || context?.user_id;
        const allSeries = await db.getSeriesList(userId || undefined);
        const activeJobs = await db.getPipelineJobs({ user_id: userId || undefined, limit: 10 });
        
        const seriesSummary = allSeries.slice(0, 10).map((s: any, idx: number) => {
          return `${idx + 1}. "${s.title || 'Untitled'}" (ID: ${s.id}, Genre: ${s.genre || 'Drama'}, Episodes: ${s.total_episodes || s.episodes?.length || 0}, Status: ${s.status || 'draft'})`;
        }).join('\n') || 'No series created yet.';

        const jobsSummary = activeJobs.map((j: any) => {
          return `- Job [${j.id}]: ${j.type} | Status: ${j.status} | Progress: ${j.progress}% | Series: ${j.series_id || 'N/A'}`;
        }).join('\n') || 'No active background pipeline jobs.';

        const globalPrompt = `=== SHINE STUDIO GLOBAL AI COPILOT ===
You are Shine AI Studio Copilot operating in GLOBAL context (Page: ${context?.pageContext || 'Dashboard'}).
You assist the creator with overall studio management, project planning, viral hooks, analytics evaluation, credit budgeting, and trigger production pipelines.

CREATOR'S ACTIVE SERIES PORTFOLIO:
${seriesSummary}

ACTIVE PIPELINE & RENDER JOBS:
${jobsSummary}

CURRENT PAGE: ${context?.pageContext || 'Dashboard'}
CAPABILITIES:
- Brainstorm and outline new micro-drama concepts and 3-act story arcs.
- Analyze retention, viewer drop-off points, and conversion metrics across series.
- Inspect active jobs, suggest pipeline execution, and guide asset production.
- Recommend trending viral genres and character hooks.`;

        const baseInstruction = getRootAgentInstruction({
          seriesId: 'global',
          episodeId: 'main',
          seriesTitle: 'Shine Studio Global Management',
          genre: 'Multi-Genre',
          visualStyle: 'Cinematic',
          language: context?.language || 'en-US',
          country: context?.country || 'United States',
          context,
        });

        return `${baseInstruction}\n\n${globalPrompt}\n\n`;
      }

      // ─── Case 1: Wizard Flow (No series/episode created yet) ───────────────────
      if (!series && !episode) {
        const totalEpisodes = Number(context?.target_episodes || context?.targetEpisodes || context?.total_episodes || context?.totalEpisodes || 24);
        const totalDurationSeconds = Math.min(Math.max(Number(context?.episode_duration_seconds || context?.episodeDurationSeconds || 60), 30), 600);
        const durationDisplay = `${Math.floor(totalDurationSeconds / 60)}m ${totalDurationSeconds % 60 ? `${totalDurationSeconds % 60}s` : ''}`.trim();
        const country = context?.country || 'United States';
        const scriptLanguage = context?.language || 'en-US';
        const langInfo = getLanguageInfo(scriptLanguage);
        const visualStyle = context?.visual_style || context?.visualStyle || 'Cinematic';
        const visualStylePrompt = context?.visual_style_prompt || context?.visualStylePrompt || '';
        const title = context?.title || 'Original Micro-Drama';
        const genre = context?.genre || 'Drama';
        const synopsis = context?.synopsis || 'High-stakes dramatic series';
        const ratio = context?.ratio || '9:16';
        const viralTopic = context?.viral_topic || context?.viralTopic || '';

        const maleVoicesCatalog = GEMINI_MALE_VOICES;
        const femaleVoicesCatalog = GEMINI_FEMALE_VOICES;
        const neutralVoicesCatalog = GEMINI_NEUTRAL_VOICES;

        const voiceCatalog = [
          '  [Male Voices]',
          maleVoicesCatalog,
          '  [Female Voices]',
          femaleVoicesCatalog,
          '  [Neutral Voices]',
          neutralVoicesCatalog,
        ].join('\n');

        const corePrompt = PromptLoader.render('skeleton/story_skeleton_core', {
          totalEpisodes,
          totalDurationSeconds,
          durationDisplay,
          country,
          languageName: langInfo.name,
          languageNativeName: langInfo.nativeName,
          languageCode: context?.language || langInfo.code,
          languageInstruction: langInfo.promptInstruction,
          title,
          genre,
          visualStyle,
          visualStylePrompt,
          synopsis,
          ratio,
          viralTopic,
          voiceCatalog,
          episodeScopeInstruction: `CRITICAL MANDATE: You MUST generate all ${totalEpisodes} serialized episodes in the episodes array (numbered 1 through ${totalEpisodes}) without omitting, truncating, summarizing, or stopping early.`,
        });

        const creativeDirectorPrompt = PromptLoader.render('chatbot/creative_director', {
          seriesId: context?.series_id || context?.seriesId || 'series_preview',
          seriesTitle: title,
          seriesGenre: genre,
          seriesVisualStyle: visualStyle,
          seriesVisualStylePrompt: visualStylePrompt,
          country,
          language: langInfo.name,
          ratio,
          totalEpisodes,
          totalDurationSeconds,
          synopsis,
        });

        return `${creativeDirectorPrompt}\n\n=== STORY PROJECT PARAMETERS & CORE DIRECTIVES ===\n${corePrompt}\n\n=== CANONICAL STORY SKELETON SKILL (SCRIPT ARCHITECT) ===\n`;
      }

      const characters = series?.characters || [];
      const locations = series?.locations || [];
      const props = series?.props || [];
      const scenes = episode?.scenes || [];

      const charactersSummary = characters.map((c: any) => `${c.name} [Image: ${c.imageUrl ? 'YES' : 'NO'}, Wardrobes: ${c.wardrobeVariants?.length || 0}]`).join(', ') || 'None';
      const locationsSummary = locations.map((l: any) => `${l.name} [Image: ${l.imageUrl ? 'YES' : 'NO'}]`).join(', ') || 'None';
      const propsSummary = props.map((p: any) => p.name || p).join(', ') || 'None';
      const scenesSummary = scenes.map((s: any) => `  Scene #${s.index}: ${s.setting || ''} | Dialogue: "${(s.dialogue || '').slice(0, 30)}..." | Storyboard: ${s.storyboardFrameUrl ? 'YES' : 'NO'} | Video: ${s.videoUrl ? 'YES' : 'NO'} | Audio: ${s.audioUrl ? 'YES' : 'NO'}`).join('\n') || '  No scenes loaded yet.';

      const baseInstruction = getRootAgentInstruction({
        seriesId,
        episodeId,
        seriesTitle: series?.title || context?.title || 'Untitled Series',
        genre: series?.genre || context?.genre || 'Drama',
        visualStyle: series?.visual_style || context?.visualStyle || 'Cinematic',
        language: context?.language || (series as any)?.language || 'en-US',
        country: context?.country || (series as any)?.country || 'United States',
        context,
      });

      const copilotMain = PromptLoader.render('chatbot/copilot_agent', {
        seriesTitle: series?.title || context?.title || 'Untitled',
        seriesGenre: series?.genre || context?.genre || 'Drama',
        seriesVisualStyle: series?.visual_style || context?.visualStyle || 'Cinematic',
        seriesVisualStylePrompt: series?.visual_style_prompt || context?.visualStylePrompt || '',
        seriesTargetDuration: series?.episode_duration || series?.master_plan?.total_duration_seconds || context?.episodeDurationSeconds || 60,
        episodeNumber: episode?.episode_number || 1,
        episodeTitle: episode?.title || 'Untitled',
        charactersCount: characters.length,
        charactersSummary,
        locationsCount: locations.length,
        locationsSummary,
        propsCount: props.length,
        propsSummary,
        scenesCount: scenes.length,
        scenesSummary,
      });

      return `${baseInstruction}\n\n=== LIVE EPISODE & ASSET CONTEXT ===\n${copilotMain}\n\n`;
    } catch (error) {
      return `[UI Context | SeriesId: "${seriesId || 'none'}", EpisodeId: "${episodeId || '1'}", Tab: "${context?.tab || 'workspace'}"]`;
    }
  }
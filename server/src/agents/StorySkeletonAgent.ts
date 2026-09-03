import { geminiClient, GEMINI_SUPPORTED_VOICES, GEMINI_MALE_VOICES, GEMINI_FEMALE_VOICES, GEMINI_NEUTRAL_VOICES } from '../integrations/ai/gemini/GeminiClient.js';
import { loadSkill } from '../utils/SkillLoader.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { Logger } from '../utils/logger.js';
import { getLanguageForCountry } from '@/utils/LanguageMapping.js';
import { getVisualStylePrompt } from '@/constants/VisualStyles.js';
import { MasterPlanSchema, validateAiJson } from '@/schemas/AISchemas.js';
import { EpisodeSkeleton, MasterPlanOutput, PaywallHook, StorySkeletonInput } from '~/types.js';

// export interface StorySkeletonInput {
//   title: string;
//   genre: string;
//   visualStyle?: string;
//   visualStylePrompt?: string;
//   synopsis: string;
//   totalEpisodes?: number;
//   episodeDurationSeconds?: number;
//   country?: string;
//   language?: string;
//   ratio?: string;
//   viralTopic?: string;
//   referenceAssets?: any[];
// }

// export interface CharacterPersona {
//   name: string;
//   role: 'protagonist' | 'antagonist' | 'supporter';
//   gender?: 'male' | 'female' | 'neutral';
//   age?: number;
//   nationality?: string;
//   voiceId?: string;
//   identity: string;
//   appearance?: string; // Facial features, physical build, age appearance matching target country
//   visualTraits?: string;
//   physicalCharacteristics?: string;
//   description?: string;
//   costumeStyle?: string; // Signature cultural/regional wardrobe, styling, and signature accessories
//   traits: string;
//   circumstance: string;
//   action: string;
//   ending: string;
//   avatarUrl?: string | null;
//   loraAnchor?: string;
//   speechStyle?: string;
//   empathyElements?: string;
// }

// export interface ActStructure {
//   actNumber: number;
//   name: string;
//   episodeRange: string;
//   function: string;
//   coreQuestion: string;
//   actClimax: string;
// }

// export interface MajorReversal {
//   reversalIndex: number;
//   episodeNumber: number;
//   setupHook: string;
//   reversalEvent: string;
//   audienceImpact: string;
// }

// export interface PaywallHook {
//   percentage: string;
//   episodeNumber: number;
//   type: 'First Climax' | 'Life-Death Crisis' | 'Mid-Season Twist' | 'Late Reversal' | 'Grand Finale';
//   hookDescription: string;
//   adHook30sPrompt: string;
// }

// export interface EpisodeSkeleton {
//   episodeNumber: number;
//   title: string;
//   synopsis: string;
//   sceneCore: string;
//   conflictEscalation: string;
//   cliffhangerHook: string;
//   phase: string;
//   sceneCount: number;
//   durationSeconds?: number;
// }

// export interface StoryCore {
//   coreAttraction: string;
//   psychologicalPleasure: string;
//   goldFingerRule: string;
// }

// export interface LocationPersona {
//   id?: string;
//   name: string;
//   physicalCharacteristics: string;
//   timeOfDay?: string;
//   imageUrl?: string;
// }

// export interface PropPersona {
//   id?: string;
//   name: string;
//   physicalCharacteristics: string;
//   imageUrl?: string;
// }

// export interface MasterPlanOutput {
//   seriesId: string;
//   title: string;
//   genre: string;
//   visualStyle: string;
//   visualStylePrompt: string;
//   country: string;
//   ratio: string;
//   totalEpisodes: number;
//   totalDurationSeconds?: number;
//   language: string;
//   settingContext?: {
//     era: string; // e.g. Modern 2026, Cyberpunk, 1990s retro
//     location: string; // e.g. High-tech metropolis, bustling apartment complex, corporate towers
//     culturalAtmosphere: string; // Local lifestyle, social classes, architecture and visual aesthetic
//   };
//   storyCore: StoryCore;
//   synopsis: string;
//   hiddenLine: string;
//   targetAudience: string;
//   viralHook: string;
//   estimatedRetention: string;
//   characters: CharacterPersona[];
//   locations?: LocationPersona[];
//   props?: PropPersona[];
//   threeActs: ActStructure[];
//   majorReversals: MajorReversal[];
//   paywallHooks: PaywallHook[];
//   episodes: EpisodeSkeleton[];
// }

// export type StorySkeletonOutput = MasterPlanOutput;

const CHUNK_SIZE = 15; // Max episodes per chunk to avoid JSON token limits

export class StorySkeletonAgent {
  async execute(input: StorySkeletonInput): Promise<MasterPlanOutput> {
    const totalEpisodes = input.total_episodes || 24;
    const totalDurationSeconds = Math.min(Math.max(Number(input.episode_duration_seconds), 30), 600);
    const durationDisplay = `${Math.floor(totalDurationSeconds / 60)}m ${totalDurationSeconds % 60 ? `${totalDurationSeconds % 60}s` : ''}`.trim();
    const country = input.country || 'United States';
    const langInfo = input.language ? getLanguageForCountry(input.language) : getLanguageForCountry(country);
    const skillInstruction = loadSkill('script_skeleton');

    if (!skillInstruction) {
      throw new Error('Skill definition "script_skeleton.md" could not be loaded from skills repository.');
    }

    // Prepare detailed voice catalogs with tone and pitch descriptions directly from GeminiClient
    const maleVoicesCatalog = GEMINI_SUPPORTED_VOICES
      .filter(v => v.gender === 'male')
      .map(v => `  * "${v.id}": ${v.description}`)
      .join('\n');
    const femaleVoicesCatalog = GEMINI_SUPPORTED_VOICES
      .filter(v => v.gender === 'female')
      .map(v => `  * "${v.id}": ${v.description}`)
      .join('\n');
    const neutralVoicesCatalog = GEMINI_SUPPORTED_VOICES
      .filter(v => v.gender === 'neutral')
      .map(v => `  * "${v.id}": ${v.description}`)
      .join('\n');

    const voiceCatalog = [
      '  [Male Voices]',
      maleVoicesCatalog,
      '  [Female Voices]',
      femaleVoicesCatalog,
      '  [Neutral Voices]',
      neutralVoicesCatalog,
    ].join('\n');

    const episodeScopeInstruction = totalEpisodes <= CHUNK_SIZE
      ? `Generate all ${totalEpisodes} episodes in the episodes array.`
      : `Provide the first ${CHUNK_SIZE} episodes (1 to ${CHUNK_SIZE}) in the episodes array.`;

    Logger.info(`[StorySkeletonAgent] Generating Master Plan Core for "${input.title}" (${totalEpisodes} eps, ${durationDisplay}/ep, Target: ${langInfo.name})...`);

    const corePrompt = PromptLoader.render('skeleton/story_skeleton_core', {
      totalEpisodes,
      totalDurationSeconds,
      durationDisplay,
      country,
      languageName: langInfo.name,
      languageNativeName: langInfo.nativeName,
      languageCode: input.language || langInfo.code,
      languageInstruction: langInfo.promptInstruction,
      title: input.title || 'Untitled Series',
      genre: input.genre || 'Suspense / Mystery',
      visualStyle: input.visual_style || 'realistic',
      visualStylePrompt: input.visual_style_prompt || getVisualStylePrompt(input.visual_style || 'realistic'),
      synopsis: input.synopsis || 'A high-stakes conflict of power, betrayal, and redemption.',
      ratio: input.ratio || '9:16',
      viralTopic: input.viral_topic || 'None',
      voiceCatalog,
      episodeScopeInstruction,
    });

    const rawText = await geminiClient.generateText({
      prompt: corePrompt,
      systemInstruction: `${skillInstruction}\n\nCRITICAL LANGUAGE MANDATE: ${langInfo.promptInstruction}`,
      jsonMode: true,
    });

    if (!rawText || !rawText.trim()) {
      throw new Error('Gemini model returned empty response for master plan generation.');
    }

    const masterPlan: MasterPlanOutput = validateAiJson(rawText, MasterPlanSchema, 'Master Plan') as any;

    const maleVoices = GEMINI_MALE_VOICES;
    const femaleVoices = GEMINI_FEMALE_VOICES;
    const neutralVoices = GEMINI_NEUTRAL_VOICES;
    const validVoiceIds = new Set(GEMINI_SUPPORTED_VOICES.map(v => v.id));

    // Ensure all characters have valid gender, nationality, and matching voiceId assigned
    if (Array.isArray(masterPlan.characters)) {
      masterPlan.characters = masterPlan.characters.map((c, i) => {
        const rawGender = String(c.gender || '').toLowerCase().trim();
        const gender: 'male' | 'female' | 'neutral' = 
          rawGender === 'female' || rawGender === 'male' || rawGender === 'neutral'
            ? (rawGender as any)
            : (i % 2 === 0 ? 'female' : 'male');
            
        const nationality = c.nationality || country;
        let voiceId = c.voice_id;
        
        // Ensure voiceId matches the character gender
        const currentVoiceMeta = GEMINI_SUPPORTED_VOICES.find(v => v.id === voiceId);
        const voiceGenderMismatch = currentVoiceMeta && currentVoiceMeta.gender !== 'neutral' && currentVoiceMeta.gender !== gender;

        if (!voiceId || !validVoiceIds.has(voiceId) || voiceGenderMismatch) {
          if (gender === 'female') {
            voiceId = femaleVoices[i % femaleVoices.length];
          } else if (gender === 'male') {
            voiceId = maleVoices[i % maleVoices.length];
          } else {
            voiceId = neutralVoices[i % neutralVoices.length];
          }
        }

        const visualDesc = c.visual_traits || c.appearance || c.physical_characteristics || c.description || (c.traits ? `Observable visual traits: ${c.traits}` : '');
        const fullDesc = c.description || c.appearance || c.physical_characteristics || c.traits || '';

        return {
          ...c,
          appearance: visualDesc,
          physical_characteristics: visualDesc,
          visual_traits: visualDesc,
          description: fullDesc,
          age: Number(c.age) || (c.role === 'supporter' ? 35 : 24),
          gender,
          nationality,
          voice_id: voiceId
        };
      });
    }

    masterPlan.total_episodes = totalEpisodes;
    masterPlan.total_duration_seconds = totalDurationSeconds;
    masterPlan.country = country;
    masterPlan.language = langInfo.name;
    masterPlan.visual_style = input.visual_style || masterPlan.visual_style || 'realistic';
    masterPlan.visual_style_prompt = input.visual_style_prompt || masterPlan.visual_style_prompt || getVisualStylePrompt(masterPlan.visual_style_prompt);
    masterPlan.ratio = input.ratio || masterPlan.ratio || '9:16';
    masterPlan.genre = input.genre || masterPlan.genre || 'Suspense / Mystery';

    if (!masterPlan.series_id) {
      masterPlan.series_id = `series_${Date.now()}`;
    }

    // Step 2: Chunk Generation for remaining episodes if totalEpisodes > CHUNK_SIZE
    if (totalEpisodes > CHUNK_SIZE) {
      Logger.info(`[StorySkeletonAgent] totalEpisodes (${totalEpisodes}) > ${CHUNK_SIZE}. Executing Chunk Mode for episodes ${CHUNK_SIZE + 1} to ${totalEpisodes}...`);
      const allEpisodes = await this.generateEpisodesInChunks(
        masterPlan,
        totalEpisodes,
        masterPlan.episodes || [],
        skillInstruction,
        langInfo.promptInstruction,
        country
      );
      masterPlan.episodes = allEpisodes;
    }

    Logger.info(`[StorySkeletonAgent] Master Plan completed with ${masterPlan.episodes.length}/${totalEpisodes} episodes in ${langInfo.name}.`);
    return masterPlan;
  }

  /**
   * Generates episodes in chunks of 15 to handle 50, 100, 200+ episodes without JSON overflow
   */
  public async generateEpisodesInChunks(
    corePlan: Partial<MasterPlanOutput>,
    totalEpisodes: number,
    initialEpisodes: EpisodeSkeleton[],
    skillInstruction: string,
    languageInstruction?: string,
    country?: string
  ): Promise<EpisodeSkeleton[]> {
    const episodesMap = new Map<number, EpisodeSkeleton>();

    // Index initial episodes
    for (const ep of initialEpisodes) {
      if (ep && ep.episode_number <= totalEpisodes) {
        episodesMap.set(ep.episode_number, ep);
      }
    }

    // Determine missing chunk ranges
    const chunkPromises: Promise<EpisodeSkeleton[]>[] = [];

    for (let startEp = 1; startEp <= totalEpisodes; startEp += CHUNK_SIZE) {
      const endEp = Math.min(startEp + CHUNK_SIZE - 1, totalEpisodes);
      
      // Check if all episodes in this chunk already exist
      let hasMissing = false;
      for (let epNum = startEp; epNum <= endEp; epNum++) {
        if (!episodesMap.has(epNum)) {
          hasMissing = true;
          break;
        }
      }

      if (hasMissing) {
        chunkPromises.push(
          this.generateSingleChunk(corePlan, startEp, endEp, totalEpisodes, skillInstruction, languageInstruction, country)
        );
      }
    }

    if (chunkPromises.length > 0) {
      Logger.info(`[StorySkeletonAgent] Generating ${chunkPromises.length} episode chunks in parallel...`);
      const chunkResults = await Promise.all(chunkPromises);
      for (const chunk of chunkResults) {
        for (const ep of chunk) {
          if (ep && ep.episode_number) {
            episodesMap.set(ep.episode_number, ep);
          }
        }
      }
    }

    // Build contiguous array 1..totalEpisodes
    const finalEpisodes: EpisodeSkeleton[] = [];
    for (let epNum = 1; epNum <= totalEpisodes; epNum++) {
      if (episodesMap.has(epNum)) {
        finalEpisodes.push(episodesMap.get(epNum)!);
      } else {
        // Fallback placeholder if a single episode failed in chunk
        // finalEpisodes.push({
        //   episode_number: epNum,
        //   title: `Episode ${epNum}: Crisis Escalation`,
        //   synopsis: `The conflict intensifies as key secrets threaten to unravel.`,
        //   scene_core: `Dramatic confrontation pushing protagonist towards breaking point.`,
        //   conflict_escalation: `Rising stakes along the main narrative axis.`,
        //   cliffhanger_hook: `Urgent turning point demanding continuation.`,
        //   phase: `Act ${epNum <= totalEpisodes * 0.3 ? 1 : epNum <= totalEpisodes * 0.7 ? 2 : 3}`,
        //   scene_count: 3,
        // });
      }
    }

    return finalEpisodes;
  }

  private async generateSingleChunk(
    corePlan: Partial<MasterPlanOutput>,
    startEp: number,
    endEp: number,
    totalEpisodes: number,
    skillInstruction: string,
    languageInstruction?: string,
    country?: string
  ): Promise<EpisodeSkeleton[]> {
    Logger.info(`[StorySkeletonAgent] Chunk Generation: Episodes ${startEp} to ${endEp}...`);

    const threeActsOverview = (corePlan.three_acts || [])
      .map(a => `  * Act ${a.act_number} (${a.episode_range}): ${a.name} - ${a.function}`)
      .join('\n');
    const majorReversalsOverview = (corePlan.major_reversals || [])
      .map(r => `  * Ep ${r.episode_number} Reversal: ${r.setup_hook} -> ${r.reversal_event}`)
      .join('\n');
    const paywallHooksOverview = (corePlan.paywall_hooks || [])
      .map(p => `  * Ep ${p.episode_number} (${p.percentage}): ${p.hook_description}`)
      .join('\n');

    const prompt = PromptLoader.render('skeleton/story_skeleton_chunk', {
      startEp,
      endEp,
      totalEpisodes,
      title: corePlan.title || 'Untitled',
      genre: corePlan.genre || 'Drama',
      country: country || corePlan.country || 'US',
      languageName: languageInstruction || corePlan.language || 'English',
      synopsis: corePlan.synopsis || corePlan.story_core?.core_attraction || 'Drama series',
      storyCore: JSON.stringify(corePlan.story_core || {}),
      hiddenLine: corePlan.hidden_line || '',
      targetAudience: corePlan.target_audience || '',
      threeActsOverview,
      majorReversalsOverview,
      paywallHooksOverview,
    });

    try {
      const rawText = await geminiClient.generateText({
        prompt,
        systemInstruction: `${skillInstruction}\n\n${languageInstruction || ''}`,
        jsonMode: true,
      });

      const parsed = JSON.parse(rawText);
      const list: EpisodeSkeleton[] = Array.isArray(parsed) ? parsed : parsed.episodes || [];
      return list;
    } catch (err: any) {
      Logger.warn(`[StorySkeletonAgent] Failed generating chunk ${startEp}-${endEp}: ${err.message}`);
      return [];
    }
  }
}

export const storySkeletonAgent = new StorySkeletonAgent();

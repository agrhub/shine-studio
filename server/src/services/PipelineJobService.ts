import { nanoid } from 'nanoid';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import type {
  PipelineJobEntity,
  PipelineJobStepProgress,
  PipelineJobLog,
  AssetJobItem,
  CharacterSeriesEntity,
  CharacterWardrobeVariant,
  LocationAsset,
  PropAsset,
  SceneEntity,
  EpisodeEntity,
  SeriesEntity,
} from '@/types.js';
import { CharacterToolExecutors } from '@/agents/chatbot/tools/character.tools.js';
import { AssetToolExecutors } from '@/agents/chatbot/tools/asset.tools.js';
import { VideoToolExecutors } from '@/agents/chatbot/tools/video.tools.js';
import { AudioToolExecutors } from '@/agents/chatbot/tools/audio.tools.js';
import { CaptionToolExecutors } from '@/agents/chatbot/tools/caption.tools.js';
import { RenderToolExecutors } from '@/agents/chatbot/tools/render.tools.js';
import { PatchSyncService } from '@/realtime/PatchSyncService.js';
import { ChatbotAgent } from '@/agents/ChatbotAgent.js';

export class PipelineJobService {
  private static activeRuns: Map<string, boolean> = new Map();

  /**
   * Start a new background pipeline job or return the existing running job for this episode
   */
  public static async startOrGetPipelineJob(params: {
    user_id: string;
    series_id: string;
    episode_id: string;
    type?: string;
    force_regenerate?: boolean;
    session_id?: string;
    title?: string;
  }): Promise<{ job: PipelineJobEntity; is_new: boolean }> {
    const { user_id, series_id, episode_id, type = 'full_pipeline', force_regenerate, session_id, title } = params;
    const db = await getDatabaseProvider();

    // 1. Check if there is already an active running job for this episode
    const active = await db.findActivePipelineJob(series_id, episode_id, type);
    if (active) {
      const lastActivity = new Date(active.updated_at || active.created_at).getTime();
      if (Date.now() - lastActivity > 20 * 60 * 1000) {
        Logger.warn(`[PipelineJobService] Job ${active.id} is stale/zombie (no update for ${Math.round((Date.now() - lastActivity) / 60000)}m). Auto-failing to allow fresh run.`);
        active.status = 'failed';
        active.error = 'Task timed out after inactivity';
        await db.savePipelineJob(active).catch(() => {});
      } else {
        Logger.info(`[PipelineJobService] Active job ${active.id} already exists for Series ${series_id} / Episode ${episode_id}. Returning existing job.`);
        return { job: active, is_new: false };
      }
    }

    const series = await db.getSeriesById(series_id);
    const episode = await db.getEpisodeById(episode_id);
    const jobTitle = title || (
      type === 'render'
        ? `Render Master Video: ${series?.title || 'Series'} (EP #${episode?.episode_number || 1})`
        : `Production Pipeline: ${series?.title || 'Series'} (EP #${episode?.episode_number || 1})`
    );

    let initialStepProgress: Record<string, PipelineJobStepProgress> = {};
    if (type === 'render') {
      initialStepProgress = {
        render: { status: 'pending', progress: 0, message: 'Final Video Compositor & Export', assets: [] },
      };
    } else {
      initialStepProgress = {
        b1: { status: 'pending', progress: 0, message: 'Cast Avatars & Wardrobe Lookbooks', assets: [] },
        b2: { status: 'pending', progress: 0, message: 'Locations, Props & Storyboard Frames', assets: [] },
        b3: { status: 'pending', progress: 0, message: 'AI Scene Video Clips', assets: [] },
        b4: { status: 'pending', progress: 0, message: 'Voiceover & Dubbing', assets: [] },
        b5: { status: 'pending', progress: 0, message: 'Word-by-Word Subtitles', assets: [] },
        b6: { status: 'pending', progress: 0, message: 'Final Video Compositor', assets: [] },
      };
    }

    const newJob: PipelineJobEntity = {
      id: `job_${nanoid(12)}`,
      user_id: user_id,
      series_id: series_id,
      episode_id: episode_id,
      session_id: session_id,
      type,
      title: jobTitle,
      status: 'running',
      progress: 5,
      current_step: 'Initializing pipeline...',
      step_progress: initialStepProgress,
      outputs: {},
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Job created. Target: ${jobTitle}`,
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.savePipelineJob(newJob);

    // Broadcast job creation to connected clients
    PatchSyncService.broadcast(series_id, 'pipeline_job:updated', newJob);

    // Launch execution asynchronously (non-blocking)
    this.activeRuns.set(newJob.id, true);
    setImmediate(() => {
      this.runPipelineExecution(newJob.id, params).catch((err) => {
        Logger.error(`[PipelineJobService] Uncaught error in job ${newJob.id}: ${err.message}`);
      });
    });

    return { job: newJob, is_new: true };
  }

  /**
   * Asynchronous background execution of pipeline steps
   */
  private static async runPipelineExecution(
    job_id: string,
    params: {
      user_id: string;
      series_id: string;
      episode_id: string;
      type?: string;
      force_regenerate?: boolean;
    }
  ): Promise<void> {
    const { user_id, series_id, episode_id, type = 'full_pipeline', force_regenerate } = params;
    const db = await getDatabaseProvider();

    const addLog = async (level: 'info' | 'warn' | 'error', message: string) => {
      const current = await db.getPipelineJobById(job_id);
      if (!current) return;
      const logs = current.logs || [];
      logs.push({ timestamp: new Date().toISOString(), level, message });
      await db.updatePipelineJob(job_id, { logs });
    };

    const updateStep = async (
      stepKey: string,
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
      progress: number,
      overallProgress: number,
      currentStepDesc: string,
      outputPatch?: Record<string, any>,
      assets?: AssetJobItem[]
    ) => {
      const current = await db.getPipelineJobById(job_id);
      if (!current) return;

      const stepProgress = current.step_progress || {};
      stepProgress[stepKey] = {
        ...(stepProgress[stepKey] || {}),
        status,
        progress,
        message: currentStepDesc,
        ...(assets ? { assets } : {}),
        ...(status === 'running' && !stepProgress[stepKey]?.started_at ? { started_at: new Date().toISOString() } : {}),
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      };

      const outputs = {
        ...(current.outputs || {}),
        ...(outputPatch || {}),
      };

      const updated = await db.updatePipelineJob(job_id, {
        progress: overallProgress,
        current_step: currentStepDesc,
        step_progress: stepProgress,
        outputs,
      });

      if (updated) {
        PatchSyncService.broadcast(series_id, 'pipeline_job:updated', updated);
      }
    };

    const appendItemProgress = async (
      stepKey: string,
      asset: AssetJobItem,
      stepCurrent: number,
      stepTotal: number,
      minOverall: number,
      maxOverall: number,
      message: string
    ) => {
      const current = await db.getPipelineJobById(job_id);
      if (!current) return;

      const stepProgress = current.step_progress || {};
      const existingAssets: AssetJobItem[] = stepProgress[stepKey]?.assets || [];
      const updatedAssets = [...existingAssets.filter((a) => a.id !== asset.id), asset];

      const stepPercent = stepTotal > 0 ? Math.min(100, Math.round((stepCurrent / stepTotal) * 100)) : 100;
      const overallPercent = Math.min(100, Math.round(minOverall + (stepPercent / 100) * (maxOverall - minOverall)));

      stepProgress[stepKey] = {
        ...(stepProgress[stepKey] || {}),
        status: 'running',
        progress: stepPercent,
        message,
        assets: updatedAssets,
        started_at: stepProgress[stepKey]?.started_at || new Date().toISOString(),
      };

      const logs = current.logs || [];
      logs.push({
        timestamp: new Date().toISOString(),
        level: asset.status === 'failed' ? 'warn' : 'info',
        message: `[Step ${stepKey.toUpperCase()}] ${message}`,
      });

      const updated = await db.updatePipelineJob(job_id, {
        progress: overallPercent,
        current_step: message,
        step_progress: stepProgress,
        logs,
      });

      if (updated) {
        PatchSyncService.broadcast(series_id, 'pipeline_job:updated', updated);
      }
    };

    try {
      await addLog('info', `Starting automated pipeline execution for Job ${job_id}...`);

      // ─── STANDALONE RENDER JOB ──────────────────────────────────────────────
      if (type === 'render') {
        if (!this.activeRuns.get(job_id)) return;
        await updateStep('render', 'running', 20, 30, 'Exporting & Rendering Video...');
        await addLog('info', 'Executing Render Step');

        const renderRes = await RenderToolExecutors.renderEpisodeVideo({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: force_regenerate,
          pipelineJobId: job_id,
        });

        if (!renderRes.success) {
          throw new Error(`Render Failed: ${renderRes.message}`);
        }

        const epAfter: EpisodeEntity | null = await db.getEpisodeById(episode_id);
        const finalUrl = renderRes.data?.video_url || epAfter?.video_url;
        const renderAssets: AssetJobItem[] = [
          {
            id: `render_${job_id}`,
            name: `Episode #${epAfter?.episode_number || 1} Final Video`,
            type: 'render',
            status: 'completed',
            url: finalUrl,
            created_at: new Date().toISOString(),
          },
        ];

        await updateStep('render', 'completed', 100, 100, 'Master Video Rendered', { final_video: renderRes.data }, renderAssets);
        await addLog('info', 'Render completed successfully.');
      }

      // ─── STEP B1: CAST PORTRAITS & WARDROBE LOOKBOOKS ───────────────────────
      if (type === 'full_pipeline' || type === 'step_b1') {
        if (!this.activeRuns.get(job_id)) return;
        await updateStep('b1', 'running', 10, 10, 'Step B1: Verifying Cast Portraits & Wardrobes...');
        await addLog('info', 'Executing Step B1: Cast Portraits & Wardrobes (Preserving existing series cast)');

        // In full_pipeline mode, preserve existing character portraits & wardrobe variants to maintain visual consistency across all episodes.
        // Force regeneration only applies to B1 if running a dedicated step_b1 job.
        const charForce = type === 'step_b1' ? force_regenerate : false;
        const wardrobeForce = type === 'step_b1' ? force_regenerate : false;

        const charRes = await CharacterToolExecutors.generateCharacterAsset({
          userId: user_id,
          seriesId: series_id,
          forceRegenerate: charForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b1', item.asset, item.current, item.total, 0, 10, item.description);
          },
        });
        const wardrobeRes = await CharacterToolExecutors.generateWardrobeVariants({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: wardrobeForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b1', item.asset, item.current, item.total, 10, 20, item.description);
          },
        });

        if (!charRes.success && !wardrobeRes.success) {
          throw new Error(`Step B1 Failed: ${charRes.message || wardrobeRes.message}`);
        }

        // Collect AssetJobItems for B1
        const seriesAfterB1: SeriesEntity | null = await db.getSeriesById(series_id);
        const b1Assets: AssetJobItem[] = [];
        (seriesAfterB1?.characters || []).forEach((c: CharacterSeriesEntity) => {
          const avatarUrl = c.avatar;
          if (avatarUrl) {
            b1Assets.push({
              id: c.id,
              name: `Portrait: ${c.name}`,
              type: 'character',
              status: 'completed',
              url: avatarUrl,
              thumbnail: avatarUrl,
            });
          }
          (c.wardrobe_variants || []).forEach((w: CharacterWardrobeVariant) => {
            if (w.image_url) {
              b1Assets.push({
                id: `${c.id}_${w.variant_id}`,
                name: `Wardrobe: ${c.name} (${w.name})`,
                type: 'wardrobe',
                status: 'completed',
                url: w.image_url,
                thumbnail: w.image_url,
              });
            }
          });
        });

        await updateStep('b1', 'completed', 100, 20, 'Step B1 completed: Cast & Wardrobes ready', {
          characters: charRes.data,
          wardrobes: wardrobeRes.data,
        }, b1Assets);
        const epAfterB1 = await db.getEpisodeById(episode_id);
        if (epAfterB1) PatchSyncService.broadcast(series_id, 'episode:updated', epAfterB1);
        await addLog('info', 'Step B1 completed successfully.');
      }

      // ─── STEP B2: ASSETS & SCENE STORYBOARDS ───────────────────────────────
      if (type === 'full_pipeline' || type === 'step_b2') {
        if (!this.activeRuns.get(job_id)) return;
        await updateStep('b2', 'running', 20, 30, 'Step B2: Generating Storyboard Keyframes (Preserving existing locations/props)...');
        await addLog('info', 'Executing Step B2: Assets & Storyboards (Preserving existing series locations & props)');

        // In full_pipeline mode, preserve existing location concepts, prop assets, and storyboards across episodes.
        // Storyboards are only force regenerated if running a dedicated step_b2 job with force_regenerate = true.
        const locForce = type === 'step_b2' ? force_regenerate : false;
        const propForce = type === 'step_b2' ? force_regenerate : false;
        const sbForce = type === 'step_b2' ? force_regenerate : false;

        const locRes = await AssetToolExecutors.generateLocationAsset({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: locForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b2', item.asset, item.current, item.total, 20, 25, item.description);
          },
        });
        const propRes = await AssetToolExecutors.generatePropAsset({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: propForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b2', item.asset, item.current, item.total, 25, 30, item.description);
          },
        });
        const sbRes = await AssetToolExecutors.generatePipelineEpisodeStoryboard({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: sbForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b2', item.asset, item.current, item.total, 30, 45, item.description);
          },
        });

        if (!sbRes.success) {
          throw new Error(`Step B2 Failed: ${sbRes.message}`);
        }

        // Collect AssetJobItems for B2
        const seriesAfterB2: SeriesEntity | null = await db.getSeriesById(series_id);
        const epAfterB2: EpisodeEntity | null = await db.getEpisodeById(episode_id);
        const b2Assets: AssetJobItem[] = [];

        (seriesAfterB2?.locations || []).forEach((l: LocationAsset) => {
          const locUrl = l.image_url;
          if (locUrl) {
            b2Assets.push({
              id: l.id,
              name: `Location: ${l.name}`,
              type: 'location',
              status: 'completed',
              url: locUrl,
              thumbnail: locUrl,
            });
          }
        });

        (seriesAfterB2?.props || []).forEach((p: PropAsset) => {
          const propUrl = p.image_url;
          if (propUrl) {
            b2Assets.push({
              id: p.id,
              name: `Prop: ${p.name}`,
              type: 'prop',
              status: 'completed',
              url: propUrl,
              thumbnail: propUrl,
            });
          }
        });

        (epAfterB2?.scenes || []).forEach((s: SceneEntity) => {
          const startImg = s.storyboard_frame_url;
          if (startImg) {
            b2Assets.push({
              id: `sb_${episode_id}_s${s.index}`,
              name: `Scene #${s.index} Storyboard (Start)`,
              type: 'storyboard',
              status: 'completed',
              url: startImg,
              thumbnail: startImg,
              scene_index: s.index,
            });
          }
          const endImg = s.storyboard_end_frame_url;
          if (endImg && endImg !== startImg) {
            b2Assets.push({
              id: `sb_end_${episode_id}_s${s.index}`,
              name: `Scene #${s.index} Storyboard (End)`,
              type: 'storyboard',
              status: 'completed',
              url: endImg,
              thumbnail: endImg,
              scene_index: s.index,
            });
          }
        });

        await updateStep('b2', 'completed', 100, 45, 'Step B2 completed: Storyboards and Assets ready', {
          locations: locRes.data,
          props: propRes.data,
          storyboards: sbRes.data,
        }, b2Assets);
        if (epAfterB2) PatchSyncService.broadcast(series_id, 'episode:updated', epAfterB2);
        await addLog('info', 'Step B2 completed successfully.');
      }

      // ─── STEP B3: AI SCENE VIDEO CLIPS ─────────────────────────────────────
      if (type === 'full_pipeline' || type === 'step_b3') {
        if (!this.activeRuns.get(job_id)) return;
        await updateStep('b3', 'running', 40, 55, 'Step B3: Synthesizing AI Video Clips from Storyboards...');
        await addLog('info', 'Executing Step B3: AI Video Clips');

        const vidForce = type === 'step_b3' ? force_regenerate : false;
        const vidRes = await VideoToolExecutors.generateSceneVideo({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: vidForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b3', item.asset, item.current, item.total, 45, 70, item.description);
          },
        });
        if (!vidRes.success) {
          throw new Error(`Step B3 Failed: ${vidRes.message}`);
        }

        const epAfterB3: EpisodeEntity | null = await db.getEpisodeById(episode_id);
        const scenesAfterB3 = epAfterB3?.scenes || [];
        const missingVideoScenes = scenesAfterB3.filter((s: SceneEntity) => !s.video_url);
        if (missingVideoScenes.length > 0) {
          const missingIndices = missingVideoScenes.map((s: SceneEntity) => `#${s.index || s.scene_number}`).join(', ');
          throw new Error(`Step B3 Failed: Video generation missing or failed for scene(s) ${missingIndices}. All scenes must have valid video before proceeding.`);
        }

        const b3Assets: AssetJobItem[] = [];
        scenesAfterB3.forEach((s: SceneEntity) => {
          if (s.video_url) {
            b3Assets.push({
              id: `vid_${episode_id}_s${s.index}`,
              name: `Scene #${s.index} Video Clip`,
              type: 'video',
              status: 'completed',
              url: s.video_url,
              thumbnail: s.storyboard_frame_url || '',
              scene_index: s.index,
            });
          }
        });

        await updateStep('b3', 'completed', 100, 70, 'Step B3 completed: AI Video clips ready', {
          videos: vidRes.data,
        }, b3Assets);
        if (epAfterB3) PatchSyncService.broadcast(series_id, 'episode:updated', epAfterB3);
        await addLog('info', 'Step B3 completed successfully.');
      }

      // ─── STEP B4: VOICEOVER TTS & DUBBING ──────────────────────────────────
      if (type === 'full_pipeline' || type === 'step_b4') {
        if (!this.activeRuns.get(job_id)) return;
        await updateStep('b4', 'running', 60, 75, 'Step B4: Synthesizing Voiceovers and Dialogue TTS...');
        await addLog('info', 'Executing Step B4: Voiceover & TTS');

        const audioForce = type === 'step_b4' ? force_regenerate : false;
        const audioRes = await AudioToolExecutors.generateSceneVoiceover({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: audioForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b4', item.asset, item.current, item.total, 70, 82, item.description);
          },
        });
        if (!audioRes.success) {
          throw new Error(`Step B4 Failed: ${audioRes.message}`);
        }

        const epAfterB4: EpisodeEntity | null = await db.getEpisodeById(episode_id);
        const b4Assets: AssetJobItem[] = [];
        (epAfterB4?.scenes || []).forEach((s: SceneEntity) => {
          if (s.voiceover_url) {
            b4Assets.push({
              id: `voice_${episode_id}_s${s.index}`,
              name: `Scene #${s.index} Voiceover`,
              type: 'voice',
              status: 'completed',
              url: s.voiceover_url,
              scene_index: s.index,
            });
          }
        });

        await updateStep('b4', 'completed', 100, 82, 'Step B4 completed: Voiceovers ready', {
          voiceovers: audioRes.data,
        }, b4Assets);
        if (epAfterB4) PatchSyncService.broadcast(series_id, 'episode:updated', epAfterB4);
        await addLog('info', 'Step B4 completed successfully.');
      }

      // ─── STEP B5: SUBTITLES & WORD-BY-WORD ALIGNMENT ───────────────────────
      if (type === 'full_pipeline' || type === 'step_b5') {
        if (!this.activeRuns.get(job_id)) return;
        await updateStep('b5', 'running', 75, 88, 'Step B5: Building Word-Level Kinetic Subtitles...');
        await addLog('info', 'Executing Step B5: Word-by-Word Subtitles');

        const capForce = type === 'step_b5' ? force_regenerate : false;
        const capRes = await CaptionToolExecutors.generateSceneCaption({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: capForce,
          onItemProgress: async (item) => {
            await appendItemProgress('b5', item.asset, item.current, item.total, 82, 92, item.description);
          },
        });
        if (!capRes.success) {
          throw new Error(`Step B5 Failed: ${capRes.message}`);
        }

        const epAfterB5: EpisodeEntity | null = await db.getEpisodeById(episode_id);
        const b5Assets: AssetJobItem[] = [];
        (epAfterB5?.scenes || []).forEach((s: SceneEntity) => {
          if (s.dialogue && s.dialogue.length > 0) {
            b5Assets.push({
              id: `sub_${episode_id}_s${s.index}`,
              name: `Scene #${s.index} Subtitle`,
              type: 'subtitle',
              status: 'completed',
              scene_index: s.index,
            });
          }
        });

        await updateStep('b5', 'completed', 100, 92, 'Step B5 completed: Subtitles synchronized', {
          captions: capRes.data,
        }, b5Assets);
        if (epAfterB5) PatchSyncService.broadcast(series_id, 'episode:updated', epAfterB5);
        await addLog('info', 'Step B5 completed successfully.');
      }

      // ─── STEP B6: COMPOSITOR VIDEO RENDER / EXPORT ─────────────────────────
      if (type === 'full_pipeline' || type === 'step_b6') {
        if (!this.activeRuns.get(job_id)) return;
        await updateStep('b6', 'running', 90, 95, 'Step B6: Compositing Final High-Definition Master Video...');
        await addLog('info', 'Executing Step B6: Final Video Compositor');

        const renderRes = await RenderToolExecutors.renderEpisodeVideo({
          userId: user_id,
          seriesId: series_id,
          episodeId: episode_id,
          forceRegenerate: force_regenerate,
          pipelineJobId: job_id,
        });
        if (!renderRes.success) {
          throw new Error(`Step B6 Failed: ${renderRes.message}`);
        }

        const epAfterB6: EpisodeEntity | null = await db.getEpisodeById(episode_id);
        const finalUrl = renderRes.data?.video_url || epAfterB6?.video_url;
        const b6Assets: AssetJobItem[] = [
          {
            id: `render_${job_id}`,
            name: `Episode #${epAfterB6?.episode_number || 1} Final Video`,
            type: 'render',
            status: 'completed',
            url: finalUrl,
            created_at: new Date().toISOString(),
          },
        ];

        await updateStep('b6', 'completed', 100, 100, 'Step B6 completed: Master video exported', {
          final_video: renderRes.data,
        }, b6Assets);
        if (epAfterB6) PatchSyncService.broadcast(series_id, 'episode:updated', epAfterB6);
        await addLog('info', 'Step B6 completed successfully.');
      }

      // ─── JOB COMPLETE ───────────────────────────────────────────────────────
      const finalJob = await db.getPipelineJobById(job_id);
      if (finalJob) {
        const completedJob = await db.updatePipelineJob(job_id, {
          status: 'completed',
          progress: 100,
          current_step: 'All pipeline tasks completed successfully!',
          completed_at: new Date().toISOString(),
        });
        await addLog('info', '🎉 Pipeline job finished successfully with 100% completion.');

        // 1. Broadcast job completion to client
        if (completedJob) {
          PatchSyncService.broadcast(series_id, 'pipeline_job:completed', completedJob);
        }

        // 2. Fetch latest episode state and broadcast to client
        const latestEpisode = await db.getEpisodeById(episode_id);
        if (latestEpisode) {
          PatchSyncService.broadcast(series_id, 'episode:updated', latestEpisode);
        }

        // 3. Option C: Proactively inject assistant completion summary into Chatbot session
        const epTitle = latestEpisode?.title || `Episode #${latestEpisode?.episode_number || 1}`;
        const finalVideoUrl = (latestEpisode as any)?.video_url || finalJob.outputs?.final_video?.video_url;

        let summaryMsg = `🎉 **Automated production completed for ${epTitle}!**\n\n`;
        if (type === 'render') {
          summaryMsg += `Master video has been successfully rendered and published.\n`;
        } else {
          summaryMsg += `All production assets (Character portraits, Storyboard, AI Video Clips, Voiceovers, Subtitles, Master Video) are ready.\n`;
        }
        if (finalVideoUrl) {
          summaryMsg += `\n🎬 **Rendered Video**: [Watch Video](${finalVideoUrl})\n`;
        }

        ChatbotAgent.injectSystemNotification(
          user_id,
          series_id,
          episode_id,
          summaryMsg,
          [
            { label: '🎬 Open Timeline', prompt: 'Open timeline editor for this episode' },
            { label: '📤 Publish Episode', prompt: 'Publish and export this episode video' },
          ]
        );
      }
    } catch (err: any) {
      Logger.error(`[PipelineJobService] Pipeline Job ${job_id} failed: ${err.message}`);
      await addLog('error', `Error: ${err.message}`);
      const failedJob = await db.updatePipelineJob(job_id, {
        status: 'failed',
        error: err.message,
        current_step: `Failed: ${err.message}`,
      });
      if (failedJob) {
        PatchSyncService.broadcast(series_id, 'pipeline_job:updated', failedJob);
      }
      // Broadcast current episode state even if pipeline failed mid-way so user retains created assets
      try {
        const intermediateEpisode = await db.getEpisodeById(episode_id);
        if (intermediateEpisode) {
          PatchSyncService.broadcast(series_id, 'episode:updated', intermediateEpisode);
        }
      } catch (e) {
        // ignore
      }
    } finally {
      this.activeRuns.delete(job_id);
    }
  }

  /**
   * Cancel a currently running pipeline job
   */
  public static async cancelJob(job_id: string): Promise<boolean> {
    this.activeRuns.delete(job_id);
    const db = await getDatabaseProvider();
    const job = await db.getPipelineJobById(job_id);
    if (!job) return false;

    const stepProgress = (job.step_progress || {}) as Record<string, any>;
    for (const [key, step] of Object.entries(stepProgress)) {
      const s = step as any;
      if (s && (s.status === 'running' || s.status === 'pending')) {
        stepProgress[key] = {
          ...s,
          status: 'cancelled',
          message: s.status === 'running' ? 'Cancelled during execution' : 'Skipped / Cancelled',
        };
      }
    }

    const logs = job.logs || [];
    logs.push({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'Job was cancelled by user.',
    });

    const updated = await db.updatePipelineJob(job_id, {
      status: 'cancelled',
      current_step: 'Job cancelled by user',
      step_progress: stepProgress,
      logs,
      completed_at: new Date().toISOString(),
    });
    if (updated) {
      PatchSyncService.broadcast(job.series_id, 'pipeline_job:updated', updated);
    }
    return true;
  }
}


import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { PipelineJobService } from '@/services/PipelineJobService.js';
import { getUserId } from '@/utils/auth.js';
import { Logger } from '@/utils/logger.js';

export const jobsRouter = Router();

// GET /api/jobs/active — Get active and recent pipeline jobs for an episode, series, or all series
jobsRouter.get('/active', async (req: Request, res: Response) => {
  try {
    const user_id = getUserId(req);
    const rawSeriesId = req.query.series_id as string;
    const rawEpisodeId = req.query.episode_id as string;
    const series_id = (!rawSeriesId || rawSeriesId === 'all' || rawSeriesId === 'undefined') ? undefined : rawSeriesId.trim();
    const episode_id = (!rawEpisodeId || rawEpisodeId === 'all' || rawEpisodeId === 'undefined') ? undefined : rawEpisodeId.trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);

    const db = await getDatabaseProvider();
    let jobs = await db.getPipelineJobs({
      user_id: user_id || undefined,
      series_id: series_id || undefined,
      episode_id: episode_id || undefined,
      limit,
    });

    // If user has no jobs under specific user_id (e.g. admin or workspace jobs), load workspace jobs
    // if ((!jobs || jobs.length === 0) && user_id) {
    //   jobs = await db.getPipelineJobs({
    //     series_id: series_id || undefined,
    //     episode_id: episode_id || undefined,
    //     limit,
    //   });
    // }

    // Enrich jobs with series_title and episode_title if missing
    const seriesCache = new Map<string, string>();
    const episodeCache = new Map<string, string>();

    const enrichedJobs = await Promise.all(
      (jobs || []).map(async (j) => {
        let seriesTitle = (j as any).series_title;
        let episodeTitle = (j as any).episode_title;

        if (!seriesTitle && j.series_id) {
          if (seriesCache.has(j.series_id)) {
            seriesTitle = seriesCache.get(j.series_id);
          } else {
            try {
              const s = await db.getSeriesById(j.series_id);
              if (s?.title) {
                seriesTitle = s.title;
                seriesCache.set(j.series_id, s.title);
              }
            } catch {}
          }
        }

        if (!episodeTitle && j.episode_id) {
          if (episodeCache.has(j.episode_id)) {
            episodeTitle = episodeCache.get(j.episode_id);
          } else {
            try {
              const ep = await db.getEpisodeById(j.episode_id);
              if (ep) {
                episodeTitle = ep.title || (ep.episode_number ? `Episode ${ep.episode_number}` : 'Episode 1');
                episodeCache.set(j.episode_id, episodeTitle);
              }
            } catch {}
          }
        }

        return {
          ...j,
          series_title: seriesTitle || (j as any).seriesTitle || 'Untitled Series',
          episode_title: episodeTitle || (j as any).episodeTitle || 'Episode 1',
        };
      })
    );

    const activeJob = enrichedJobs.find(j => j.status === 'running' || j.status === 'queued') || null;

    return res.json({
      code: 200,
      data: {
        active_job: activeJob,
        jobs: enrichedJobs,
      },
      message: 'Active pipeline jobs fetched successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// GET /api/jobs/:id — Get status and logs of a single job
jobsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const job_id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = await getDatabaseProvider();
    const job = await db.getPipelineJobById(job_id);

    if (!job) {
      return res.status(404).json({ code: 404, data: null, message: `Job ${job_id} not found`, error: 'NOT_FOUND' });
    }

    return res.json({
      code: 200,
      data: job,
      message: 'Job status retrieved successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/jobs/start-pipeline — Trigger asynchronous pipeline job
jobsRouter.post('/start-pipeline', async (req: Request, res: Response) => {
  try {
    const user_id = getUserId(req);
    const { series_id, episode_id, type = 'full_pipeline', force_regenerate = false, session_id, title } = req.body;

    if (!user_id) {
      return res.status(401).json({ code: 401, data: null, message: 'Authentication required: user_id is missing' });
    }
    if (!series_id) {
      return res.status(400).json({ code: 400, data: null, message: 'series_id is required', error: 'INVALID_PAYLOAD' });
    }
    if (!episode_id) {
      return res.status(400).json({ code: 400, data: null, message: 'episode_id is required', error: 'INVALID_PAYLOAD' });
    }

    const { job, is_new } = await PipelineJobService.startOrGetPipelineJob({
      user_id,
      series_id,
      episode_id,
      type,
      force_regenerate: Boolean(force_regenerate),
      session_id,
      title,
    });

    return res.json({
      code: 200,
      data: {
        job,
        is_new,
      },
      message: is_new ? 'Pipeline job started in background' : 'Existing active pipeline job attached',
      error: null,
    });
  } catch (err: any) {
    Logger.error(`[jobsRouter.start-pipeline] Error: ${err.message}`);
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/jobs/:id/cancel — Cancel running pipeline job
jobsRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const success = await PipelineJobService.cancelJob(jobId);
    return res.json({
      code: 200,
      data: { job_id: jobId, cancelled: success },
      message: success ? 'Job cancelled successfully' : 'Job not found',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// DELETE /api/jobs/:id — Delete a pipeline job from database
jobsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = await getDatabaseProvider();
    const success = await db.deletePipelineJob(jobId);
    return res.json({
      code: 200,
      data: { job_id: jobId, deleted: success },
      message: success ? 'Job deleted successfully' : 'Job not found',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/jobs/retry-step — Retry a specific failed step in the pipeline
jobsRouter.post('/retry-step', async (req: Request, res: Response) => {
  try {
    const user_id = getUserId(req);
    const { series_id, episode_id, step, force_regenerate = false } = req.body;

    if (!user_id || !series_id || !episode_id || !step) {
      return res.status(400).json({ code: 400, data: null, message: 'Missing required parameters: series_id, episode_id, step' });
    }

    const type = step === 'render' ? 'render' : `step_${step}`;
    const { job, is_new } = await PipelineJobService.startOrGetPipelineJob({
      user_id,
      series_id,
      episode_id,
      type,
      force_regenerate: Boolean(force_regenerate),
      title: `Retry Step ${String(step).toUpperCase()}`,
    });

    return res.json({
      code: 200,
      data: { job, is_new },
      message: `Step ${step} retry launched in background`,
      error: null,
    });
  } catch (err: any) {
    Logger.error(`[jobsRouter.retry-step] Error: ${err.message}`);
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/jobs/retry-asset — Smart retry for a single specific asset
jobsRouter.post('/retry-asset', async (req: Request, res: Response) => {
  try {
    const user_id = getUserId(req);
    const { series_id, episode_id, asset_type, asset_id, scene_index, name } = req.body;

    if (!user_id || !series_id || !episode_id || !asset_type) {
      return res.status(400).json({ code: 400, data: null, message: 'Missing required parameters: series_id, episode_id, asset_type' });
    }

    const db = await getDatabaseProvider();
    const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');

    // ─── 1. RENDER ASSET: Launch background render job immediately without blocking HTTP ───
    if (asset_type === 'render') {
      const { job, is_new } = await PipelineJobService.startOrGetPipelineJob({
        user_id,
        series_id,
        episode_id,
        type: 'render',
        force_regenerate: true,
        title: `Render Master Video`,
      });

      return res.json({
        code: 200,
        data: {
          job,
          is_new,
          status: 'running',
          type: 'render',
          name: name || 'Episode Final Video',
        },
        message: 'Render job launched in background. Monitoring progress via worker...',
        error: null,
      });
    }

    // ─── 2. OTHER ASSETS: Mark active job as running and update step progress ───
    let stepKey = 'b1';
    if (asset_type === 'character' || asset_type === 'wardrobe') stepKey = 'b1';
    else if (asset_type === 'location' || asset_type === 'prop' || asset_type === 'storyboard') stepKey = 'b2';
    else if (asset_type === 'video') stepKey = 'b3';
    else if (asset_type === 'voice') stepKey = 'b4';
    else if (asset_type === 'subtitle' || asset_type === 'caption') stepKey = 'b5';
    else if (asset_type === 'music' || asset_type === 'bgm') stepKey = 'b4';

    const activeJob = await db.findActivePipelineJob(series_id, episode_id);
    if (activeJob) {
      const stepProg = activeJob.step_progress || {};
      stepProg[stepKey] = {
        ...(stepProg[stepKey] || {}),
        status: 'running',
        message: `Regenerating ${name || asset_type}...`,
      };
      await db.updatePipelineJob(activeJob.id, {
        status: 'running',
        current_step: `Regenerating ${name || asset_type}...`,
        step_progress: stepProg,
      });
      PatchSyncService.broadcast(series_id, 'pipeline_job:updated', {
        ...activeJob,
        status: 'running',
        current_step: `Regenerating ${name || asset_type}...`,
        step_progress: stepProg,
      });
    }

    let result: any = null;

    if (asset_type === 'character' || asset_type === 'wardrobe') {
      const { CharacterToolExecutors } = await import('@/agents/chatbot/tools/character.tools.js');
      result = await CharacterToolExecutors.generateCharacterAsset({
        userId: user_id,
        seriesId: series_id,
        characterId: asset_id,
        characterName: name,
        forceRegenerate: true,
      });
    } else if (asset_type === 'location') {
      const { AssetToolExecutors } = await import('@/agents/chatbot/tools/asset.tools.js');
      result = await AssetToolExecutors.generateLocationAsset({
        userId: user_id,
        seriesId: series_id,
        episodeId: episode_id,
        locationId: asset_id,
        locationName: name,
        forceRegenerate: true,
      });
    } else if (asset_type === 'prop') {
      const { AssetToolExecutors } = await import('@/agents/chatbot/tools/asset.tools.js');
      result = await AssetToolExecutors.generatePropAsset({
        userId: user_id,
        seriesId: series_id,
        episodeId: episode_id,
        propId: asset_id,
        propName: name,
        forceRegenerate: true,
      });
    } else if (asset_type === 'storyboard') {
      const { AssetToolExecutors } = await import('@/agents/chatbot/tools/asset.tools.js');
      result = await AssetToolExecutors.generateSceneStoryboard({
        userId: user_id,
        seriesId: series_id,
        episodeId: episode_id,
        sceneIndex: scene_index || 1,
        forceRegenerate: true,
      });
    } else if (asset_type === 'video') {
      const { VideoToolExecutors } = await import('@/agents/chatbot/tools/video.tools.js');
      result = await VideoToolExecutors.generateSceneVideo({
        userId: user_id,
        seriesId: series_id,
        episodeId: episode_id,
        sceneIndex: scene_index,
        forceRegenerate: true,
      });
    } else if (asset_type === 'voice') {
      const { AudioToolExecutors } = await import('@/agents/chatbot/tools/audio.tools.js');
      result = await AudioToolExecutors.generateSceneVoiceover({
        userId: user_id,
        seriesId: series_id,
        episodeId: episode_id,
        sceneIndex: scene_index,
        forceRegenerate: true,
      });
    } else if (asset_type === 'subtitle' || asset_type === 'caption') {
      const { CaptionToolExecutors } = await import('@/agents/chatbot/tools/caption.tools.js');
      result = await CaptionToolExecutors.generateSceneCaption({
        userId: user_id,
        seriesId: series_id,
        episodeId: episode_id,
        sceneIndex: scene_index,
        forceRegenerate: true,
      });
    } else if (asset_type === 'music' || asset_type === 'bgm') {
      const { AudioToolExecutors } = await import('@/agents/chatbot/tools/audio.tools.js');
      result = await AudioToolExecutors.generateSceneBgm({
        userId: user_id,
        seriesId: series_id,
        episodeId: episode_id,
        sceneIndex: scene_index,
        forceRegenerate: true,
      });
    } else {
      return res.status(400).json({ code: 400, data: null, message: `Unsupported asset_type for retry: ${asset_type}` });
    }

    // Refresh and broadcast latest episode data
    const latestEpisode = await db.getEpisodeById(episode_id);
    if (latestEpisode) {
      PatchSyncService.broadcast(series_id, 'episode:updated', latestEpisode);
    }

    // Update active job status back to completed / updated
    if (activeJob) {
      const stepProg = activeJob.step_progress || {};
      stepProg[stepKey] = {
        ...(stepProg[stepKey] || {}),
        status: 'completed',
        message: `${name || asset_type} regenerated successfully`,
      };
      const updatedJob = await db.updatePipelineJob(activeJob.id, {
        status: 'completed',
        current_step: `${name || asset_type} regenerated successfully`,
        step_progress: stepProg,
      });
      if (updatedJob) {
        PatchSyncService.broadcast(series_id, 'pipeline_job:updated', updatedJob);
      }
    }

    return res.json({
      code: 200,
      data: result,
      message: result?.message || `Asset ${name || asset_id || asset_type} retried successfully`,
      error: null,
    });
  } catch (err: any) {
    Logger.error(`[jobsRouter.retry-asset] Error: ${err.message}`);
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});


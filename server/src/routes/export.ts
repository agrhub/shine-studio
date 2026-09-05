import { Router, Request, Response } from 'express';
import { compositorWorker, CompositorPayload } from '../services/compositor/CompositorWorker.js';

export const exportRouter = Router();

// POST /api/export/render-job — Queue a render job
exportRouter.post('/render-job', (req: Request, res: Response) => {
  try {
    const payload: CompositorPayload = req.body;
    if (!payload.series_id || !payload.episode_id) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: 'seriesId and episodeId are required',
        error: 'INVALID_PAYLOAD',
      });
    }

    const job = compositorWorker.createJob(payload);

    return res.json({
      code: 200,
      data: job,
      message: 'Render job queued successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: err.message || 'Failed to queue render job',
      error: 'SERVER_ERROR',
    });
  }
});

// GET /api/export/render-job/:jobId/status — Poll render job progress
exportRouter.get('/render-job/:jobId/status', (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = compositorWorker.getJobStatus(jobId);


  if (!job) {
    return res.status(404).json({
      code: 404,
      data: null,
      message: 'Render job not found',
      error: 'JOB_NOT_FOUND',
    });
  }

  return res.json({
    code: 200,
    data: job,
    message: job.status === 'completed' ? 'Render complete!' : 'Rendering in progress...',
    error: null,
  });
});

// POST /api/export/parity-check — Calculate SSIM between WebGL preview frame and ffmpeg compositor output
exportRouter.post('/parity-check', (req: Request, res: Response) => {
  const { seriesId, episodeId } = req.body;
  const result = compositorWorker.calculateParityScore(seriesId || 'series-001', episodeId || 'episode-001');

  return res.json({
    code: 200,
    data: result,
    message: 'Parity check complete',
    error: null,
  });
});

// POST /api/export/batch — Dispatch batch render jobs to Google Cloud Run & Pub/Sub
exportRouter.post('/batch', async (req: Request, res: Response) => {
  try {
    const { seriesId, episodeIds, timelineData, outputFormat } = req.body;
    if (!seriesId || !Array.isArray(episodeIds) || episodeIds.length === 0) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: 'seriesId and array of episodeIds are required',
        error: 'INVALID_PAYLOAD',
      });
    }

    const { CloudRunRenderService } = await import('../services/render/CloudRunRenderService.js');
    const cloudRunService = CloudRunRenderService.getInstance();
    const queuedJobs: any[] = [];

    for (const epId of episodeIds) {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const result = await cloudRunService.dispatchRenderJob({
        jobId: jobId,
        seriesId: seriesId,
        episodeId: epId,
        timelineData: timelineData?.[epId] || {},
        outputFormat: outputFormat || 'mp4',
        submittedAt: new Date().toISOString(),
      });
      queuedJobs.push(result);
    }

    return res.status(202).json({
      code: 202,
      data: {
        totalJobs: queuedJobs.length,
        jobs: queuedJobs,
        streamUrl: '/api/export/render/stream',
      },
      message: 'Batch render jobs dispatched to Cloud Run / PubSub queue',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Failed to dispatch batch render: ${err.message}`,
      error: 'BATCH_RENDER_FAILED',
    });
  }
});

// GET /api/export/render/stream — Server-Sent Events (SSE) stream for Pub/Sub render progress
exportRouter.get('/render/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  import('../services/pubsub/PubSubService.js').then(({ PubSubService }) => {
    const pubsub = PubSubService.getInstance();
    const unsubscribe = pubsub.onProgress((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Send initial handshake
    res.write(`data: ${JSON.stringify({ status: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  });
});

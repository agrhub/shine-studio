// Shine Flow AI Worker Gateway
// Trigger reload: smart tab priority & quota checks updated
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local and workspace root .env if available
dotenv.config({ override: true });
const rootEnv = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv, override: true });
}

// Compatible NodeNext CommonJS import
import * as archiverModule from 'archiver';
const archiver = ((archiverModule as any).default || archiverModule) as (format: string, options?: any) => any;
import { accountPool } from './pool/AccountPool.js';
import { ModelContextResolver } from './pool/ModelContextResolver.js';
import { playwrightWorker } from './headless/PlaywrightWorker.js';
import { ExtensionToWorkerMessage, FlowImageItem, GenerationJobRequest, GenerationJobResult } from './types.js';
import { DomRuleStore } from './rules/DomRuleStore.js';

const publicDir = path.resolve(__dirname, '../public');
const extensionDir = path.resolve(__dirname, '../extension');

const PORT = Number(process.env.PORT || process.env.FLOW_WORKER_PORT) || 8088;

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Serve Dashboard UI & Static Assets
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ── WebSocket Handler for Chrome Extension Workers ─────────────────────────────
wss.on('connection', (ws: WebSocket, req) => {
  console.log(`[FlowWorkerServer] 🔌 Incoming WebSocket connection from ${req.socket.remoteAddress}`);
  let registeredAccountId: string | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ExtensionToWorkerMessage;

      if (msg.type === 'REGISTER') {
        registeredAccountId = msg.accountId;
        const regAccount = accountPool.registerExtensionWorker(
          msg.accountId,
          ws,
          msg.label,
          msg.cookies,
          msg.projectId,
          msg.credits,
          msg.hasFlowTab,
          msg.status
        );
        ws.send(JSON.stringify({
          type: 'REGISTERED',
          success: true,
          message: `Account ${msg.accountId} registered.`,
          accountId: msg.accountId,
          credits: regAccount?.credits,
          userPaygateTier: regAccount?.userPaygateTier,
        }));
      } else if (msg.type === 'JOB_RESULT') {
        accountPool.handleJobResult(msg);
      } else if (msg.type === 'SYNC_PROJECT') {
        accountPool.syncProject(msg.accountId, msg.projectId, msg.projectUrl);
      } else if (msg.type === 'CREDIT_UPDATE') {
        if ((msg as any).error) {
          accountPool.handleCreditCheckError(msg.accountId, (msg as any).error, (msg as any).requestId);
        } else if (typeof msg.credits === 'number' && !isNaN(msg.credits)) {
          accountPool.updateCredits(msg.accountId, msg.credits, msg.isQuotaExceeded, (msg as any).userPaygateTier, (msg as any).requestId);
        }
      } else if (msg.type === 'SESSION_EXPIRED') {
        accountPool.markSessionExpired(msg.accountId, msg.reason);
      } else if (msg.type === 'HEARTBEAT' || msg.type === 'TAB_STATUS') {
        if (msg.status) {
          accountPool.updateAccountStatus(msg.accountId, msg.status, msg.hasFlowTab);
        }
        if (msg.projectId) {
          accountPool.syncProject(msg.accountId, msg.projectId, (msg as any).projectUrl);
        }
        if (msg.credits !== undefined) {
          accountPool.updateCredits(msg.accountId, msg.credits);
        }
      }
    } catch (e: any) {
      console.error(`[FlowWorkerServer] Failed to process WS message: ${e.message}`);
    }
  });

  ws.on('close', () => {
    accountPool.disconnectExtensionWorker(ws);
  });

  ws.on('error', (err) => {
    console.error(`[FlowWorkerServer] WS error on account ${registeredAccountId}:`, err.message);
  });
});

// Periodic ping to keep Service Worker / sockets alive
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'PING' }));
    }
  });
}, 20000);

function getFilenameFromUrl(url: string): string {
  if (!url || typeof url !== 'string') return `ref_${Date.now()}.png`;
  try {
    const clean = url.split('?')[0].split('#')[0];
    const filename = clean.substring(clean.lastIndexOf('/') + 1);
    if (filename && filename.length > 2 && filename.includes('.')) {
      return decodeURIComponent(filename);
    }
  } catch (_) {}
  return `ref_${Date.now()}.png`;
}

async function resolveImageItem(input?: string | FlowImageItem): Promise<FlowImageItem | null> {
  if (!input) return null;
  const rawUrl = typeof input === 'string' ? input : input.url;
  if (!rawUrl) return null;

  let name = typeof input === 'object' && input.name ? input.name : getFilenameFromUrl(rawUrl);
  let mimeType = typeof input === 'object' && input.mimeType ? input.mimeType : 'image/png';
  let base64 = typeof input === 'object' && input.base64 ? input.base64 : undefined;

  if (rawUrl.startsWith('data:')) {
    const arr = rawUrl.split(',');
    const detectedMime = arr[0].match(/:(.*?);/)?.[1] || mimeType;
    return { name, url: rawUrl, mimeType: detectedMime, base64: arr[1] };
  }

  try {
    let fetchUrl = rawUrl;
    if (rawUrl.startsWith('/')) {
      fetchUrl = `http://127.0.0.1:3001${rawUrl}`;
    }
    let resp = await fetch(fetchUrl);
    if (!resp.ok && rawUrl.startsWith('/')) {
      // Fallback to Vite dev server port 3000
      const altResp = await fetch(`http://localhost:3000${rawUrl}`);
      if (altResp.ok) resp = altResp;
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = resp.headers.get('content-type') || mimeType;
    const b64 = buffer.toString('base64');
    return {
      name,
      url: `data:${mime};base64,${b64}`,
      mimeType: mime,
      base64: b64,
    };
  } catch (err: any) {
    if (fs.existsSync(rawUrl)) {
      const buffer = fs.readFileSync(rawUrl);
      const ext = path.extname(rawUrl).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
      const b64 = buffer.toString('base64');
      return { name, url: `data:${mime};base64,${b64}`, mimeType: mime, base64: b64 };
    }
    console.warn(`[FlowWorkerServer] Notice pre-converting image (${rawUrl}): ${err.message}`);
    return { name, url: rawUrl, mimeType, base64 };
  }
}

// Helper: execute job through AccountPool with smart context resolution
async function executeGenerationJob(rawJob: Partial<GenerationJobRequest>): Promise<GenerationJobResult> {
  const context = ModelContextResolver.resolve(rawJob);

  // Collect all raw input images
  const allRawImages: Array<string | FlowImageItem> = [
    ...(Array.isArray(rawJob.images) ? rawJob.images : []),
    ...(Array.isArray(rawJob.referenceImages) ? rawJob.referenceImages : []),
    ...(Array.isArray(rawJob.imageInputs) ? rawJob.imageInputs : []),
    ...(Array.isArray(rawJob.characterReferences) ? rawJob.characterReferences : []),
    ...(Array.isArray(rawJob.namedReferences) ? rawJob.namedReferences : []),
    ...(Array.isArray(context.imagesToAttach) ? context.imagesToAttach : []),
    rawJob.imageStart,
    rawJob.imageEnd,
  ].filter(Boolean) as Array<string | FlowImageItem>;

  // Resolve all images to FlowImageItem with base64 Data URLs so Chrome Extension gets them directly
  const resolvedImages: FlowImageItem[] = [];
  const seenUrls = new Set<string>();

  for (const item of allRawImages) {
    const resolved = await resolveImageItem(item);
    if (resolved && resolved.url && !seenUrls.has(resolved.url)) {
      seenUrls.add(resolved.url);
      resolvedImages.push(resolved);
    }
  }

  const resolvedStart = rawJob.imageStart ? await resolveImageItem(rawJob.imageStart) : undefined;
  const resolvedEnd = rawJob.imageEnd ? await resolveImageItem(rawJob.imageEnd) : undefined;

  const job: GenerationJobRequest = {
    jobId: rawJob.jobId || `flow_${context.type === 'image' ? 'img' : 'vid'}_${nanoid(10)}`,
    type: context.type,
    model: rawJob.model || context.resolvedModel,
    resolvedModel: context.resolvedModel,
    prompt: rawJob.prompt || '',
    agentPrompt: context.agentPrompt,
    aspectRatio: context.aspectRatio,
    duration: Number(rawJob.duration) || 5,
    mode: context.mode,
    images: resolvedImages,
    imageStart: resolvedStart || undefined,
    imageEnd: resolvedEnd || undefined,
    referenceImages: resolvedImages,
    characterReferences: rawJob.characterReferences,
    projectId: rawJob.projectId,
    accountId: rawJob.accountId,
    timeoutMs: rawJob.timeoutMs,
    n: Number(rawJob.n || (rawJob as any).count) || 1,
  };

  console.log(`[FlowWorkerServer] 🎯 Resolved context for ${job.jobId}: Mode=${job.mode}, Model=${job.resolvedModel}, Ratio=${job.aspectRatio}, Images=${resolvedImages.length} (${resolvedImages.map(i => i.name).join(', ')})`);

  return await accountPool.executeJob(job);
}

// ── 0. Configurable DOM Rules Endpoints (Auto-Sync for Extension) ────────────
app.get('/v1/rules/dom-selectors', (req: Request, res: Response) => {
  const rules = DomRuleStore.getInstance().getRules();
  res.json({
    code: 200,
    status: 'SUCCESS',
    data: rules,
  });
});

app.post('/v1/rules/dom-selectors', (req: Request, res: Response) => {
  try {
    const updated = DomRuleStore.getInstance().updateRules(req.body.rules || req.body);
    res.json({
      code: 200,
      status: 'SUCCESS',
      message: 'DOM selector rules updated successfully.',
      data: updated,
    });
  } catch (err: any) {
    res.status(500).json({ code: 500, error: err.message });
  }
});

app.post('/v1/rules/dom-selectors/reset', (req: Request, res: Response) => {
  try {
    const reset = DomRuleStore.getInstance().resetToDefault();
    res.json({
      code: 200,
      status: 'SUCCESS',
      message: 'DOM selector rules reset to defaults.',
      data: reset,
    });
  } catch (err: any) {
    res.status(500).json({ code: 500, error: err.message });
  }
});

// ── 1. Model & Discovery Endpoints ───────────────────────────────────────────

app.get('/v1/models', (req: Request, res: Response) => {
  const curated = req.query.curated === 'true';
  const models = curated
    ? ModelContextResolver.getSupportedModels()
    : ModelContextResolver.getAllSupportedModels();

  res.json({
    object: 'list',
    data: models.map(m => ({
      id: m.id,
      object: 'model',
      created: 1741132800,
      owned_by: 'google-flow',
      description: m.name,
      type: m.type,
      mode: m.mode,
      ratio: m.ratio,
      baseModel: (m as any).baseModel || m.id,
    })),
  });
});

// ── 2. OpenAI-Compatible Endpoints ───────────────────────────────────────────

app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const { model = 'veo_3_1_t2v_fast_portrait', messages = [], stream = false, accountId } = req.body;

    let prompt = '';
    const images: string[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        prompt += (prompt ? '\n' : '') + msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            prompt += (prompt ? '\n' : '') + part.text;
          } else if (part.type === 'image_url' && part.image_url?.url) {
            images.push(part.image_url.url);
          }
        }
      }
    }

    if (!prompt.trim() && images.length === 0) {
      return res.status(400).json({ error: { message: 'Prompt or image is required in messages.', type: 'invalid_request_error' } });
    }

    const result = await executeGenerationJob({
      model,
      prompt,
      images,
      accountId,
    });

    if (result.status !== 'SUCCESS' || !result.mediaUrl) {
      return res.status(500).json({ error: { message: result.error || 'Generation failed', type: 'api_error' } });
    }

    const createdTime = Math.floor(Date.now() / 1000);
    const content = result.mediaUrl;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunk = {
        id: `chatcmpl-${result.jobId}`,
        object: 'chat.completion.chunk',
        created: createdTime,
        model,
        choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    return res.json({
      id: `chatcmpl-${result.jobId}`,
      object: 'chat.completion',
      created: createdTime,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      media_url: result.mediaUrl,
    });
  } catch (err: any) {
    console.error(`[FlowWorkerServer] chat/completions error: ${err.message}`);
    const statusCode = err.code === 'NO_ACTIVE_ACCOUNTS' ? 503 : (err.status || 500);
    return res.status(statusCode).json({
      error: {
        message: err.message,
        type: err.code === 'NO_ACTIVE_ACCOUNTS' ? 'no_active_accounts' : 'api_error',
        code: err.code || 'GENERATION_FAILED',
      },
    });
  }
});

app.post('/v1/images/generations', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      model = 'gemini-3.1-flash-image-portrait',
      size = '1024x1024',
      aspectRatio: reqAspectRatio,
      referenceImages,
      images,
      imageInputs,
      namedReferences,
      accountId,
    } = req.body;
    if (!prompt) return res.status(400).json({ error: { message: 'prompt is required', type: 'invalid_request_error' } });

    const allReferences = [
      ...(Array.isArray(referenceImages) ? referenceImages : []),
      ...(Array.isArray(images) ? images : []),
      ...(Array.isArray(imageInputs) ? imageInputs : []),
    ].filter(Boolean);

    let aspectRatio = reqAspectRatio || '1:1';
    if (!reqAspectRatio) {
      if (size.includes('1024x1792') || size.includes('720x1280') || model.includes('portrait')) aspectRatio = '9:16';
      else if (size.includes('1792x1024') || size.includes('1280x720') || model.includes('landscape')) aspectRatio = '16:9';
    }

    const result = await executeGenerationJob({
      type: 'image',
      model,
      prompt,
      aspectRatio,
      images: allReferences,
      referenceImages: allReferences,
      namedReferences,
      accountId,
    });

    if (result.status === 'SUCCESS' && (result.mediaUrl || result.base64Data)) {
      const finalUrl = result.base64Data || result.mediaUrl;
      return res.json({
        created: Math.floor(Date.now() / 1000),
        data: [{ url: finalUrl }],
        mediaUrl: result.mediaUrl,
        base64Data: result.base64Data,
      });
    }
    return res.status(500).json({ error: { message: result.error || 'Image generation failed', type: 'api_error' } });
  } catch (err: any) {
    const statusCode = err.code === 'NO_ACTIVE_ACCOUNTS' ? 503 : (err.status || 500);
    return res.status(statusCode).json({
      code: statusCode,
      error: err.code || 'IMAGE_GENERATION_FAILED',
      message: err.message,
    });
  }
});

// ── 3. Gemini-Compatible Endpoints ───────────────────────────────────────────

const handleGeminiGenerateContent = async (req: Request, res: Response) => {
  try {
    const modelParam = req.params.model || req.body.model || 'gemini-3.1-flash-image-portrait';
    const model = modelParam.replace(/^models\//, '').replace(/:generateContent$/, '');
    const { contents = [], generationConfig, accountId } = req.body;

    let prompt = '';
    const images: string[] = [];

    for (const content of contents) {
      if (Array.isArray(content.parts)) {
        for (const part of content.parts) {
          if (part.text) {
            prompt += (prompt ? '\n' : '') + part.text;
          }
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            images.push(`data:${mime};base64,${part.inlineData.data}`);
          }
          if (part.fileData?.fileUri) {
            images.push(part.fileData.fileUri);
          }
        }
      }
    }

    const aspectRatio = generationConfig?.imageConfig?.aspectRatio;

    const result = await executeGenerationJob({
      model,
      prompt,
      aspectRatio,
      images,
      accountId,
    });

    if (result.status === 'SUCCESS' && result.mediaUrl) {
      const isVideo = result.mediaUrl.endsWith('.mp4') || model.includes('veo');
      return res.json({
        candidates: [
          {
            content: {
              parts: [
                { text: `Generated: ${result.mediaUrl}` },
                {
                  inlineData: {
                    mimeType: isVideo ? 'video/mp4' : 'image/png',
                    data: result.base64Data || '',
                  },
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        mediaUrl: result.mediaUrl,
      });
    }

    return res.status(500).json({ error: { message: result.error || 'Generation failed', status: 'INTERNAL' } });
  } catch (err: any) {
    const statusCode = err.code === 'NO_ACTIVE_ACCOUNTS' ? 503 : (err.status || 500);
    return res.status(statusCode).json({
      error: {
        message: err.message,
        status: err.code === 'NO_ACTIVE_ACCOUNTS' ? 'UNAVAILABLE' : 'INTERNAL',
        code: statusCode,
      },
    });
  }
};

app.post('/v1beta/models/:model:generateContent', handleGeminiGenerateContent);
app.post('/models/:model:generateContent', handleGeminiGenerateContent);
app.post('/v1beta/models/:model', handleGeminiGenerateContent);
app.post('/models/:model', handleGeminiGenerateContent);

// ── 4. Direct Dedicated Video/Image Endpoint for FlowAdapter.ts ───────────────

const handleVideoGeneration = async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      aspectRatio,
      duration = 5,
      images,
      imageStart,
      imageEnd,
      referenceImages,
      characterReferences,
      characterImages,
      namedReferences,
      model = 'veo_3_1_t2v_fast_portrait',
      accountId,
      projectId,
      timeoutMs,
      async: isAsyncRequest,
    } = req.body;

    const allReferences = [
      ...(Array.isArray(referenceImages) ? referenceImages : []),
      ...(Array.isArray(characterReferences) ? characterReferences : []),
      ...(Array.isArray(characterImages) ? characterImages : []),
      ...(Array.isArray(images) ? images : [])
    ].filter(Boolean);

    // If caller requested async execution, enqueue and return jobId immediately
    if (isAsyncRequest) {
      const jobId = `flow_async_${nanoid(10)}`;
      executeGenerationJob({
        jobId,
        type: 'video',
        model,
        prompt,
        aspectRatio,
        duration,
        images: allReferences,
        imageStart: imageStart || undefined,
        imageEnd: imageEnd || undefined,
        referenceImages: allReferences.slice(0, 3),
        characterReferences: characterReferences || characterImages,
        namedReferences,
        accountId,
        projectId,
        timeoutMs,
      }).catch(e => console.error(`[AsyncJob] Job ${jobId} failed:`, e.message));

      return res.json({
        code: 202,
        status: 'ACCEPTED',
        jobId,
        message: 'Job enqueued for execution. Poll /v1/jobs/' + jobId + ' for results.',
      });
    }

    const result = await executeGenerationJob({
      type: 'video',
      model,
      prompt,
      aspectRatio,
      duration,
      images: allReferences,
      imageStart: imageStart || undefined,
      imageEnd: imageEnd || undefined,
      referenceImages: allReferences.slice(0, 3),
      characterReferences: characterReferences || characterImages,
      namedReferences,
      accountId,
      projectId,
      timeoutMs,
    });

    if (result.status === 'SUCCESS') {
      return res.json({ code: 200, data: result, mediaUrl: result.mediaUrl, jobId: result.jobId });
    }
    return res.status(500).json({ code: 500, error: 'GENERATION_FAILED', message: result.error, data: result });
  } catch (err: any) {
    const statusCode = err.code === 'NO_ACTIVE_ACCOUNTS' ? 503 : (err.status || 500);
    return res.status(statusCode).json({
      code: statusCode,
      error: err.code || 'WORKER_ERROR',
      message: err.message,
    });
  }
};

app.post('/v1/video/generations', handleVideoGeneration);
app.post('/v1/videos/generations', handleVideoGeneration);

app.get('/v1/jobs', (_req: Request, res: Response) => {
  const jobs = accountPool.listAllJobs();
  res.json({ code: 200, data: jobs, ...jobs });
});

app.get('/v1/jobs/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const status = accountPool.getJobStatus(jobId);
  if (!status) {
    return res.status(404).json({ code: 404, error: 'NOT_FOUND', message: `Job ${jobId} not found` });
  }
  res.json({ code: 200, data: status });
});

app.get('/v1/queue', (_req: Request, res: Response) => {
  const stats = accountPool.getQueueStats();
  res.json({ code: 200, data: stats });
});

app.get('/v1/history', (_req: Request, res: Response) => {
  const jobs = accountPool.listAllJobs();
  const history = jobs.history
    .filter(h => h.status === 'SUCCESS' && (h.mediaUrl || h.base64Data))
    .map(h => ({
      id: h.jobId,
      url: h.mediaUrl || h.base64Data,
      type: h.type === 'video' ? 'video' : 'image',
      prompt: h.prompt,
      model: h.model,
      aspectRatio: h.aspectRatio,
      timestamp: Math.floor((h.completedAt || h.createdAt || Date.now()) / 1000),
      durationMs: h.durationMs,
      accountId: h.accountId,
    }));
  res.json({ code: 200, history, data: history });
});

app.delete('/v1/history', (_req: Request, res: Response) => {
  accountPool.clearJobHistory();
  res.json({ code: 200, success: true, message: 'Jobs history cleared' });
});

// ── 6. Dashboard & Extension Download Endpoints ───────────────────────────────

app.get('/', (_req: Request, res: Response) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.json({
    name: 'Shine Flow AI Worker',
    status: 'online',
    version: '1.2.0',
    documentation: '/health',
  });
});

app.get('/api/download-extension', (_req: Request, res: Response) => {
  if (!fs.existsSync(extensionDir)) {
    return res.status(404).json({ error: 'Extension directory not found' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="shine-flow-extension.zip"');

  const zipFn = (archiverModule as any).ZipArchive 
    ? new (archiverModule as any).ZipArchive({ zlib: { level: 9 } })
    : (typeof (archiverModule as any).default === 'function' ? (archiverModule as any).default('zip', { zlib: { level: 9 } }) : (archiverModule as any)('zip', { zlib: { level: 9 } }));
  const archive = zipFn;

  archive.on('error', (err: any) => {
    console.error('[FlowWorkerServer] Error zipping extension:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to archive extension' });
    }
  });

  archive.pipe(res);
  archive.directory(extensionDir, false);
  archive.finalize();
});

// ── 7. Management, Accounts & Health ─────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  const accounts = accountPool.listAccounts();
  const onlineCount = accountPool.getCapableActiveWorkersCount();
  const queueStats = accountPool.getQueueStats();
  const headlessEnabled = accountPool.isHeadlessEnabled();

  res.json({
    status: 'ok',
    service: 'shine-flow-worker',
    headlessEnabled,
    port: PORT,
    protocols: ['OpenAI /v1/chat/completions', 'Gemini /models/:model:generateContent', 'Direct /v1/video/generations'],
    accountsCount: accounts.length,
    activeWorkersCount: onlineCount,
    queue: queueStats,
    timestamp: new Date().toISOString(),
  });
});

app.get('/v1/accounts', (_req: Request, res: Response) => {
  const accounts = accountPool.listAccounts();
  res.json({ code: 200, data: accounts, accounts });
});

app.post('/v1/accounts', (req: Request, res: Response) => {
  const { accountId, label, projectId, workerType, credits, cookies } = req.body;
  if (!accountId) {
    return res.status(400).json({ code: 400, error: 'accountId is required' });
  }
  const account = accountPool.createAccount({
    accountId,
    label,
    projectId,
    workerType,
    credits: credits !== undefined ? Number(credits) : 100,
    cookies,
  });
  res.json({ code: 200, message: `Account ${accountId} created/updated successfully`, data: account });
});

app.delete('/v1/accounts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const success = accountPool.deleteAccount(id);
  if (!success) {
    return res.status(404).json({ code: 404, error: `Account ${id} not found` });
  }
  res.json({ code: 200, message: `Account ${id} deleted successfully` });
});

app.post('/v1/accounts/:id/verify', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await accountPool.verifyAccount(id);
    if (!result.success) {
      return res.status(400).json({ code: 400, success: false, error: result.error });
    }
    res.json({
      code: 200,
      success: true,
      message: `Account ${id} verified successfully via Headless Playwright!`,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ code: 500, success: false, error: err.message });
  }
});

app.post('/v1/accounts/sync-session', (req: Request, res: Response) => {
  const { accountId, label, cookies } = req.body;
  if (!accountId || !Array.isArray(cookies)) {
    return res.status(400).json({ code: 400, error: 'accountId and cookies array are required' });
  }
  accountPool.syncCookies(accountId, cookies, label);
  res.json({ code: 200, message: `Successfully synced ${cookies.length} cookies for ${accountId}` });
});

app.post('/v1/accounts/:id/project', (req: Request, res: Response) => {
  const { id } = req.params;
  const { projectId, projectUrl } = req.body;
  if (!projectId) {
    return res.status(400).json({ code: 400, error: 'projectId is required' });
  }
  accountPool.syncProject(id, projectId, projectUrl);
  res.json({ code: 200, message: `Updated project for ${id} to ${projectId}` });
});

app.post('/v1/accounts/:id/refresh-credits', (req: Request, res: Response) => {
  const { id } = req.params;
  const { credits, isQuotaExceeded } = req.body;
  accountPool.updateCredits(id, Number(credits) || 0, Boolean(isQuotaExceeded));
  res.json({ code: 200, message: `Updated credit balance for ${id}` });
});

app.post(['/v1/accounts/:id/sync-credits', '/v1/accounts/:id/check-credits'], async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await accountPool.requestCreditCheck(id);
    return res.json({
      code: 200,
      success: true,
      accountId: id,
      credits: result.credits,
      isQuotaExceeded: result.isQuotaExceeded,
      message: `Account ${id} credits successfully synced: ${result.credits} credits.`,
      data: result,
    });
  } catch (err: any) {
    console.error(`[FlowWorkerServer] Credit sync error for account ${id}:`, err.message);
    const status = err.status || 500;
    return res.status(status).json({
      code: status,
      success: false,
      error: err.message || 'CREDIT_SYNC_FAILED',
    });
  }
});

// ── 8. Job Management & Asset History ────────────────────────────────────────

app.get('/v1/jobs', (_req: Request, res: Response) => {
  const data = accountPool.listAllJobs();
  res.json({ code: 200, data });
});

app.get('/v1/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const status = accountPool.getJobStatus(id);
  if (!status) {
    return res.status(404).json({ code: 404, error: `Job ${id} not found` });
  }
  res.json({ code: 200, data: status });
});

app.delete('/v1/jobs', (_req: Request, res: Response) => {
  accountPool.clearJobHistory();
  res.json({ code: 200, message: 'All job history cleared successfully' });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Shine Flow Worker running on http://localhost:${PORT}`);
  console.log(`⚙️ Headless Runner:  ${accountPool.isHeadlessEnabled() ? 'ENABLED (Playwright Fallback)' : 'DISABLED (Extension Only)'}`);
  console.log(`📡 OpenAI Endpoint:  POST http://localhost:${PORT}/v1/chat/completions`);
  console.log(`🧩 Gemini Endpoint:  POST http://localhost:${PORT}/v1beta/models/{model}:generateContent`);
  console.log(`🎬 Direct Endpoint:  POST http://localhost:${PORT}/v1/video/generations`);
  console.log(`🔌 WebSocket Gateway ready on ws://localhost:${PORT}/ws`);
  console.log(`=======================================================`);
});

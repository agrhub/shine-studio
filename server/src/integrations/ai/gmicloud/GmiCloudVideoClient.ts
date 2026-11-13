import { Logger } from '@/utils/logger.js';

/**
 * GMI Cloud video generation (Request Queue API): Seedance, Kling, Wan and the
 * other video models GMI Cloud serves. Same API as the Genblaze GMI connector
 * used by AntStudio, called directly so Shine does not need the SDK.
 *
 * Enabled by GMI_API_KEY. Used by AIProviderRouter when a video model is
 * requested as "gmi:<model>", and as a fallback when Veo returns nothing.
 */

export const DEFAULT_GMI_QUEUE_URL = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';
export const DEFAULT_GMI_VIDEO_MODEL = 'seedance-2-0-260128';
export const GMI_MODEL_PREFIX = 'gmi:';

export interface GmiVideoOptions {
  model?: string;
  aspectRatio?: '9:16' | '1:1' | '16:9';
  durationSeconds?: number;
  /** Public URL of a start frame, for image-to-video models. */
  imageUrl?: string;
}

export interface GmiVideoResult {
  url: string;
  model: string;
  requestId: string;
}

interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

export function isGmiConfigured(): boolean {
  return !!process.env.GMI_API_KEY;
}

/** "gmi:seedance-…" → "seedance-…"; anything else → null. */
export function gmiModelFromId(model?: string): string | null {
  if (!model || !model.toLowerCase().startsWith(GMI_MODEL_PREFIX)) return null;
  return model.slice(GMI_MODEL_PREFIX.length).trim() || DEFAULT_GMI_VIDEO_MODEL;
}

/** First media URL in a finished request's outcome (current and legacy shapes). */
export function extractGmiMediaUrl(outcome: any): string | null {
  const media = outcome?.media_urls;
  if (Array.isArray(media)) {
    for (const entry of media) {
      if (typeof entry === 'string' && entry) return entry;
      if (entry && typeof entry === 'object' && entry.url) return String(entry.url);
    }
  }
  for (const key of ['video_url', 'url']) {
    if (outcome?.[key]) return String(outcome[key]);
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GmiCloudVideoClient {
  private readonly config: ClientConfig;

  constructor(config: Partial<ClientConfig> = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.GMI_API_KEY ?? '',
      baseUrl: (config.baseUrl ?? process.env.GMI_QUEUE_BASE_URL ?? DEFAULT_GMI_QUEUE_URL).replace(/\/+$/, ''),
      pollIntervalMs: config.pollIntervalMs ?? 5_000,
      timeoutMs: config.timeoutMs ?? 10 * 60_000,
    };
  }

  private headers(): Record<string, string> {
    if (!this.config.apiKey) throw new Error('GMI Cloud is not configured (GMI_API_KEY is empty).');
    return { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' };
  }

  async generateVideo(prompt: string, options: GmiVideoOptions = {}): Promise<GmiVideoResult> {
    const model = options.model || process.env.GMI_VIDEO_MODEL || DEFAULT_GMI_VIDEO_MODEL;
    const payload: Record<string, any> = {
      prompt,
      aspect_ratio: options.aspectRatio || '9:16',
      duration: Math.max(1, Math.round(options.durationSeconds || 5)),
    };
    if (options.imageUrl && /^https?:\/\//.test(options.imageUrl)) payload.image = options.imageUrl;

    const submit = await fetch(`${this.config.baseUrl}/requests`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model, payload }),
    });
    if (!submit.ok) {
      throw new Error(`GMI Cloud rejected the request (HTTP ${submit.status}): ${(await submit.text()).slice(0, 300)}`);
    }
    const submitted: any = await submit.json();
    const requestId = submitted?.request_id || submitted?.id;
    if (!requestId) throw new Error('GMI Cloud did not return a request id.');
    Logger.info(`[GMI Cloud] Video request ${requestId} queued (${model})`);

    const deadline = Date.now() + this.config.timeoutMs;
    while (Date.now() < deadline) {
      await sleep(this.config.pollIntervalMs);
      const poll = await fetch(`${this.config.baseUrl}/requests/${encodeURIComponent(requestId)}`, { headers: this.headers() });
      if (!poll.ok) {
        // Transient poll errors are retried until the deadline; auth errors are not.
        if (poll.status === 401 || poll.status === 403 || poll.status === 404) {
          throw new Error(`GMI Cloud status check failed (HTTP ${poll.status}) for request ${requestId}.`);
        }
        continue;
      }
      const detail: any = await poll.json();
      const status = String(detail?.status || '').toLowerCase();
      if (status === 'success' || status === 'succeeded' || status === 'completed') {
        const url = extractGmiMediaUrl(detail.outcome || detail);
        if (!url) throw new Error(`GMI Cloud request ${requestId} finished without a video URL.`);
        return { url, model, requestId };
      }
      if (status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'error') {
        throw new Error(`GMI Cloud video ${status}: ${detail?.error || detail?.message || 'no details'}`);
      }
    }
    throw new Error(`GMI Cloud video request ${requestId} timed out after ${Math.round(this.config.timeoutMs / 1000)}s.`);
  }
}

export const gmiCloudVideoClient = {
  generateVideo: (prompt: string, options?: GmiVideoOptions) => new GmiCloudVideoClient().generateVideo(prompt, options),
};

import axios from 'axios';
import { Logger } from '@/utils/logger.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';

export interface FlowImageItem {
  name: string;
  url: string;
  mimeType?: string;
}

export interface FlowServiceVideoOptions {
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  duration?: number;
  model?: string;
  images?: Array<string | FlowImageItem>;
  imageStart?: string | FlowImageItem;
  imageEnd?: string | FlowImageItem;
  referenceImages?: Array<string | FlowImageItem>;
  characterReferences?: Array<string | FlowImageItem>;
  namedReferences?: Array<{ name: string; url: string; role?: string }>;
  accountId?: string;
  timeoutMs?: number;
}

export interface FlowServiceImageOptions {
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  model?: string;
  images?: Array<string | FlowImageItem>;
  referenceImages?: Array<string | FlowImageItem>;
  imageInputs?: Array<string | FlowImageItem>;
  characterReferences?: Array<string | FlowImageItem>;
  namedReferences?: Array<{ name: string; url: string; role?: string }>;
  accountId?: string;
  timeoutMs?: number;
}

export interface FlowServiceResult {
  jobId: string;
  status: 'SUCCESS' | 'FAILED';
  mediaUrl?: string;
  durationMs?: number;
  model?: string;
  error?: string;
}

export class FlowServiceClient {
  private workerUrl: string;

  constructor() {
    this.workerUrl = process.env.FLOW_WORKER_URL || 'http://localhost:8088';
  }

  public async isWorkerHealthy(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.workerUrl}/health`, { timeout: 3000 });
      return res.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  public async hasActiveWorkers(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.workerUrl}/health`, { timeout: 3000 });
      return res.data?.status === 'ok' && (res.data?.activeWorkersCount || 0) > 0;
    } catch {
      return false;
    }
  }

  public async waitForActiveWorker(maxWaitMs = 3500): Promise<boolean> {
    if (await this.hasActiveWorkers()) return true;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(r => setTimeout(r, 600));
      if (await this.hasActiveWorkers()) return true;
    }
    return false;
  }

  public async getAccounts(): Promise<any[]> {
    try {
      const res = await axios.get(`${this.workerUrl}/v1/accounts`, { timeout: 5000 });
      return res.data?.data || [];
    } catch (err: any) {
      Logger.warn(`[FlowServiceClient] Failed to fetch accounts from worker: ${err.message}`);
      return [];
    }
  }

  public async getModels(): Promise<any[]> {
    try {
      const res = await axios.get(`${this.workerUrl}/v1/models`, { timeout: 5000 });
      return res.data?.data || [];
    } catch (err: any) {
      Logger.warn(`[FlowServiceClient] Failed to fetch models from worker: ${err.message}`);
      return [];
    }
  }

  // ── Standard OpenAI Chat Completions API ─────────────────────────────────────
  public async chatCompletions(payload: {
    model: string;
    messages: Array<{ role: string; content: any }>;
    stream?: boolean;
    accountId?: string;
  }): Promise<any> {
    try {
      const response = await axios.post(`${this.workerUrl}/v1/chat/completions`, payload, {
        timeout: 300000,
      });
      return response.data;
    } catch (err: any) {
      this.handleApiError(err);
    }
  }

  // ── Standard Gemini generateContent API ──────────────────────────────────────
  public async generateContent(model: string, payload: {
    contents: any[];
    generationConfig?: any;
    systemInstruction?: any;
    accountId?: string;
  }): Promise<any> {
    try {
      const response = await axios.post(`${this.workerUrl}/v1beta/models/${model}:generateContent`, payload, {
        timeout: 300000,
      });
      return response.data;
    } catch (err: any) {
      this.handleApiError(err);
    }
  }

  // ── Helper: Format single image input into { name, url, mimeType } with public URL ──
  public async formatImageItem(input?: string | FlowImageItem): Promise<FlowImageItem | undefined> {
    if (!input) return undefined;
    if (typeof input === 'object' && input.url) {
      const publicUrl = await StorageFactory.resolvePublicUrl(input.url);
      const name = input.name || this.getFilenameFromUrl(publicUrl);
      return {
        name,
        url: publicUrl,
        mimeType: input.mimeType || this.inferMimeType(publicUrl),
      };
    }
    if (typeof input === 'string') {
      const publicUrl = await StorageFactory.resolvePublicUrl(input);
      const name = this.getFilenameFromUrl(publicUrl);
      return {
        name,
        url: publicUrl,
        mimeType: this.inferMimeType(publicUrl),
      };
    }
    return undefined;
  }

  private getFilenameFromUrl(url: string): string {
    if (!url || typeof url !== 'string') return `ref_image_${Date.now()}.png`;
    try {
      const clean = url.split('?')[0].split('#')[0];
      const filename = clean.substring(clean.lastIndexOf('/') + 1);
      if (filename && filename.length > 2 && filename.includes('.')) {
        return decodeURIComponent(filename);
      }
    } catch (_) {}
    return `ref_image_${Date.now()}.png`;
  }

  private inferMimeType(url: string): string {
    const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'mp4') return 'video/mp4';
    return 'image/png';
  }

  // ── Video Generation with References ────────────────────────────────────────
  public async generateVideo(options: FlowServiceVideoOptions): Promise<FlowServiceResult> {
    const mapItems = async (list?: Array<string | FlowImageItem>) => {
      if (!list || list.length === 0) return undefined;
      const formatted: FlowImageItem[] = [];
      for (const item of list) {
        const f = await this.formatImageItem(item);
        if (f) formatted.push(f);
      }
      return formatted.length > 0 ? formatted : undefined;
    };

    const formattedImages = await mapItems(options.images);
    const formattedRefs = await mapItems(options.referenceImages);
    const formattedChars = await mapItems(options.characterReferences);
    const formattedStart = await this.formatImageItem(options.imageStart);
    const formattedEnd = await this.formatImageItem(options.imageEnd);

    const payload: any = {
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      duration: options.duration,
      model: options.model,
      images: formattedImages || formattedRefs,
      referenceImages: formattedRefs || formattedImages,
      characterReferences: formattedChars,
      imageStart: formattedStart,
      imageEnd: formattedEnd,
      accountId: options.accountId,
      timeoutMs: options.timeoutMs,
    };

    const refCount = (payload.referenceImages || payload.images || []).length;
    Logger.info(
      `[FlowServiceClient] Requesting video generation: "${payload.prompt.slice(0, 50)}..." ` +
      `(Ratio: ${payload.aspectRatio || '9:16'}, References: ${refCount}, Model: ${payload.model || 'auto'})`
    );

    try {
      const response = await axios.post(`${this.workerUrl}/v1/video/generations`, payload, {
        timeout: payload.timeoutMs || 4*60*1000,
      });

      if (response.data?.code === 200 && response.data?.data) {
        return response.data.data;
      }

      throw new Error(response.data?.message || 'Flow Worker returned unsuccessful status.');
    } catch (err: any) {
      this.handleApiError(err);
    }
  }

  // ── Image Generation with References ────────────────────────────────────────
  public async generateImage(options: FlowServiceImageOptions): Promise<FlowServiceResult> {
    const allImages = [
      ...(options.images || []),
      ...(options.referenceImages || []),
      ...(options.imageInputs || []),
      ...(options.characterReferences || []),
    ].filter(Boolean);

    const formattedImages: FlowImageItem[] = [];
    const seenUrls = new Set<string>();

    for (const img of allImages) {
      const f = await this.formatImageItem(img);
      if (f && !seenUrls.has(f.url)) {
        seenUrls.add(f.url);
        formattedImages.push(f);
      }
    }

    const payload: any = {
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      model: options.model,
      images: formattedImages,
      referenceImages: formattedImages,
      imageInputs: formattedImages,
      accountId: options.accountId,
      timeoutMs: options.timeoutMs,
    };

    Logger.info(
      `[FlowServiceClient] Requesting image generation: "${payload.prompt.slice(0, 50)}..." ` +
      `(Ratio: ${payload.aspectRatio || '9:16'}, References: ${formattedImages.length}, Model: ${payload.model || 'auto'})`
    );

    try {
      const response = await axios.post(`${this.workerUrl}/v1/images/generations`, payload, {
        timeout: payload.timeoutMs || 3*60*1000,
      });

      if (response.data?.data && response.data.data[0]?.url) {
        return {
          jobId: response.data.id || `img_${Date.now()}`,
          status: 'SUCCESS',
          mediaUrl: response.data.data[0].url,
          model: payload.model,
        };
      }

      if (response.data?.mediaUrl) {
        return {
          jobId: response.data.jobId || `img_${Date.now()}`,
          status: 'SUCCESS',
          mediaUrl: response.data.mediaUrl,
          model: payload.model,
        };
      }

      throw new Error(response.data?.message || response.data?.error?.message || 'Image generation failed');
    } catch (err: any) {
      this.handleApiError(err);
    }
  }

  private handleApiError(err: any): never {
    if (err.response?.data?.error?.message) {
      throw new Error(`[Flow Worker Error] ${err.response.data.error.message}`);
    }
    if (err.response?.data?.message) {
      throw new Error(`[Flow Worker Error] ${err.response.data.message}`);
    }
    if (err.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to Flow Worker at ${this.workerUrl}. Please ensure "pnpm run flow-worker" is running.`);
    }
    throw err;
  }
}

export const flowServiceClient = new FlowServiceClient();

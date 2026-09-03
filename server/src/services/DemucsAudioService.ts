import axios from 'axios';
import { StorageFactory } from './storage/StorageFactory.js';
import { Logger } from '../utils/logger.js';

import { StemSeparationResult } from '../types.js';

export class DemucsAudioService {
  /**
   * Separates Vocal dialogue and extracts clean Background Music (BGM) stem using Meta Demucs v4 AI Cloud Run Worker.
   */
  public static async separateStem(
    sourceUrl: string,
    options: {
      model?: string;
      twoStems?: string;
    } = {}
  ): Promise<StemSeparationResult> {
    const defaultServiceUrl = 'https://demucs-worker-asmlum4txq-uc.a.run.app';
    const serviceUrl = (process.env.DEMUCS_SERVICE_URL || process.env.DEMUCS_WORKER_URL || process.env.DEMUCS_API_URL || defaultServiceUrl).trim().replace(/\/+$/, '');

    try {
      Logger.info(`[DemucsAudioService] Calling Meta Demucs v4 AI Stem Separator at ${serviceUrl} for: ${sourceUrl}`);

      const resolvedPublicUrl = await StorageFactory.resolvePublicUrl(sourceUrl);
      const isLocalUrl = resolvedPublicUrl.includes('127.0.0.1') || resolvedPublicUrl.includes('localhost') || resolvedPublicUrl.startsWith('/');

      let response: any;

      if (!isLocalUrl && (resolvedPublicUrl.startsWith('http://') || resolvedPublicUrl.startsWith('https://'))) {
        // 1. Direct URL separation for public cloud files
        response = await axios.post(
          `${serviceUrl}/separate`,
          {
            audioUrl: resolvedPublicUrl,
            twoStems: options.twoStems || 'vocals',
            model: options.model || 'htdemucs',
          },
          {
            timeout: 180_000,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } else {
        // 2. Direct multipart buffer upload for local storage files
        Logger.info(`[DemucsAudioService] Streaming local media buffer to Demucs Worker (${serviceUrl}/separate/upload)...`);
        const fileRes = await StorageFactory.getFileBuffer(sourceUrl);
        const fileBuffer = fileRes.buffer;

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'video/mp4' });
        formData.append('file', blob, 'input_media.mp4');
        formData.append('twoStems', options.twoStems || 'vocals');
        formData.append('model', options.model || 'htdemucs');

        response = await axios.post(
          `${serviceUrl}/separate/upload`,
          formData,
          {
            timeout: 180_000,
            headers: { 'Content-Type': 'multipart/form-data' },
          }
        );
      }

      if (response?.data && response.data.success) {
        let cleanBgmUrl = response.data.bgmUrl || '';
        let cleanVocalsUrl = response.data.vocalsUrl || '';

        // Upload separated BGM data to Storage
        if (cleanBgmUrl.startsWith('data:')) {
          const bgmUpload = await StorageFactory.uploadMedia(cleanBgmUrl, 'audio', 'wav', 'audio/wav');
          cleanBgmUrl = `/api/assets/file/${bgmUpload.key}`;
        }

        if (cleanVocalsUrl.startsWith('data:')) {
          const vocUpload = await StorageFactory.uploadMedia(cleanVocalsUrl, 'audio', 'wav', 'audio/wav');
          cleanVocalsUrl = `/api/assets/file/${vocUpload.key}`;
        }

        Logger.info(`[DemucsAudioService] Successfully separated clean BGM stem via Meta Demucs v4 AI: ${cleanBgmUrl}`);
        return {
          bgmUrl: cleanBgmUrl,
          vocalsUrl: cleanVocalsUrl,
          source: 'demucs-cloud-run',
        };
      } else {
        throw new Error(response?.data?.message || 'Demucs worker returned failure');
      }
    } catch (err: any) {
      Logger.warn(`[DemucsAudioService] Demucs AI worker notice: ${err.message}`);
      return {
        bgmUrl: '',
        source: 'demucs-cloud-run',
      };
    }
  }
}

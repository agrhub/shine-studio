import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { Logger } from '@/utils/logger.js';

import { TTSRequest } from '@/types.js';

/**
 * Calculates accurate audio duration in seconds from raw audio buffers (WAV / MP3 / PCM).
 */
export function extractAudioDurationSeconds(bufferOrDataUri: Buffer | string, fallbackText?: string, speed: number = 1.0): number {
  try {
    let buf: Buffer;
    if (typeof bufferOrDataUri === 'string') {
      if (bufferOrDataUri.startsWith('data:')) {
        const base64Data = bufferOrDataUri.split(',')[1];
        buf = Buffer.from(base64Data, 'base64');
      } else {
        buf = Buffer.from(bufferOrDataUri, 'base64');
      }
    } else {
      buf = bufferOrDataUri;
    }

    if (!buf || buf.length === 0) throw new Error('Empty audio buffer');

    // 1. WAV Format (RIFF + WAVE header): byteRate at offset 28
    if (buf.length >= 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
      const byteRate = buf.readUInt32LE(28);
      if (byteRate > 0) {
        const pcmDataLength = Math.max(0, buf.length - 44);
        return Math.max(1, Number((pcmDataLength / byteRate).toFixed(2)));
      }
    }

    // 2. MP3 Format (ID3 tag or 0xFF sync word) - default ~128kbps = 16000 B/s
    if (buf.length > 128) {
      const isMp3 = buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
      if (isMp3) {
        return Math.max(1, Number((buf.length / 16000).toFixed(2)));
      }
    }

    // 3. Raw Gemini 24kHz 16-bit Mono PCM
    const pcmDuration = buf.length / (24000 * 2);
    if (pcmDuration >= 0.5 && pcmDuration <= 600) {
      return Number(pcmDuration.toFixed(2));
    }
  } catch (err: any) {
    Logger.debug(`[AudioDuration] Buffer duration parse fallback: ${err.message}`);
  }

  // Fallback: Word-rate calculation based on standard speech rate (~140 words/min = 2.33 words/sec)
  const textStr = typeof fallbackText === 'string' ? fallbackText : (typeof fallbackText === 'object' ? JSON.stringify(fallbackText) : String(fallbackText || ''));
  const wordCount = textStr.trim().split(/\s+/).filter(Boolean).length;
  const estimated = (Math.max(1, wordCount) / 2.33) / (speed || 1.0);
  return Math.max(1, Number(estimated.toFixed(2)));
}

export class TTSService {
  async generateVoice(req: TTSRequest) {
    let durationSeconds = 2;
    let audioUrl = '';

    try {
      // Generate voice synthesis via AIProviderRouter (auto routes ElevenLabs or Gemini Native Audio)
      const audioResult = await aiProviderRouter.generateAudio(req.text, req.voiceId, {
        emotion: req.emotion,
        speech_tone: req.speech_tone,
        speed: req.speed,
        language: req.language,
      });

      if (audioResult?.url && (audioResult.url.startsWith('http') || audioResult.url.startsWith('data:'))) {
        // Calculate exact audio duration from buffer headers
        durationSeconds = extractAudioDurationSeconds(audioResult.url, req.text, req.speed || 1.0);

        const s3Res = await StorageFactory.uploadMedia(
          audioResult.url,
          'audio',
          'mp3',
          audioResult.mimeType || 'audio/mpeg'
        );
        audioUrl = `/api/assets/file/${s3Res.key}`;
      } else {
        durationSeconds = extractAudioDurationSeconds(Buffer.alloc(0), req.text, req.speed || 1.0);
      }
    } catch (err: any) {
      Logger.warn(`[TTSService] Voice synthesis error: ${err.message}`);
      durationSeconds = extractAudioDurationSeconds(Buffer.alloc(0), req.text, req.speed || 1.0);
    }

    const isSuccess = !!audioUrl && audioUrl.length > 0;
    return {
      audioUrl: audioUrl || '',
      durationSeconds,
      voiceId: req.voiceId,
      status: isSuccess ? 'READY' : 'FAILED',
    };
  }
}

export const ttsService = new TTSService();




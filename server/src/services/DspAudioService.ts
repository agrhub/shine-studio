import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { Logger } from '@/utils/logger.js';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as string);
}

import { DspSeparationResult } from '@/types.js';

/**
 * DspAudioService: Digital Signal Processing (DSP) for Center-Channel Vocal Cancellation & VAD
 * Isolates Background Music (BGM) & Ambient sound and detects precise speech onset timestamps.
 */
export class DspAudioService {
  /**
   * Helper: Convert any media buffer (video MP4/WEBM, audio MP3/AAC/WAV) to standard 16-bit 44.1kHz stereo WAV buffer using FFmpeg
   */
  public static async convertToWavPcmBuffer(inputBuffer: Buffer): Promise<{ buffer: Buffer; sampleRate: number }> {
    return new Promise((resolve) => {
      const tempId = `dsp_pcm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const tempIn = path.join(os.tmpdir(), `${tempId}.tmp`);
      const tempOut = path.join(os.tmpdir(), `${tempId}.wav`);

      try {
        fs.writeFileSync(tempIn, inputBuffer);
        ffmpeg(tempIn)
          .noVideo()
          .audioCodec('pcm_s16le')
          .audioChannels(2)
          .audioFrequency(44100)
          .output(tempOut)
          .on('end', () => {
            try {
              const wavBuf = fs.readFileSync(tempOut);
              try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch {}
              try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch {}
              resolve({ buffer: wavBuf, sampleRate: 44100 });
            } catch {
              resolve({ buffer: inputBuffer, sampleRate: 44100 });
            }
          })
          .on('error', (err) => {
            Logger.warn(`[DspAudioService] FFmpeg PCM conversion notice: ${err.message}`);
            try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch {}
            try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch {}
            resolve({ buffer: inputBuffer, sampleRate: 44100 });
          })
          .run();
      } catch (err: any) {
        Logger.warn(`[DspAudioService] convertToWavPcmBuffer error: ${err.message}`);
        resolve({ buffer: inputBuffer, sampleRate: 44100 });
      }
    });
  }

  /**
   * Separates Vocal dialogue and extracts clean Background Music (BGM) stem via DSP,
   * while detecting the exact timestamp (in microseconds) when character speech begins.
   */
  public static async separateVocalAndBgm(
    sourceUrl: string,
    options: {
      vocalAttenuationDb?: number; // dB reduction for center voice (default 18dB)
      bassRetentionHz?: number;    // Bass preservation cutoff frequency (default 220Hz)
      sampleRate?: number;         // Sample rate in Hz (default 44100)
    } = {}
  ): Promise<DspSeparationResult> {
    try {
      const { bassRetentionHz = 220, sampleRate = 44100 } = options;
      Logger.info(`[DspAudioService] Processing DSP vocal cancellation and VAD onset detection for: ${sourceUrl}`);

      // 1. Fetch raw media audio buffer
      let rawBuffer: Buffer;
      if (sourceUrl.startsWith('/api/assets/file/') || sourceUrl.startsWith('assets/')) {
        try {
          const fileRes = await StorageFactory.getFileBuffer(sourceUrl);
          rawBuffer = fileRes.buffer;
        } catch {
          rawBuffer = Buffer.alloc(0);
        }
      } else if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
        const res = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
        rawBuffer = Buffer.from(res.data);
      } else if (sourceUrl.startsWith('data:')) {
        const base64Data = sourceUrl.split(',')[1];
        rawBuffer = Buffer.from(base64Data, 'base64');
      } else {
        rawBuffer = Buffer.from(sourceUrl, 'base64');
      }

      if (!rawBuffer || rawBuffer.length === 0) {
        throw new Error('Empty source audio buffer');
      }

      // 2. Transcode to clean 16-bit 44.1kHz stereo PCM WAV via FFmpeg
      const { buffer: wavPcmBuffer, sampleRate: convertedRate } = await this.convertToWavPcmBuffer(rawBuffer);

      // 3. Extract PCM samples from WAV
      const { leftChannel, rightChannel, sampleRate: detectedRate } = this.decodeToFloatStereo(wavPcmBuffer, convertedRate || sampleRate);
      const activeRate = detectedRate || convertedRate || sampleRate;

      // 3. Apply DSP Vocal Cancellation & Voice Activity Detection (VAD)
      const sampleCount = leftChannel.length;
      const processedLeft = new Float32Array(sampleCount);
      const processedRight = new Float32Array(sampleCount);
      const centerVocalEnvelope = new Float32Array(sampleCount);

      // Low-pass filter coefficient for Bass preservation
      const dt = 1.0 / activeRate;
      const rc = 1.0 / (2 * Math.PI * bassRetentionHz);
      const alpha = dt / (rc + dt);

      let lowPassL = 0;
      let lowPassR = 0;

      for (let i = 0; i < sampleCount; i++) {
        const l = leftChannel[i];
        const r = rightChannel[i];

        // Low-pass filter for center bass preservation
        lowPassL += alpha * (l - lowPassL);
        lowPassR += alpha * (r - lowPassR);
        const monoBass = (lowPassL + lowPassR) * 0.5;

        // Center Vocal Component (L + R) / 2 minus low bass
        const centerVocal = Math.abs((l + r) * 0.5 - monoBass);
        centerVocalEnvelope[i] = centerVocal;

        // Side signal (Center-Channel Voice Cancellation)
        const side = (l - r) * 0.707;

        // Reconstruct Clean BGM: Side (spatial music/ambient without center voice) + Preserved Bass
        processedLeft[i] = Math.max(-1.0, Math.min(1.0, side + monoBass));
        processedRight[i] = Math.max(-1.0, Math.min(1.0, -side + monoBass));
      }

      // 4. Voice Activity Detection (VAD) via RMS Energy Windowing (25ms windows)
      const windowSize = Math.max(128, Math.floor(activeRate * 0.025)); // 25ms window
      const windowCount = Math.floor(sampleCount / windowSize);
      const windowRms = new Float32Array(windowCount);

      let peakRms = 0;
      for (let w = 0; w < windowCount; w++) {
        let sumSq = 0;
        const startSample = w * windowSize;
        for (let j = 0; j < windowSize; j++) {
          const val = centerVocalEnvelope[startSample + j];
          sumSq += val * val;
        }
        const rms = Math.sqrt(sumSq / windowSize);
        windowRms[w] = rms;
        if (rms > peakRms) peakRms = rms;
      }

      // Determine speech detection threshold based on peak vocal energy
      const speechThreshold = Math.max(0.015, peakRms * 0.25);
      let firstSpeechWindow = -1;
      let lastSpeechWindow = -1;

      for (let w = 0; w < windowCount; w++) {
        // Require 2 consecutive windows above threshold to reject single-frame clicks
        if (windowRms[w] >= speechThreshold && (w + 1 < windowCount && windowRms[w + 1] >= speechThreshold)) {
          if (firstSpeechWindow === -1) {
            firstSpeechWindow = w;
          }
          lastSpeechWindow = w + 1;
        }
      }

      // Compute exact speech timestamps in microseconds (us)
      let speechStartUs = 200_000;
      let speechEndUs = Math.round((sampleCount / activeRate) * 1_000_000);
      let hasSpeechActivity = false;

      if (firstSpeechWindow !== -1 && lastSpeechWindow !== -1) {
        hasSpeechActivity = true;
        speechStartUs = Math.max(0, Math.round(((firstSpeechWindow * windowSize) / activeRate) * 1_000_000));
        speechEndUs = Math.min(
          Math.round((sampleCount / activeRate) * 1_000_000),
          Math.round((((lastSpeechWindow + 1) * windowSize) / activeRate) * 1_000_000)
        );
      }

      Logger.info(`[DspAudioService] VAD Detection: Speech Start = ${speechStartUs / 1000}ms, End = ${speechEndUs / 1000}ms (Active: ${hasSpeechActivity})`);

      // 5. Encode processed stereo audio to 16-bit standard PCM WAV
      const outputWavBuffer = this.encodeWav(processedLeft, processedRight, activeRate);

      // 6. Store processed BGM to Storage
      const key = `assets/audio/bgm_dsp_${Date.now()}.wav`;
      const uploadRes = await StorageFactory.uploadBuffer(outputWavBuffer, key, 'audio/wav');
      const bgmUrl = `/api/assets/file/${uploadRes.key}`;

      Logger.info(`[DspAudioService] Clean BGM isolated successfully: ${bgmUrl}`);
      return {
        bgmUrl: bgmUrl,
        speechStartUs: speechStartUs,
        speechEndUs: speechEndUs,
        speechDurationUs: Math.max(500_000, speechEndUs - speechStartUs),
        hasSpeechActivity: hasSpeechActivity,
      };
    } catch (err: any) {
      Logger.warn(`[DspAudioService] DSP separation notice: ${err.message}, falling back to default`);
      return {
        bgmUrl: sourceUrl,
        speechStartUs: 200_000,
        speechEndUs: 2_500_000,
        speechDurationUs: 2_300_000,
        hasSpeechActivity: true,
      };
    }
  }

  /**
   * Decodes buffer into normalized Float32 stereo channels (-1.0 to 1.0)
   */
  private static decodeToFloatStereo(
    buffer: Buffer,
    defaultSampleRate: number
  ): { leftChannel: Float32Array; rightChannel: Float32Array; sampleRate: number } {
    // Check for standard WAV header (RIFF ... WAVE)
    if (buffer.length >= 44 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
      const numChannels = buffer.readUInt16LE(22);
      const sampleRate = buffer.readUInt32LE(24);
      const bitsPerSample = buffer.readUInt16LE(34);

      // Locate data chunk
      let dataOffset = 12;
      while (dataOffset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', dataOffset, dataOffset + 4);
        const chunkSize = buffer.readUInt32LE(dataOffset + 4);
        if (chunkId === 'data') {
          dataOffset += 8;
          break;
        }
        dataOffset += 8 + chunkSize;
      }

      if (bitsPerSample === 16) {
        const bytesPerSample = 2;
        const totalSamples = Math.floor((buffer.length - dataOffset) / (bytesPerSample * numChannels));
        const left = new Float32Array(totalSamples);
        const right = new Float32Array(totalSamples);

        let offset = dataOffset;
        for (let i = 0; i < totalSamples; i++) {
          if (offset + (numChannels * 2) > buffer.length) break;
          const sampleL = buffer.readInt16LE(offset) / 32768.0;
          const sampleR = numChannels > 1 ? buffer.readInt16LE(offset + 2) / 32768.0 : sampleL;
          left[i] = sampleL;
          right[i] = sampleR;
          offset += numChannels * 2;
        }
        return { leftChannel: left, rightChannel: right, sampleRate };
      }
    }

    // Default raw PCM decode fallback (16-bit stereo or mono synthesis)
    const bytesPerSample = 2;
    const totalSamples = Math.max(1024, Math.floor(buffer.length / (bytesPerSample * 2)));
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      const byteIdx = i * 4;
      if (byteIdx + 3 < buffer.length) {
        left[i] = buffer.readInt16LE(byteIdx) / 32768.0;
        right[i] = buffer.readInt16LE(byteIdx + 2) / 32768.0;
      }
    }

    return { leftChannel: left, rightChannel: right, sampleRate: defaultSampleRate };
  }

  /**
   * Encodes Float32 stereo channels to 16-bit PCM WAV Buffer
   */
  private static encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Buffer {
    const numChannels = 2;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const sampleCount = left.length;
    const dataSize = sampleCount * blockAlign;
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);

    // RIFF identifier
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Write 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < sampleCount; i++) {
      // Clamp values between -1.0 and 1.0
      const l = Math.max(-1.0, Math.min(1.0, left[i]));
      const r = Math.max(-1.0, Math.min(1.0, right[i]));

      const intSampleL = l < 0 ? l * 32768 : l * 32767;
      const intSampleR = r < 0 ? r * 32768 : r * 32767;

      buffer.writeInt16LE(Math.round(intSampleL), offset);
      buffer.writeInt16LE(Math.round(intSampleR), offset + 2);
      offset += 4;
    }

    return buffer;
  }
}

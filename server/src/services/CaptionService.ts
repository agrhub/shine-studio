import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { geminiClient } from '@/integrations/ai/gemini/GeminiClient.js';
import { ttsService } from '@/services/TtsService.js';
import { DemucsAudioService } from '@/services/DemucsAudioService.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { getDatabaseProvider } from '@/database/index.js';
import { TimelineCaptionWord, CharacterSeriesEntity, SceneAudioPipelineResult, SceneDialogue, SceneEntity, SceneCaptionWord, SceneCaptionData } from '@/types.js';
import { EnvConfig } from '@/config/env.js';
import { Logger } from '@/utils/logger.js';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as string);
}

export class CaptionService {
  /**
   * Sanitizes dialogue line by stripping character name prefix (e.g. "Trần Minh Quân: ..."), quotes, and stage directions.
   */
  public static cleanDialogueLine(rawLine: string, characterName?: string): string {
    if (!rawLine || typeof rawLine !== 'string') return '';
    let line = rawLine.trim();

    // 1. Remove specific character name prefix
    if (characterName && line.toLowerCase().startsWith(characterName.toLowerCase() + ':')) {
      line = line.slice(characterName.length + 1).trim();
    }

    // 2. Remove generic "[Speaker Name]: " pattern at start of line
    line = line.replace(/^[A-ZÀ-Ỹa-zà-ỹ0-9\s._-]{1,35}:\s*/u, '');

    // 3. Remove parenthesized stage directions at beginning e.g. "(crying) Hello"
    line = line.replace(/^\([^)]*\)\s*/, '').replace(/^\[[^\]]*\]\s*/, '');

    // 4. Remove surrounding quotes
    line = line.replace(/^["'“](.*)["'”]$/, '$1').trim();

    return line;
  }

  /**
   * Translate a list of SceneDialogue objects into target language using Gemini
   */
  public static async translateDialogueList(
    dialogueList: SceneDialogue[],
    targetLanguage: string
  ): Promise<SceneDialogue[]> {
    if (!Array.isArray(dialogueList) || dialogueList.length === 0) return [];
    try {
      const cleanedInput = dialogueList.map(d => ({
        character: d.character || 'Character',
        emotion: d.emotion || 'Dramatic',
        line: CaptionService.cleanDialogueLine(d.line || (d as any).text || '', d.character),
        speech_tone: d.speech_tone || (d as any).speechTone || 'Standard',
      }));

      const prompt = `You are a professional cinematic localization translator for micro-dramas.
Translate the following dialogue lines into language code/name: "${targetLanguage}".
Ensure punchy, natural acting delivery while preserving character emotions, tone, and sentence rhythm.
DO NOT prepend character names into the "line" field.

Input Dialogue:
${JSON.stringify(cleanedInput, null, 2)}

Respond with a JSON array where each object has:
- character: string
- emotion: string
- line: string (translated line in ${targetLanguage}, containing ONLY spoken dialogue)
- speech_tone: string`;

      const raw = await geminiClient.generateText({
        prompt,
        systemInstruction: 'You are an expert film dialogue localization translator. Return ONLY a valid JSON array of SceneDialogue objects without character name prefixes in the line property.',
        jsonMode: true,
      });

      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (parsed.dialogue || parsed.translations || []);
      if (Array.isArray(list) && list.length > 0) {
        return list.map((d: any, idx: number) => {
          const charName = String(d.character || dialogueList[idx]?.character || 'Character').trim();
          const rawTranslated = String(d.line || d.text || dialogueList[idx]?.line || '').trim();
          return {
            character: charName,
            emotion: String(d.emotion || dialogueList[idx]?.emotion || 'Dramatic').trim(),
            line: CaptionService.cleanDialogueLine(rawTranslated, charName),
            speech_tone: String(d.speech_tone || d.speechTone || dialogueList[idx]?.speech_tone || 'Standard').trim(),
          };
        });
      }
    } catch (err: any) {
      Logger.warn(`[CaptionService.translateDialogueList] Gemini translation to ${targetLanguage} failed: ${err.message}. Using original lines.`);
    }
    return dialogueList.map(d => ({
      ...d,
      line: CaptionService.cleanDialogueLine(d.line || (d as any).text || '', d.character),
    }));
  }

  /**
   * Builds word-by-word timestamps and multi-word kinetic caption cues from dialogue.
   * Leverages groupWordsIntoCues for unified cue partitioning.
   */
  public static buildWordLevelCaptionsFromDialogue(
    dialogueList: SceneDialogue[],
    durSec: number,
    startSecOverride = 0.5
  ): {
    voice_start_us: number;
    voice_duration_us: number;
    captions_data: SceneCaptionData[];
    words: SceneCaptionWord[];
  } {
    if (!Array.isArray(dialogueList) || dialogueList.length === 0) {
      return {
        voice_start_us: 0,
        voice_duration_us: 0,
        captions_data: [],
        words: [],
      };
    }

    const firstCharacter = dialogueList[0]?.character || '';
    const fullLine = dialogueList
      .map(d => CaptionService.cleanDialogueLine(d.line || (d as any).text || '', d.character))
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!fullLine) {
      return {
        voice_start_us: 0,
        voice_duration_us: 0,
        captions_data: [],
        words: [],
      };
    }

    const lineWords = fullLine.split(/\s+/).filter(Boolean);
    const startSec = Math.max(0.1, Number(startSecOverride) || 0.5);
    const estimatedDurSec = Math.max(1.0, Math.min(Math.max(1.0, durSec - startSec - 0.2), lineWords.length * 0.32));
    const endSec = startSec + estimatedDurSec;
    const voiceDurSec = Math.max(0.8, endSec - startSec);

    const voice_start_us = Math.round(startSec * 1_000_000);
    const voice_duration_us = Math.round(voiceDurSec * 1_000_000);

    // 1. Build word-by-word absolute timestamps
    const totalChars = lineWords.reduce((sum, w) => sum + w.length, 0) || 1;
    let curSec = startSec;
    const words: SceneCaptionWord[] = lineWords.map((wordStr) => {
      const cleanWord = wordStr.toLowerCase().replace(/[.,!?;:"'()]/g, '');
      const wWeight = Math.max(0.08, wordStr.length / totalChars);
      const wDur = Math.max(0.15, voiceDurSec * wWeight);
      const wStart = Math.round(curSec * 1000) / 1000;
      const wEnd = Math.round(Math.min(endSec, wStart + wDur) * 1000) / 1000;
      curSec = wEnd;
      return {
        word: cleanWord,
        punctuated_word: wordStr,
        start: wStart,
        end: wEnd,
        confidence: 0.99,
      };
    });

    // 2. Reuse groupWordsIntoCues to produce standard captions_data without duplicate logic
    const captions_data = CaptionService.groupWordsIntoCues(words, firstCharacter);

    return {
      voice_start_us,
      voice_duration_us,
      captions_data,
      words,
    };
  }
  /**
   * Fast FFmpeg extraction of compressed 64kbps mono MP3 audio from a video buffer.
   * Reduces payload from 15-25MB down to ~80-150KB for instant Gemini processing.
   */
  public static async extractAudioBufferFromVideo(
    videoBuffer: Buffer
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    return new Promise((resolve) => {
      const tempId = `shine_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const tempIn = path.join(os.tmpdir(), `${tempId}.mp4`);
      const tempOut = path.join(os.tmpdir(), `${tempId}.mp3`);

      try {
        fs.writeFileSync(tempIn, videoBuffer);
        ffmpeg(tempIn)
          .noVideo()
          .audioCodec('libmp3lame')
          .audioBitrate(64)
          .audioChannels(1)
          .audioFrequency(24000)
          .output(tempOut)
          .on('end', () => {
            try {
              const audioBuf = fs.readFileSync(tempOut);
              try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch {}
              try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch {}
              Logger.info(`[CaptionService] Extracted audio buffer from video: ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB video -> ${(audioBuf.length / 1024).toFixed(1)}KB audio (99% lighter)`);
              resolve({ buffer: audioBuf, mimeType: 'audio/mp3' });
            } catch {
              resolve({ buffer: videoBuffer, mimeType: 'video/mp4' });
            }
          })
          .on('error', (err) => {
            Logger.warn(`[CaptionService] FFmpeg audio extraction fallback: ${err.message}`);
            try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch {}
            try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch {}
            resolve({ buffer: videoBuffer, mimeType: 'video/mp4' });
          })
          .run();
      } catch (err: any) {
        Logger.warn(`[CaptionService] extractAudioBufferFromVideo error: ${err.message}`);
        resolve({ buffer: videoBuffer, mimeType: 'video/mp4' });
      }
    });
  }

  /**
   * Helper to fetch media file buffer and automatically isolate lightweight audio for fast AI processing.
   */
  private static async fetchMediaBuffer(
    url: string,
    extractAudioOnly: boolean = true
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    let buffer: Buffer = Buffer.alloc(0);
    let mimeType = 'video/mp4';

    if (url.endsWith('.wav')) mimeType = 'audio/wav';
    else if (url.endsWith('.mp3')) mimeType = 'audio/mpeg';
    else if (url.endsWith('.mp4')) mimeType = 'video/mp4';
    else if (url.endsWith('.webm')) mimeType = 'video/webm';

    if (url.startsWith('/api/assets/file/') || url.startsWith('assets/')) {
      try {
        const fileRes = await StorageFactory.getFileBuffer(url);
        buffer = fileRes.buffer;
        if (fileRes.mimeType) mimeType = fileRes.mimeType;
      } catch (err: any) {
        Logger.warn(`[CaptionService] fetchMediaBuffer from storage stream failed: ${err.message}`);
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        buffer = Buffer.from(res.data);
        const headerType = res.headers['content-type'];
        if (headerType) mimeType = String(headerType);
      } catch (err: any) {
        Logger.warn(`[CaptionService] fetchMediaBuffer http request failed: ${err.message}`);
      }
    } else if (url.startsWith('data:')) {
      const parts = url.split(',');
      mimeType = parts[0].split(':')[1]?.split(';')[0] || mimeType;
      buffer = Buffer.from(parts[1], 'base64');
    }

    if (extractAudioOnly && buffer.length > 0 && (mimeType.startsWith('video/') || url.includes('.mp4') || url.includes('.webm'))) {
      return await this.extractAudioBufferFromVideo(buffer);
    }

    return { buffer, mimeType };
  }

  /**
   * Directly passes the audio/video buffer to Gemini Multimodal to extract exact word timestamps and speech onset.
   */
  public static async extractWordLevelCaptionsFromVideo(params: {
    videoUrl: string;
    dialogue?: any[];
    language?: string;
    durationSeconds?: number;
  }): Promise<{ words: SceneCaptionWord[]; captions_data: SceneCaptionData[]; speech_start_us: number; speech_end_us: number; has_speech_activity: boolean }> {
    const { videoUrl, dialogue = [], language = 'en-US', durationSeconds = 6 } = params;

    const fullText = Array.isArray(dialogue)
      ? dialogue.map((d: any) => CaptionService.cleanDialogueLine(d.line || d.text || '', d.character)).filter(Boolean).join(' ')
      : '';

    const { buffer, mimeType } = await this.fetchMediaBuffer(videoUrl, true);

    if (!buffer || buffer.length === 0) {
      throw new Error(`[CaptionService] Cannot fetch audio/video buffer from: ${videoUrl}`);
    }

    const promptText = `Listen carefully to the audio stream and transcribe the speech with exact word-level timestamps.
Task: Output high-precision word-level speech transcription.
Language: ${language}
Expected Dialogue Reference (if present): "${fullText || 'Transcribe all spoken words in audio'}"

Rules for Output:
1. Accurately detect each spoken word.
2. "start": start time of the word in SECONDS (float from 0.0s of the file, e.g. 0.40).
3. "end": end time of the word in SECONDS (float from 0.0s of the file, e.g. 1.04).
4. "word": the lowercase clean word.
5. "punctuated_word": word with proper capitalization and punctuation (e.g. "You've", "energy.").
6. "confidence": float between 0.85 and 1.0.

Respond with ONLY a JSON object matching this schema:
{
  "speech_start": 0.40,
  "speech_end": 2.42,
  "words": [
    { "word": "you've", "punctuated_word": "You've", "start": 0.40, "end": 1.04, "confidence": 0.98 },
    { "word": "got", "punctuated_word": "got", "start": 1.04, "end": 1.28, "confidence": 1.0 },
    { "word": "the", "punctuated_word": "the", "start": 1.28, "end": 1.44, "confidence": 0.99 },
    { "word": "energy", "punctuated_word": "energy.", "start": 1.44, "end": 2.16, "confidence": 0.95 }
  ]
}`;

    const parts: any[] = [
      {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: mimeType || 'audio/mp3',
        },
      },
      {
        text: promptText,
      },
    ];

    Logger.info(`[CaptionService] Analyzing audio (${(buffer.length / 1024).toFixed(1)} KB, ${mimeType}) with Gemini Multimodal for precise word timestamps...`);

    let response: any;
    try {
      response = await geminiClient.generateContent(parts, EnvConfig.geminiModelText, {
        systemPrompt: 'You are a high-precision audio speech-to-text transcription engine. Output valid JSON matching word timestamp format with start and end in seconds.',
        generationConfig: { responseMimeType: 'application/json' },
      });
    } catch (apiErr: any) {
      throw new Error(`Gemini Multimodal Transcription failed: ${apiErr.message}`);
    }

    const raw = response.text || '';
    let parsed: any = null;
    try {
      const cleanJson = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      parsed = JSON.parse(cleanJson);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {}
      }
    }

    if (!parsed) {
      throw new Error(`Gemini Multimodal returned invalid JSON: ${raw.slice(0, 300)}`);
    }

    const rawWords: SceneCaptionWord[] = Array.isArray(parsed) ? parsed : (parsed?.words || parsed?.results?.words || []);

    if (rawWords.length === 0) {
      throw new Error(`Gemini Multimodal could not detect any spoken words in the audio stream.`);
    }

    const words: SceneCaptionWord[] = rawWords
      .filter((w: SceneCaptionWord) => Boolean(w.word || w.punctuated_word))
      .map((w: SceneCaptionWord) => {
        const startSec = Number(w.start !== undefined ? w.start : 0);
        const endSec = Number(w.end !== undefined ? w.end : startSec + 0.3);
        const wordStr = String(w.word || w.punctuated_word || '').trim();
        const punctuated = String(w.punctuated_word || w.word || '').trim();
        return {
          word: wordStr.toLowerCase(),
          punctuated_word: punctuated,
          start: Math.round(startSec * 1000) / 1000,
          end: Math.round(endSec * 1000) / 1000,
          confidence: Number(w.confidence || 0.98),
        };
      });

    // Group words into natural subtitle chunks (3-5 words per cue)
    const captionData = CaptionService.groupWordsIntoCues(words);
    const speechStartUs = Math.round(words[0].start * 1_000_000);
    const speechEndUs = Math.round(words[words.length - 1].end * 1_000_000);

    Logger.info(`[CaptionService] Gemini Deepgram transcription successful: ${words.length} words, ${captionData.length} cues, speechStart: ${speechStartUs}us, speechEnd: ${speechEndUs}us`);

    return {
      words,
      captions_data: captionData,
      speech_start_us: speechStartUs,
      speech_end_us: speechEndUs,
      has_speech_activity: true,
    };
  }

  /**
   * Unified Pipeline: Automatically extracts clean BGM, synthesizes studio TTS voiceover, and performs video-based multimodal word-level transcription with Gemini.
   */
  public static async processSceneAudioAndCaptions(params: {
    videoUrl: string;
    episodeId?: string;
    sceneId?: string;
    sceneIndex: number;
    dialogue?: SceneDialogue[];
    language?: string;
    voiceId?: string;
    durationSeconds?: number;
  }): Promise<SceneAudioPipelineResult> {
    const {
      videoUrl,
      episodeId,
      sceneId,
      sceneIndex,
      dialogue: reqDialogue,
      language: reqLanguage,
      voiceId: reqVoiceId,
      durationSeconds = 6,
    } = params;

    const db = await getDatabaseProvider();
    let seriesLanguage = reqLanguage || 'en-US';
    let targetVoiceId = reqVoiceId || 'Aoede';
    let dialogue = reqDialogue || [];

    // 1. Context lookup from Database if episodeId provided
    if (episodeId) {
      try {
        const ep = await db.getEpisodeById(episodeId);
        if (ep) {
          const rawScenes: SceneEntity[] = ep.scenes || (typeof ep.script === 'object' ? (ep.script as any)?.scenes : []);
          const scenes: SceneEntity[] = Array.isArray(rawScenes) ? rawScenes : [];
          const scene = scenes.find((s: SceneEntity) => (sceneId && s.id === sceneId) || s.index === sceneIndex || s.id === `scene_${sceneIndex}`);

          if ((!dialogue || dialogue.length === 0) && scene?.dialogue && scene.dialogue.length > 0) {
            dialogue = scene.dialogue;
          }

          if (ep.series_id) {
            const series = await db.getSeriesById(ep.series_id);
            if (series) {
              seriesLanguage = series.language || series.country || seriesLanguage;
              const firstChar = dialogue[0]?.character;
              const matchedChar = series.characters?.find(
                (c: CharacterSeriesEntity) => c.name?.toLowerCase().trim() === String(firstChar || '').toLowerCase().trim()
              );
              if (matchedChar?.voice_id) {
                targetVoiceId = matchedChar.voice_id;
              }
            }
          }
        }
      } catch (err: any) {
        Logger.warn(`[CaptionService.processSceneAudioAndCaptions] DB Context lookup notice: ${err.message}`);
      }
    }

    // 2. Synthesize Studio Neural TTS Voiceover for dialogue (if present)
    let voiceoverUrl = '';
    let totalVoiceDurationUs = Math.round(durationSeconds * 1_000_000);

    const hasDialogue = Boolean(
      dialogue &&
      dialogue.length > 0 &&
      dialogue.some((d: SceneDialogue) => (d.line || '').trim().length > 0)
    );

    if (hasDialogue) {
      const dialogueText = dialogue
        .map((d: SceneDialogue) => CaptionService.cleanDialogueLine(d.line || '', d.character))
        .filter(Boolean)
        .join(' ');

      const emotion = dialogue.map((d: SceneDialogue) => d.emotion).filter(Boolean).join(', ');
      const speechTone = dialogue.map((d: SceneDialogue) => d.speech_tone).filter(Boolean).join(', ');
      const speechSpeed = (dialogue.find((d: SceneDialogue) => typeof d.speed === 'number' && d.speed > 0))?.speed || 1.0;

      try {
        const ttsRes = await ttsService.generateVoice({
          text: dialogueText,
          voiceId: targetVoiceId,
          language: seriesLanguage,
          speed: speechSpeed,
          emotion: emotion || undefined,
          speech_tone: speechTone || undefined,
        });

        if (ttsRes?.audioUrl && !ttsRes.audioUrl.includes('default')) {
          voiceoverUrl = ttsRes.audioUrl;
          if (ttsRes.durationSeconds && ttsRes.durationSeconds > 0) {
            totalVoiceDurationUs = Math.round(ttsRes.durationSeconds * 1_000_000);
          }
        } else {
          // Fallback to Gemini Audio
          const generated = await geminiClient.generateAudio(dialogueText, targetVoiceId, undefined, {
            speed: speechSpeed,
            emotion: emotion || undefined,
            speech_tone: speechTone || undefined,
          });
          const s3Res = await StorageFactory.uploadMedia(generated.url, 'audio', 'wav', generated.mimeType || 'audio/wav');
          voiceoverUrl = `/api/assets/file/${s3Res.key}`;
          if (generated.durationSeconds && generated.durationSeconds > 0) {
            totalVoiceDurationUs = Math.round(generated.durationSeconds * 1_000_000);
          }
        }
      } catch (e: any) {
        Logger.warn(`[CaptionService] TTS Voiceover generation notice: ${e.message}`);
      }
    }

    // 3. Extract clean BGM via Demucs AI (Cloud Run) / DSP Fallback
    // Rule: Only separate if BGM is missing AND scene has dialogue (to preserve BGM while replacing speech with TTS).
    // If scene has NO dialogue, separation is not needed because the video already has its own native BGM/audio.
    let bgmUrl = '';
    let existingBgm = '';
    if (episodeId) {
      try {
        const ep = await db.getEpisodeById(episodeId);
        const rawScenes: SceneEntity[] = ep?.scenes || (typeof ep?.script === 'object' ? (ep?.script as any)?.scenes : []);
        const scenes: SceneEntity[] = Array.isArray(rawScenes) ? rawScenes : [];
        const sc = scenes.find((s: SceneEntity) => (sceneId && s.id === sceneId) || s.index === sceneIndex || s.id === `scene_${sceneIndex}`);
        existingBgm = sc?.bgm_url || '';
      } catch {}
    }

    if (existingBgm) {
      bgmUrl = existingBgm;
    } else if (hasDialogue && videoUrl) {
      try {
        Logger.info(`[CaptionService] Scene #${sceneIndex} has dialogue: Separating clean BGM stem via Demucs...`);
        const separationResult = await DemucsAudioService.separateStem(videoUrl);
        bgmUrl = separationResult?.bgmUrl || '';
      } catch (e: any) {
        Logger.warn(`[CaptionService] BGM stem separation notice: ${e.message}`);
      }
    } else {
      Logger.info(`[CaptionService] Scene #${sceneIndex} has no dialogue; skipping Demucs BGM separation (video will play native audio/bgm).`);
    }

    // 4. Extract exact Word-by-Word Captions and Speech Timestamps directly with Gemini Multimodal
    let captionsData: SceneCaptionData[] = [];
    let speechStartUs = 0;
    let speechEndUs = totalVoiceDurationUs;
    let hasSpeechActivity = false;
    let extractedWords: SceneCaptionWord[] = [];

    if (hasDialogue) {
      const mediaForTranscription = voiceoverUrl || videoUrl;
      if (mediaForTranscription) {
        try {
          const extractionResult = await this.extractWordLevelCaptionsFromVideo({
            videoUrl: mediaForTranscription,
            dialogue,
            language: seriesLanguage,
            durationSeconds: Math.round(totalVoiceDurationUs / 1_000_000),
          });

          extractedWords = extractionResult.words;
          captionsData = extractionResult.captions_data;
          speechStartUs = extractionResult.speech_start_us;
          speechEndUs = extractionResult.speech_end_us;
          hasSpeechActivity = extractionResult.has_speech_activity;
        } catch (capErr: any) {
          Logger.warn(`[CaptionService] Word-level caption extraction notice: ${capErr.message}`);
        }
      }
    }

    // 5. Auto-update Episode Scene Assets in Database
    if (episodeId) {
      try {
        const ep = await db.getEpisodeById(episodeId);
        if (ep && Array.isArray(ep.scenes)) {
          const sIdx = ep.scenes.findIndex((s: any) => (sceneId && s.id === sceneId) || s.index === sceneIndex || s.id === `scene_${sceneIndex}`);
          if (sIdx !== -1) {
            const scene = ep.scenes[sIdx];
            let character = scene.dialogue && scene.dialogue[0] ? scene.dialogue[0].character : '';
            if (bgmUrl) scene.bgm_url = bgmUrl;
            if (voiceoverUrl) scene.voiceover_url = voiceoverUrl;
            if (captionsData.length > 0) {
              scene.captions_data = captionsData.map((c: any) => ({
                id: c.id || `cue_${Date.now()}`,
                character: character,
                text: c.text || '',
                start_ms: c.start_ms ?? c.startMs ?? (c.from_us ? Math.round(c.from_us / 1000) : 0),
                end_ms: c.end_ms ?? c.endMs ?? (c.to_us ? Math.round(c.to_us / 1000) : 0),
                from_us: c.from_us ?? c.fromUs ?? ((c.start_ms ?? c.startMs ?? 0) * 1000),
                to_us: c.to_us ?? c.toUs ?? ((c.end_ms ?? c.endMs ?? 0) * 1000),
                duration_ms: (c.end_ms ?? c.endMs ?? 0) - (c.start_ms ?? c.startMs ?? 0),
                duration_us: (c.to_us ?? c.toUs ?? 0) - (c.from_us ?? c.fromUs ?? 0),
                words: (c.words || []).map((w: any) => ({
                  text: w.text || w.word || '',
                  from: w.from ?? 0,
                  to: w.to ?? 0,
                  is_key_word: !!(w.is_key_word || w.isKeyWord),
                })),
              }));
            }
            ep.scenes[sIdx].voice_duration_us = totalVoiceDurationUs;
            ep.scenes[sIdx].voice_start_us = speechStartUs;
            await db.updateEpisode(ep.id, { scenes: ep.scenes });
          }
        }
      } catch (err: any) {
        Logger.warn(`[CaptionService] Auto-update episode scene assets failed: ${err.message}`);
      }
    }

    return {
      videoUrl,
      bgmUrl,
      voiceoverUrl,
      voiceId: targetVoiceId,
      voiceStartUs: speechStartUs,
      voiceDurationUs: totalVoiceDurationUs,
      speechOnsetDetected: hasSpeechActivity,
      words: extractedWords,
      captionsData,
    };
  }

  // ─── Word-by-Word Grouping & Cues Generator ─────────────────────────────────

  public static groupWordsIntoCues(words: SceneCaptionWord[], character = ''): SceneCaptionData[] {
    if (!words || words.length === 0) return [];

    const cues: SceneCaptionData[] = [];
    let currentChunk: SceneCaptionWord[] = [];
    const MAX_WORDS_PER_CUE = 4;

    for (let i = 0; i < words.length; i++) {
      const w: SceneCaptionWord = words[i];
      currentChunk.push(w);

      const text = w.punctuated_word || w.word || '';
      const isPunctuationEnd = /[.!?…]$/.test(text);
      const isChunkFull = currentChunk.length >= MAX_WORDS_PER_CUE;
      const startSec = Number(w.start ?? 0);
      const endSec = Number(w.end ?? 0);
      const nextWord = words[i + 1];
      const nextStartSec = nextWord ? Number(nextWord.start ?? 0) : 0;
      const isNextWordFar = (i < words.length - 1) && (nextStartSec - endSec > 0.6);

      if (isPunctuationEnd || isChunkFull || isNextWordFar || i === words.length - 1) {
        const firstW = currentChunk[0];
        const lastW = currentChunk[currentChunk.length - 1];

        const firstStartSec = Number(firstW.start ?? 0);
        const lastEndSec = Number(lastW.end ?? 0);

        const startMs = Math.round(firstStartSec * 1000);
        const endMs = Math.max(startMs + 200, Math.round(lastEndSec * 1000));
        const durationMs = endMs - startMs;
        const fromUs = Math.round(firstStartSec * 1_000_000);
        const toUs = Math.max(fromUs + 200_000, Math.round(lastEndSec * 1_000_000));
        const durationUs = toUs - fromUs;

        const phraseBody = currentChunk.map(cw => cw.punctuated_word || cw.word || '').join(' ').trim();
        const phraseText = phraseBody;

        const cueWords: TimelineCaptionWord[] = currentChunk.map((cw, idx) => {
          const cwStartSec = Number(cw.start ?? 0);
          const cwEndSec = Number(cw.end ?? 0);
          const wFromMs = Math.max(0, Math.round((cwStartSec - firstStartSec) * 1000));
          const wToMs = Math.max(wFromMs + 50, Math.round((cwEndSec - firstStartSec) * 1000));
          const wStr = cw.punctuated_word || cw.word || '';
          return {
            text: wStr,
            from: wFromMs,
            to: wToMs,
            isKeyWord: Boolean(idx === 0 || idx === currentChunk.length - 1 || wStr.length > 4),
          };
        });

        cues.push({
          id: `cue_${cues.length + 1}`,
          character: character || '',
          text: phraseText,
          start_ms: startMs,
          end_ms: endMs,
          duration_ms: durationMs,
          from_us: fromUs,
          to_us: toUs,
          duration_us: durationUs,
          words: cueWords,
        });

        currentChunk = [];
      }
    }

    return cues;
  }
}

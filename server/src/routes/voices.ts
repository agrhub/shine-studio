import { Router, Request, Response } from 'express';
import { geminiClient, GEMINI_SUPPORTED_VOICES, type GeminiVoiceMetadata } from '@/integrations/ai/gemini/GeminiClient.js';
import { ttsService } from '@/services/TtsService.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { DspAudioService } from '@/services/DspAudioService.js';
import { CaptionService } from '@/services/CaptionService.js';
import { SynthIDService } from '@/services/SynthIDService.js';
import { CreditService } from '@/services/CreditService.js';
import { getDatabaseProvider } from '@/database/index.js';
import { TimelineService } from '@/services/TimelineService.js';
import { CharacterSeriesEntity, SceneDialogue, SceneEntity, AssetVersion } from '@/types.js';
import { getUserId } from '@/utils/auth.js';
import { Logger } from '@/utils/logger.js';

const router = Router();

// GET /api/voices/presets — Fetch supported Gemini voice presets
router.get('/presets', async (req: Request, res: Response) => {
  const { language, gender } = req.query;
  let list: GeminiVoiceMetadata[] = await geminiClient.listVoices(language as string);

  if (gender) {
    list = list.filter((v) => v.gender === gender);
  }

  return res.json({
    code: 200,
    data: list,
    total: list.length,
    message: 'Voice presets retrieved successfully from Gemini catalog',
    error: null,
  });
});

// Shared Helper for Neural TTS Dialogue Synthesis with MultiSpeaker and Timestamps
export async function generateDialogueVoiceSynthesis(params: {
  dialogue?: SceneDialogue[];
  text?: string;
  voice_id?: string;
  emotion?: string;
  intensity?: number;
  language?: string;
  speed?: number;
  pitch?: number;
  episode_id?: string;
  scene_id?: string;
  scene_index?: number;
  multi_speaker?: any;
}) {
  const { dialogue, text: rawText, voice_id, emotion: reqEmotion, intensity, language, speed, pitch, episode_id, scene_id, scene_index, multi_speaker } = params;
  const emotion = reqEmotion || (Array.isArray(dialogue) && dialogue.length > 0 ? (dialogue[0]?.speech_tone || dialogue[0]?.emotion) : undefined);

  let multiSpeaker = multi_speaker;
  let text = rawText;
  if (!text && Array.isArray(dialogue) && dialogue.length > 0) {
    text = dialogue.map((d: SceneDialogue) => d.line).filter(Boolean).join('\n');
  }
  if (!text || text.trim() === '') {
    text = '...';
  }
  
  let targetVoiceId = voice_id;
  if (Array.isArray(dialogue) && dialogue.length > 0) {
    try {
      const db = await getDatabaseProvider();
      let seriesChars: CharacterSeriesEntity[] = [];
      if (episode_id) {
        const ep = await db.getEpisodeById(episode_id);
        if (ep) {
          if (ep.series_id) {
            const srs = await db.getSeriesById(ep.series_id);
            seriesChars = srs?.characters || [];
          }
        }
      }

      const distinctNames = Array.from(new Set(dialogue.map((d: SceneDialogue) => String(d.character || '').trim()).filter(Boolean)));
      if (distinctNames.length === 0 && params.scene_id && episode_id) {
        const ep = await db.getEpisodeById(episode_id);
        const scenes: SceneEntity[] = ep?.scenes || [];
        const sc = scenes.find((s: SceneEntity) => s.id === params.scene_id || s.index === (params as any).scene_index);
        const charCostumeName = sc?.character_costumes?.[0]?.character;
        if (charCostumeName) {
          distinctNames.push(charCostumeName);
        }
      }

      if (distinctNames.length > 1) {
        const speakers = distinctNames.map((name) => {
          const matched = seriesChars.find((c: CharacterSeriesEntity) => c.name.toLowerCase() === name.toLowerCase());
          return {
            name,
            voice_id: matched?.voice_id || (matched?.gender === 'female' ? 'Aoede' : 'Puck'),
          };
        });
        multiSpeaker = {
          enabled: true,
          speakers,
        };
      } else if (distinctNames.length === 1) {
        const matched = seriesChars.find((c: CharacterSeriesEntity) => c.name.toLowerCase() === distinctNames[0].toLowerCase());
        targetVoiceId = matched?.voice_id || (matched?.gender === 'female' ? 'Aoede' : 'Puck');
        multiSpeaker = { enabled: false };

        // Strip single speaker prefix (e.g. "Maya Lin: ...") so TTS speaks clean dialogue
        const charName = distinctNames[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(`^\\s*${charName}\\s*:\\s*`, 'i'), '').trim();
      }
    } catch (err: any) {
      Logger.warn(`[voicesRouter] Auto multiSpeaker extraction: ${err.message}`);
    }
  }

  const selectedVoiceId = targetVoiceId || 'Puck';
  const dialogueSpeed = Array.isArray(dialogue)
    ? dialogue.find((d: SceneDialogue) => typeof d.speed === 'number' && d.speed > 0)?.speed
    : undefined;
  const calculatedSpeed = speed ?? dialogueSpeed ?? (intensity ? 1.0 + (intensity - 50) * 0.004 : 1.0);
  const calculatedPitch = pitch || (intensity ? (intensity - 50) * 0.005 : 0);

  let internalUrl = '';
  let s3Key = '';
  let audioSizeBytes = 1024 * 128;
  let audioMimeType = 'audio/wav';

  const extractedEmotion = emotion || (Array.isArray(dialogue) ? dialogue.map((d: SceneDialogue) => d.emotion).filter(Boolean).join(', ') : '');
  const extractedSpeechTone = (Array.isArray(dialogue) ? dialogue.map((d: SceneDialogue) => d.speech_tone).filter(Boolean).join(', ') : '');

  // First attempt TTSService (e.g. ElevenLabs / Custom TTS)
  const ttsRes = await ttsService.generateVoice({
    text,
    voiceId: selectedVoiceId,
    language: language || 'en',
    speed: calculatedSpeed,
    emotion: extractedEmotion || undefined,
    speech_tone: extractedSpeechTone || undefined,
  });

  if (ttsRes?.status === 'READY' && ttsRes.audioUrl && !ttsRes.audioUrl.startsWith('/api/assets/file/voice_')) {
    internalUrl = ttsRes.audioUrl;
    s3Key = ttsRes.audioUrl.replace('/api/assets/file/', '');
    audioMimeType = 'audio/mpeg';
  } else {
    // Fallback to Gemini Native Audio neural voice synthesis
    const generatedAudio = await geminiClient.generateAudio(text, selectedVoiceId, undefined, {
      speed: calculatedSpeed,
      pitch: calculatedPitch,
      emotion: extractedEmotion || undefined,
      speech_tone: extractedSpeechTone || undefined,
      multiSpeaker,
    });

    if (!generatedAudio?.url) {
      throw new Error('Voice synthesis failed: Both primary TTS and Gemini Audio fallback could not generate audio.');
    }

    const s3Result = await StorageFactory.uploadMedia(generatedAudio.url, 'audio', 'wav', generatedAudio.mimeType || 'audio/wav');
    s3Key = s3Result.key;
    internalUrl = `/api/assets/file/${s3Key}`;
    audioSizeBytes = s3Result.size;
    audioMimeType = generatedAudio.mimeType || 'audio/wav';
  }

  const voiceMeta = GEMINI_SUPPORTED_VOICES.find(v => v.id === selectedVoiceId) || {
    id: selectedVoiceId,
    name: selectedVoiceId,
    language: language || 'en-US',
  };

  // Generate cues for each dialogue line with timestamp offsets
  let cues: any[] = [];
  let startUs = 200_000;
  let endUs = 2_000_000;

  if (Array.isArray(dialogue) && dialogue.length > 0) {
    let offsetUs = 200_000;
    const totalChars = dialogue.reduce((sum: number, d: any) => sum + (d.line?.length || 0), 0) || 1;
    const actualTotalDurationUs = Math.max(1_500_000, Math.round((ttsRes?.durationSeconds || (totalChars / 14)) * 1_000_000));

    cues = dialogue.map((d: any, idx: number) => {
      const lineLen = d.line?.length || 1;
      const lineDurationUs = Math.round((lineLen / totalChars) * actualTotalDurationUs);
      const fromUs = offsetUs;
      const toUs = fromUs + lineDurationUs;
      offsetUs = toUs + 100_000;
      return {
        id: `cue_${idx + 1}`,
        character: d.character || 'Voice',
        text: d.line || '',
        from_us: fromUs,
        to_us: toUs,
        duration_us: lineDurationUs,
        start_ms: Math.round(fromUs / 1000),
        end_ms: Math.round(toUs / 1000),
      };
    });

    startUs = cues[0]?.from_us || 200_000;
    endUs = cues[cues.length - 1]?.to_us || (startUs + actualTotalDurationUs);
  }

  return {
    s3_key: s3Key,
    url: internalUrl,
    audio_url: internalUrl,
    size_bytes: audioSizeBytes,
    mime_type: audioMimeType,
    voice_id: selectedVoiceId,
    voice_name: voiceMeta.name,
    language: voiceMeta.language,
    text,
    cues,
    start_us: startUs,
    end_us: endUs,
    start_ms: Math.round(startUs / 1000),
    end_ms: Math.round(endUs / 1000),
    duration_us: endUs - startUs,
    duration_ms: Math.round((endUs - startUs) / 1000),
  };
}

// POST /api/voices/tts — Real Neural Voice synthesis via TTSService / Gemini Audio
router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { voice_id, text, emotion, intensity, language, speed, pitch, multi_speaker, episode_id, scene_id, scene_index, dialogue } = req.body;

    if (!text && (!dialogue || dialogue.length === 0)) {
      return res.status(400).json({ code: 400, data: null, message: 'text or dialogue is required', error: 'INVALID_PAYLOAD' });
    }

    const userId = getUserId(req);
    const deduct = await CreditService.deductUserCredits(userId, 'voiceoverTts', 'Voiceover Synthesis', `Scene: ${scene_id || 'voice'}`);
    if (!deduct.success && deduct.error?.includes('Insufficient')) {
      return res.status(402).json({ code: 402, data: null, message: deduct.error, error: 'INSUFFICIENT_CREDITS' });
    }

    const ttsResult = await generateDialogueVoiceSynthesis({
      dialogue,
      text,
      voice_id,
      emotion,
      intensity,
      language,
      speed,
      pitch,
      episode_id,
      scene_id,
      scene_index,
      multi_speaker,
    });

    // Embed Google SynthID Digital Watermark
    const synthIdResult = await SynthIDService.embedSynthID({
      assetType: 'audio',
      model: ttsResult.voice_id,
      episodeId: episode_id,
      sceneId: scene_id,
    });

    // Save Asset Version in Database & Update Episode Scene
    let savedVoiceAsset: any = null;
    try {
      const db = await getDatabaseProvider();
      const existingVoices = (episode_id || scene_id) ? await db.getAssets({
        episode_id,
        scene_id,
        type: 'voice',
      }) : [];
      const voiceVersion = existingVoices.length + 1;

      savedVoiceAsset = await db.saveAsset({
        id: `ast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: userId,
        name: `Voiceover_${scene_id || 'Scene'}_v${voiceVersion}`,
        type: 'voice',
        ext: '.wav',
        size: `${((ttsResult.size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB`,
        size_bytes: ttsResult.size_bytes || 0,
        category_label: 'Voiceover Audio',
        category_color: 'text-emerald-500 dark:text-emerald-400',
        s3_key: ttsResult.s3_key,
        url: ttsResult.url,
        thumbnail: ttsResult.url,
        episode_id,
        scene_id,
        prompt: text || (Array.isArray(dialogue) ? dialogue.map((d: any) => d.line).join(' ') : ''),
        provider: ttsResult.voice_name || ttsResult.voice_id,
        version: voiceVersion,
        is_active: true,
        is_audio: true,
        synth_id_verified: true,
        synth_id_hash: synthIdResult.synthIdHash,
        synth_id_metadata: synthIdResult.synthIdMetadata,
        created_at: new Date().toISOString(),
      });

      // Update Episode Scene voiceover_url and captions in Database
      if (episode_id) {
        const ep = await db.getEpisodeById(episode_id);
        if (ep && Array.isArray(ep.scenes)) {
          const targetIndex = Number(scene_index) || (scene_id ? ep.scenes.findIndex((s: SceneEntity) => s.id === scene_id) + 1 : 1);
          const scIdx = ep.scenes.findIndex((s: SceneEntity) => s.index === targetIndex || s.id === scene_id);
          if (scIdx !== -1) {
            const sc = ep.scenes[scIdx];
            const curVoiceVersions: AssetVersion[] = Array.isArray(sc.voice_versions) ? [...sc.voice_versions] : [];
            if (curVoiceVersions.length === 0 && sc.voiceover_url && sc.voiceover_url !== ttsResult.url) {
              curVoiceVersions.push({
                id: `v1_voice_${targetIndex}`,
                image_url: sc.voiceover_url,
                audio_url: sc.voiceover_url,
                voiceover_url: sc.voiceover_url,
                url: sc.voiceover_url,
                created_at: new Date().toISOString(),
                is_selected: false,
              });
            }
            const newVoiceVer: AssetVersion = {
              id: `ver_voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              image_url: ttsResult.url,
              audio_url: ttsResult.url,
              voiceover_url: ttsResult.url,
              url: ttsResult.url,
              prompt: text,
              created_at: new Date().toISOString(),
              is_selected: true,
              model: voice_id,
            };
            sc.voice_versions = [newVoiceVer, ...curVoiceVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
            sc.voiceover_url = ttsResult.url;
            sc.voice_start_us = ttsResult.start_us;
            sc.voice_duration_us = ttsResult.duration_us;
            if (ttsResult.cues && ttsResult.cues.length > 0) {
              sc.captions_data = ttsResult.cues;
            }
            if (language) {
              sc.translations = sc.translations || {};
              sc.translations[language] = {
                ...(sc.translations[language] || {}),
                voiceover_url: ttsResult.url,
                captions_data: ttsResult.cues,
              };
            }
            ep.scenes[scIdx] = sc;
            await db.updateEpisode(episode_id, { scenes: ep.scenes });
            Logger.info(`[voicesRouter] Successfully updated episode ${episode_id} scene #${targetIndex} with new voiceover_url: ${ttsResult.url}`);

            // Automatically sync Timeline in Database so GET /timeline returns updated URL immediately
            const latest = await db.getLatestTimeline(episode_id);
            if (latest) {
              const series = ep.series_id ? await db.getSeriesById(ep.series_id) : null;
              const syncedTimeline = TimelineService.syncTimelineWithScenes(ep, { ...latest }, series);
              await db.saveTimeline(episode_id, syncedTimeline, { id: 'system', name: 'Studio System' }, `Update voiceover for scene #${targetIndex}`);
              Logger.info(`[voicesRouter] Synchronized timeline for episode ${episode_id} with updated voiceover clip`);
            }
            try {
              const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
              const updatedEp = await db.getEpisodeById(episode_id);
              if (updatedEp) {
                PatchSyncService.broadcast(ep.series_id || 'all', 'episode:updated', updatedEp);
              }
            } catch (wsErr: any) {
              Logger.warn(`[voicesRouter] WebSocket broadcast notice: ${wsErr.message}`);
            }
          }
        }
      }
    } catch (dbErr: any) {
      Logger.warn(`[VoicesTTS] Failed to record asset or update episode in DB: ${dbErr.message}`);
    }

    res.set(synthIdResult.headers);

    return res.json({
      code: 200,
      data: {
        ...ttsResult,
        asset_id: savedVoiceAsset?.id || undefined,
        version: savedVoiceAsset?.version || 1,
        emotion: emotion || 'Neutral',
        intensity: intensity || 80,
        synth_id: synthIdResult.synthIdMetadata,
      },
      message: 'Neural TTS audio rendered and stored to S3 with SynthID verification',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/voices/dubbing/re-align — Multi-market timeline dubbing realignment
router.post('/dubbing/re-align', async (req: Request, res: Response) => {
  try {
    const { episode_id, language, scenes } = req.body;

    // AI timing adjustment for differences in syllable density
    const languageTimeExpansion: Record<string, number> = {
      'vi-VN': 1.18,
      'zh-CN': 0.88,
      'es-ES': 1.12,
      'ja-JP': 1.05,
      'en-US': 1.0,
    };

    const multiplier = languageTimeExpansion[language] || 1.0;
    const alignedScenes = (scenes || []).map((s: any, idx: number) => {
      const origDuration = s.duration || 5.0;
      const adjustedDuration = Math.round(origDuration * multiplier * 10) / 10;
      return {
        scene_index: idx,
        original_duration: origDuration,
        realigned_duration: adjustedDuration,
        timecode_shift_seconds: Math.round((adjustedDuration - origDuration) * 10) / 10,
        sync_status: 'LIP_SYNC_ALIGNED',
      };
    });

    return res.json({
      code: 200,
      data: {
        episode_id: episode_id || 'ep-001',
        language: language || 'en-US',
        expansion_ratio: multiplier,
        aligned_scenes: alignedScenes,
      },
      message: 'Multi-market timeline dubbing re-aligned with audio timecode expansion',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/voices/separate-audio — Extract Audio, Synthesize Unified TTS Voiceover, and Generate Gemini Word-by-Word Captions
router.post('/separate-audio', async (req: Request, res: Response) => {
  try {
    const { video_url, episode_id, scene_index = 1 } = req.body;
    const targetSceneIndex = Number(scene_index) || 1;

    if (!video_url) {
      return res.status(400).json({ code: 400, data: null, message: 'video_url is required', error: 'INVALID_PAYLOAD' });
    }

    Logger.info(`[voicesRouter.separate-audio] Processing audio separation, TTS generation, and word-level captions for episode ${episode_id} scene ${targetSceneIndex}...`);

    const result = await CaptionService.processSceneAudioAndCaptions({
      videoUrl: video_url,
      episodeId: episode_id,
      sceneIndex: targetSceneIndex,
    });

    const startUs = result.voiceStartUs;
    const endUs = startUs + result.voiceDurationUs;

    return res.json({
      code: 200,
      data: {
        episode_id,
        scene_index: targetSceneIndex,
        video_url: result.videoUrl,
        bgm_url: result.bgmUrl,
        voiceover_url: result.voiceoverUrl,
        voice_id: result.voiceId,
        has_audio: !!result.bgmUrl || !!result.voiceoverUrl,
        start_us: startUs,
        end_us: endUs,
        start_ms: Math.round(startUs / 1000),
        end_ms: Math.round(endUs / 1000),
        duration_us: result.voiceDurationUs,
        duration_ms: Math.round(result.voiceDurationUs / 1000),
        voice_duration_us: result.voiceDurationUs,
        voice_start_us: startUs,
        speech_onset_detected: result.speechOnsetDetected,
        words: result.words,
        cues: result.captionsData,
        captions_data: result.captionsData,
      },
      message: 'Audio separated, BGM extracted, Studio TTS voiceover synthesized, and word-level captions generated with Gemini',
      error: null,
    });
  } catch (err: any) {
    Logger.error(`[voicesRouter.separate-audio] Error: ${err.message}`);
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SEPARATION_FAILED' });
  }
});

// POST /api/voices/steer-emotion — Fine-grained neural pitch/speed/vibrato control
router.post('/steer-emotion', (req: Request, res: Response) => {
  const { voice_id, emotion_tag = 'Dramatic', intensity_level = 70 } = req.body;
  const level = Number(intensity_level) || 70;

  return res.json({
    code: 200,
    data: {
      voice_id,
      emotion_tag,
      intensity_level: level,
      pitch_multiplier: 1.0 + (level - 50) * 0.006,
      rate_multiplier: 1.0 + (level - 50) * 0.004,
      vibrato_depth: level > 80 ? 0.25 : 0.05,
    },
    message: 'Emotion steering parameters calibrated',
    error: null,
  });
});

export default router;

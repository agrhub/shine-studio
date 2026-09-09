import { getDatabaseProvider } from '../database/index.js';
import { CaptionSettings, TimelineCaptionWord, CaptionSettings as _CS, EpisodeEntity, IProject, ITrack, SceneCaptionData, SceneEntity, SeriesEntity, TimelineDimensions, SceneCaptionWord } from '@/types.js';
import { Logger } from '../utils/logger.js';
import { normalizeSceneEntity } from '../utils/sceneNormalizer.js';
import { OPENVIDEO_EFFECTS } from '../constants/effects.js';
import { CaptionService } from './CaptionService.js';
import { PatchSyncService } from '~/realtime/PatchSyncService.js';
import { normalizeTransitionKey } from '../constants/transitions.js';
import { normalizeEffectKey } from '../constants/effects.js';

export class TimelineService {
  /**
   * Normalize arbitrary transition strings from AI to canonical gl-transitions keys
   */
  // public static normalizeTransitionKey(raw?: string): string | null {
  //   if (!raw) return null;
  //   const clean = raw.toLowerCase().trim().replace(/[\-_]/g, ' ');
  //   if (['cut', 'direct cut', 'smash cut', 'match cut', 'none', 'null', ''].includes(clean)) {
  //     return null;
  //   }
  //   if (['fade', 'dissolve', 'crossfade', 'cross fade', 'fade to black', 'fade to white', 'wipe to black'].includes(clean)) {
  //     return 'fade';
  //   }
  //   if (['wipeleft', 'wipe left', 'wipe_left'].includes(clean)) return 'wipeLeft';
  //   if (['wiperight', 'wipe right', 'wipe_right'].includes(clean)) return 'wipeRight';
  //   if (['wipeup', 'wipe up', 'wipe_up'].includes(clean)) return 'wipeUp';
  //   if (['wipedown', 'wipe down', 'wipe_down'].includes(clean)) return 'wipeDown';
  //   if (['cube'].includes(clean)) return 'cube';
  //   if (['zoom', 'crosszoom', 'cross zoom', 'simplezoom', 'simple zoom'].includes(clean)) return 'CrossZoom';
  //   if (['dreamy', 'dreamyzoom', 'dreamy zoom'].includes(clean)) return 'dreamy';
  //   if (['glitch', 'glitchmemories', 'glitch memories', 'glitchdisplace', 'glitch displace'].includes(clean)) return 'glitchMemories';
  //   if (['swirl'].includes(clean)) return 'Swirl';
  //   if (['ripple', 'waterdrop', 'water drop'].includes(clean)) return 'ripple';
  //   if (['wind'].includes(clean)) return 'wind';
  //   if (['blur', 'linearblur', 'linear blur'].includes(clean)) return 'LinearBlur';
  //   if (['mosaic', 'pixelize', 'pixel'].includes(clean)) return 'Mosaic';
  //   if (['doorway'].includes(clean)) return 'doorway';
  //   if (['burn', 'filmburn', 'film burn'].includes(clean)) return 'burn';
  //   if (['circleopen', 'circle open'].includes(clean)) return 'circleopen';
  //   if (['windowslice', 'window slice'].includes(clean)) return 'windowslice';

  //   // Fallback: check if raw itself is standard camelCase gl-transition key
  //   const knownKeys = ['fade', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'cube', 'CrossZoom', 'SimpleZoom', 'DreamyZoom', 'glitchMemories', 'GlitchDisplace', 'dreamy', 'Swirl', 'waterDrop', 'ripple', 'wind', 'LinearBlur', 'Mosaic', 'pixelize', 'circleopen', 'windowslice', 'doorway', 'burn', 'InvertedPageCurl'];
  //   const matched = knownKeys.find(k => k.toLowerCase() === clean.replace(/\s+/g, ''));
  //   return matched || 'fade';
  // }

  // /**
  //  * Normalize arbitrary video effect strings from AI to supported OpenVideo Pixi effect keys
  //  */
  // public static normalizeEffectKey(raw?: string): string | null {
  //   if (!raw) return null;
  //   const clean = raw.toLowerCase().trim().replace(/[\-_]/g, ' ');
  //   if (['none', 'null', '', 'normal', 'rain overlay', 'overlay', 'noneeffect', 'default', 'raw'].includes(clean)) {
  //     return null;
  //   }
  //   const cleanNoSpace = clean.replace(/\s+/g, '');
  //   if (OPENVIDEO_EFFECTS[cleanNoSpace]) {
  //     return OPENVIDEO_EFFECTS[cleanNoSpace];
  //   }
  //   if (['glow', 'glowfilter', 'glow filter'].includes(clean)) return 'glowFilter';
  //   if (['vignette', 'vignette filter'].includes(clean)) return 'vignette';
  //   if (['blur', 'depthblur', 'depth blur', 'blur filter', 'depth'].includes(clean)) return 'depthBlur';
  //   if (['noise', 'noise filter'].includes(clean)) return 'noiseFilter';
  //   if (['crt', 'crt filter', 'retro'].includes(clean)) return 'crtFilter';
  //   if (['rgb', 'rgbsplitter', 'rgb split', 'rgbglitch'].includes(clean)) return 'rgbSplitter';
  //   if (['godray', 'godray filter', 'sunray'].includes(clean)) return 'godrayFilter';
  //   return null;
  // }
  /**
   * Helper to resolve canvas dimensions from series ratio
   */
  static getDimensionsFromRatio(ratio = '9:16', fps = 30): TimelineDimensions {
    const trimmed = (ratio || '9:16').trim();
    if (trimmed === '16:9') {
      return { width: 1920, height: 1080, fps };
    }
    if (trimmed === '4:3') {
      return { width: 1440, height: 1080, fps };
    }
    if (trimmed === '1:1') {
      return { width: 1080, height: 1080, fps };
    }
    // Default: 9:16 vertical
    return { width: 1080, height: 1920, fps };
  }

  /**
   * Extract raw scenes array safely from Episode entity
   */
  static extractScenes(episode: EpisodeEntity): SceneEntity[] {
    let rawScenes: any = episode?.scenes || [];
    if (typeof rawScenes === 'string') {
      try {
        rawScenes = JSON.parse(rawScenes);
      } catch {
        rawScenes = [];
      }
    }
    // if (!rawScenes || rawScenes.length === 0) {
    //   if (episode?.script) {
    //     try {
    //       const parsedScript = typeof episode.script === 'string' ? JSON.parse(episode.script) : episode.script;
    //       if (Array.isArray(parsedScript.scenes)) {
    //         rawScenes = parsedScript.scenes;
    //       }
    //     } catch {}
    //   }
    // }
    return Array.isArray(rawScenes) ? rawScenes : [];
  }

  /**
   * Robustly check whether a scene has spoken dialogue lines, translations, or TTS voiceover
   */
  static checkSceneHasDialogue(scene: SceneEntity): boolean {
    if (!scene) return false;
    const hasScriptDialogue = Array.isArray(scene.dialogue) && scene.dialogue.length > 0 && scene.dialogue.some((d: any) => {
      const text = typeof d === 'string' ? d : (d?.line || d?.dialogue || d?.text || '');
      return Boolean(text && text.trim());
    });
    const hasVoiceover = Boolean(scene.voiceover_url);
    const hasTranslations = Boolean(
      scene.translations && Object.values(scene.translations).some((t: any) => {
        if (!t) return false;
        if (t.voiceover_url) return true;
        if (Array.isArray(t.dialogue) && t.dialogue.length > 0) {
          return t.dialogue.some((td: any) => {
            const text = typeof td === 'string' ? td : (td?.line || td?.dialogue || td?.text || '');
            return Boolean(text && text.trim());
          });
        }
        return false;
      })
    );
    return Boolean(hasScriptDialogue || hasVoiceover || hasTranslations);
  }

  /**
   * Sanitizes all clips in timeline:
   * 1. If any track_video clip corresponds to a scene with dialogue, or overlaps with any active voiceover clip, mute video audio (volume = 0).
   * 2. Normalize transition & effect keys.
   */
  static sanitizeTimelineClips(timelineData: IProject, episode?: EpisodeEntity | null): IProject {
    if (!timelineData || !timelineData.clips) {
      return timelineData;
    }
    const rawScenes = episode ? this.extractScenes(episode) : [];
    const clips: Record<string, any> = { ...timelineData.clips };

    // Find all active voiceover time intervals
    const voIntervals: Array<{ from: number; to: number }> = [];
    for (const clip of Object.values<any>(clips)) {
      if (clip && (clip.trackId?.startsWith('track_voiceover') || clip.type === 'Audio' && clip.id?.startsWith('clip_vo_'))) {
        const from = Number(clip.timing?.display?.from ?? clip.display?.from ?? 0);
        const to = Number(clip.timing?.display?.to ?? clip.display?.to ?? 0);
        if (to > from) {
          voIntervals.push({ from, to });
        }
      }
    }

    for (const [clipId, clip] of Object.entries<any>(clips)) {
      if (clip.type === 'Transition') {
        clip.transitionKey = normalizeTransitionKey(clip.transitionKey) || 'fade';
      } else if (clip.type === 'Effect') {
        clip.effectKey = normalizeEffectKey(clip.effectKey) || 'fadeIn';
      } else if (clip.type === 'Video' || clip.trackId === 'track_video') {
        // Check scene dialogue status
        let hasDialogue = false;
        const match = clipId.match(/_s(\d+)/) || clip.name?.match(/#?(\d+)/);
        if (match && rawScenes.length > 0) {
          const scIdx = Number(match[1]);
          const sc = rawScenes.find((s, i) => (s.index || i + 1) === scIdx);
          if (sc) {
            hasDialogue = this.checkSceneHasDialogue(sc);
          }
        }
        // Also check overlap with any voiceover
        if (!hasDialogue && voIntervals.length > 0) {
          const vFrom = Number(clip.timing?.display?.from ?? clip.display?.from ?? 0);
          const vTo = Number(clip.timing?.display?.to ?? clip.display?.to ?? 0);
          hasDialogue = voIntervals.some(vo => Math.max(vFrom, vo.from) < Math.min(vTo, vo.to));
        }
        if (hasDialogue) {
          clip.volume = 0;
        }
      }
      clips[clipId] = clip;
    }

    return {
      ...timelineData,
      clips,
    };
  }

  static sanitizeEffectAndTransitionKeys(timelineData: IProject) {
    return this.sanitizeTimelineClips(timelineData);
  }

  /**
   * Build a complete, valid IProject timeline structure from an Episode and Series
   */
  static buildInitialTimelineData(episode: EpisodeEntity, series?: SeriesEntity | null): IProject {
    const episodeId = episode.id;
    const rawScenes = this.extractScenes(episode);
    const { width, height, fps } = this.getDimensionsFromRatio(series?.ratio || '9:16');

    const totalScenes = rawScenes.length;
    const targetDurationUs = (Number(episode.duration) || Math.max(90, totalScenes * 6)) * 1_000_000;
    const defaultSceneDurUs = totalScenes > 0 ? Math.round(targetDurationUs / totalScenes) : 6_000_000;

    const clips: Record<string, any> = {};
    const videoClipIds: string[] = [];
    const bgmClipIds: string[] = [];
    const effectClipIds: string[] = [];

    let currentTimelineUs = 0;

    rawScenes.forEach((scene: SceneEntity, idx: number) => {
      const scIdx = scene.index || (idx + 1);
      const sceneDurSeconds = Number(scene.duration_seconds) || 6;
      const sceneDurUs = sceneDurSeconds > 0 ? sceneDurSeconds * 1_000_000 : defaultSceneDurUs;

      const fromUs = currentTimelineUs;
      const toUs = fromUs + sceneDurUs;

      // 1. Visual Clip (Video or Storyboard Image)
      const vClipId = `clip_v_${episodeId}_s${scIdx}`;
      const srcUrl = scene.video_url || scene.storyboard_frame_url || '/images/dashboard/poster-1.jpg';
      const isVideo = !!scene.video_url;
      const hasDialogue = this.checkSceneHasDialogue(scene);
      const volume = hasDialogue ? 0 : 1;

      clips[vClipId] = {
        id: vClipId,
        trackId: 'track_video',
        type: isVideo ? 'Video' : 'Image',
        name: scene.heading || `Scene #${scIdx}`,
        src: srcUrl,
        timing: {
          display: { from: fromUs, to: toUs },
          trim: { from: 0, to: sceneDurUs },
          duration: sceneDurUs,
          playbackRate: 1,
        },
        volume: volume,
        style: {},
        locked: false,
        transform: {
          x: 0,
          y: 0,
          width,
          height,
          angle: 0,
          zIndex: 10,
          opacity: 1,
        },
      };
      videoClipIds.push(vClipId);

      // 2. Transition between visual clips
      const normalizedTransKey = normalizeTransitionKey(scene.transition_effect as string);
      if (scIdx > 1 && normalizedTransKey) {
        const transClipId = `clip_trans_${episodeId}_s${scIdx - 1}`;
        clips[transClipId] = {
          id: transClipId,
          type: 'Transition',
          name: `Transition: ${normalizedTransKey}`,
          transitionKey: normalizedTransKey,
          duration: 1_000_000,
          fromClipId: `clip_v_${episodeId}_s${scIdx - 1}`,
          toClipId: vClipId,
        };
      }

      // 3. Visual Effect Clip on track_effects
      const normalizedEffKey = normalizeEffectKey(scene.video_effect as string);
      if (normalizedEffKey) {
        const effClipId = `clip_eff_${episodeId}_s${scIdx}`;
        clips[effClipId] = {
          id: effClipId,
          trackId: 'track_effects',
          type: 'Effect',
          name: `Effect: ${normalizedEffKey}`,
          effectKey: normalizedEffKey,
          intensity: 0.8,
          timing: {
            display: { from: fromUs, to: fromUs + 1_000_000 },
            trim: { from: 0, to: 1_000_000 },
            duration: 1_000_000,
            playbackRate: 1,
          },
          visible: true,
          style: {},
          locked: false,
        };
        effectClipIds.push(effClipId);
      }

      // 4. BGM Clip
      if (scene.bgm_url) {
        const bgmClipId = `clip_bgm_${episodeId}_s${scIdx}`;
        clips[bgmClipId] = {
          id: bgmClipId,
          trackId: 'track_bgm',
          type: 'Audio',
          name: `BGM #${scIdx}`,
          src: scene.bgm_url,
          timing: {
            display: { from: fromUs, to: toUs },
            trim: { from: 0, to: sceneDurUs },
            duration: sceneDurUs,
            playbackRate: 1,
          },
          volume: hasDialogue ? 0.35 : 0,
          style: {},
          locked: false,
          transform: {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            angle: 0,
            zIndex: 0,
            opacity: 1,
          },
        };
        bgmClipIds.push(bgmClipId);
      }

      currentTimelineUs += sceneDurUs;
    });

    const totalDurationUs = Math.max(targetDurationUs, currentTimelineUs);

    // Fallback: If episode has bgm_url and no per-scene BGM was added, add a global episode BGM clip
    // if (episode.bgm_url && bgmClipIds.length === 0) {
    //   const epBgmClipId = `clip_bgm_${episodeId}_main`;
    //   clips[epBgmClipId] = {
    //     id: epBgmClipId,
    //     trackId: 'track_bgm',
    //     type: 'Audio',
    //     name: 'Episode BGM',
    //     src: episode.bgm_url,
    //     timing: {
    //       display: { from: 0, to: totalDurationUs },
    //       trim: { from: 0, to: totalDurationUs },
    //       duration: totalDurationUs,
    //       playbackRate: 1,
    //     },
    //     volume: 0.35,
    //     style: {},
    //     locked: false,
    //     transform: {
    //       x: 0,
    //       y: 0,
    //       width: 0,
    //       height: 0,
    //       angle: 0,
    //       zIndex: 0,
    //       opacity: 1,
    //     },
    //   };
    //   bgmClipIds.push(epBgmClipId);
    // }

    const projectData: IProject = {
      settings: {
        width,
        height,
        fps,
        duration: totalDurationUs,
        backgroundColor: '#000000',
      },
      tracks: [
        { id: 'track_effects', name: 'Visual Effects', type: 'Effect', clipIds: effectClipIds },
        { id: 'track_video', name: 'Scene Video (9:16)', type: 'Video', clipIds: videoClipIds },
        { id: 'track_bgm', name: 'Background Music (BGM)', type: 'Audio', clipIds: bgmClipIds },
      ],
      clips,
    };

    // Synchronize language tracks (voiceover & subtitles) directly for series.language
    const primaryLang = (series?.language || 'en-US').trim();
    this.syncLanguageTracksIntoTimeline(projectData, episode, primaryLang, series);

    return projectData;
  }

  /**
   * Synchronize dubbing, caption, and translation tracks into an existing timeline
   */
  static syncLanguageTracksIntoTimeline(
    timeline: IProject,
    episode: EpisodeEntity,
    primaryLang = 'en-US',
    series?: SeriesEntity | null
  ): void {
    if (!timeline.tracks) timeline.tracks = [];
    if (!timeline.clips) timeline.clips = {};

    const BCP47_REGEX = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i;
    const cleanPrimary = BCP47_REGEX.test(primaryLang) ? primaryLang : 'en-US';
    const episodeId = episode.id;
    const rawScenes = this.extractScenes(episode);
    const canvasWidth = timeline.settings?.width || 1080;
    const canvasHeight = timeline.settings?.height || 1920;

    // Collect all configured language codes (always include cleanPrimary)
    const langSet = new Set<string>();
    langSet.add(cleanPrimary);

    // Only add additional sub-languages if they are valid BCP-47 codes and have actual translations in scenes
    const sceneTranslationLangs = new Set<string>();
    rawScenes.forEach((sc: any) => {
      if (sc.translations && typeof sc.translations === 'object') {
        Object.keys(sc.translations).forEach(k => {
          if (k && k !== cleanPrimary && BCP47_REGEX.test(k.trim())) {
            sceneTranslationLangs.add(k.trim());
            langSet.add(k.trim());
          }
        });
      }
    });

    (episode.dubbing_languages || []).forEach(l => {
      if (l && BCP47_REGEX.test(l.trim()) && (l.trim() === cleanPrimary || sceneTranslationLangs.has(l.trim()))) {
        langSet.add(l.trim());
      }
    });
    (episode.caption_languages || []).forEach(l => {
      if (l && BCP47_REGEX.test(l.trim()) && (l.trim() === cleanPrimary || sceneTranslationLangs.has(l.trim()))) {
        langSet.add(l.trim());
      }
    });

    // Prune tracks that do not match langSet (e.g. invalid tracks like track_caption_United_States)
    timeline.tracks = timeline.tracks.filter(t => {
      if (t.id === 'track_voiceover_main' || t.id === 'track_captions_main') return false;
      if (t.type === 'Audio' && t.id.startsWith('track_voiceover_')) {
        const lCode = t.languageCode || t.id.replace('track_voiceover_', '');
        return langSet.has(lCode) && (t.id === `track_voiceover_${lCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
      }
      if (t.type === 'Caption' && t.id.startsWith('track_caption_')) {
        const lCode = t.languageCode || t.id.replace('track_caption_', '');
        return langSet.has(lCode) && (t.id === `track_caption_${lCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
      }
      return true;
    });

    const currentTrackIds = new Set(timeline.tracks.map(t => t.id));
    Object.keys(timeline.clips).forEach(cid => {
      const clip = timeline.clips[cid];
      if (clip && (!clip.trackId || !currentTrackIds.has(clip.trackId) || clip.trackId === 'track_voiceover_main' || clip.trackId === 'track_captions_main')) {
        delete timeline.clips[cid];
      }
    });

    const languages = Array.from(langSet);
    const activeSceneIndices = new Set(rawScenes.map((sc, i) => sc.index || (i + 1)));

    languages.forEach((langCode) => {
      const safeLang = langCode.replace(/[^a-zA-Z0-9_-]/g, '_');
      const voTrackId = `track_voiceover_${safeLang}`;
      const capTrackId = `track_caption_${safeLang}`;
      const isPrimary = langCode === primaryLang;

      // 1. Ensure Voiceover Track exists
      let voTrack = timeline.tracks.find(t => t.id === voTrackId);
      if (!voTrack) {
        const newVoTrack: ITrack = {
          id: voTrackId,
          name: `Voiceover (${langCode})`,
          type: 'Audio',
          accepts: ['Audio'],
          languageCode: langCode,
          muted: !isPrimary,
          visible: isPrimary,
          clipIds: [],
        };
        timeline.tracks.push(newVoTrack);
        voTrack = newVoTrack;
      } else {
        voTrack.languageCode = langCode;
        if (!Array.isArray(voTrack.clipIds)) voTrack.clipIds = [];
      }

      // 2. Ensure Caption Track exists with episode caption_settings
      let capSettings: any = episode.caption_settings;
      if (typeof capSettings === 'string') {
        try {
          capSettings = JSON.parse(capSettings);
        } catch {}
      }
      if (!capSettings && (series as any)?.caption_settings) {
        try {
          const sCap = (series as any).caption_settings;
          capSettings = typeof sCap === 'string' ? JSON.parse(sCap) : sCap;
        } catch {}
      }

      // Resolve preset styling defaults if a preset is selected
      const stylePreset = capSettings?.caption_style;
      let presetFont = 'Outfit-Bold';
      let presetSize = 44;
      let presetColor = '#ffffff';
      let presetActiveColor = '#FFD700';
      let presetStrokeWeight = 3;
      let presetStrokeColor = '#000000';
      let presetCase = 'uppercase';
      let presetBgBox = false;
      let presetBgColor = 'rgba(0, 0, 0, 0.7)';
      let presetPos = 80;

      if (stylePreset === 'pop') {
        presetFont = 'Bangers-Regular';
        presetSize = 46;
        presetColor = '#FFFFFF';
        presetActiveColor = '#FFD700';
        presetStrokeWeight = 4;
        presetStrokeColor = '#000000';
        presetCase = 'uppercase';
        presetPos = 80;
      } else if (stylePreset === 'minimal') {
        presetFont = 'Inter-Regular';
        presetSize = 36;
        presetColor = '#FFFFFF';
        presetActiveColor = '#67C23A';
        presetStrokeWeight = 0;
        presetCase = 'none';
        presetBgBox = true;
        presetBgColor = 'rgba(0, 0, 0, 0.6)';
        presetPos = 85;
      } else if (stylePreset === 'comic') {
        presetFont = 'Bangers-Regular';
        presetSize = 48;
        presetColor = '#FFFF00';
        presetActiveColor = '#FF3366';
        presetStrokeWeight = 5;
        presetStrokeColor = '#000000';
        presetCase = 'uppercase';
        presetPos = 78;
      } else if (stylePreset === 'neon') {
        presetFont = 'Outfit-Bold';
        presetSize = 44;
        presetColor = '#00FFFF';
        presetActiveColor = '#FF00FF';
        presetStrokeWeight = 3;
        presetStrokeColor = '#001A33';
        presetCase = 'uppercase';
        presetPos = 80;
      } else if (stylePreset === 'karaoke') {
        presetFont = 'Outfit-Bold';
        presetSize = 44;
        presetColor = '#FFFFFF';
        presetActiveColor = '#00FF66';
        presetStrokeWeight = 3;
        presetStrokeColor = '#111111';
        presetCase = 'uppercase';
        presetPos = 82;
      }

      const captionWidth = Math.round(canvasWidth * 0.86);
      const captionHeight = 120;
      const left = Math.round((canvasWidth - captionWidth) / 2);

      const verticalPosPercent = typeof capSettings?.vertical_pos === 'number'
        ? capSettings.vertical_pos
        : (capSettings?.vertical_align === 'top' ? 15 : (capSettings?.vertical_align === 'center' ? 50 : presetPos));
      const top = Math.round((canvasHeight * (verticalPosPercent / 100)) - captionHeight / 2);

      const CAPTION_FONT_URL_MAP: Record<string, string> = {
        'Roboto-Bold': 'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWuYjammT.ttf',
        'Roboto-Regular': 'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf',
        'Roboto': 'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf',
        'Outfit-Bold': 'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf',
        'Outfit-Regular': 'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf',
        'Outfit': 'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf',
        'Bangers-Regular': 'https://fonts.gstatic.com/s/bangers/v25/FeVQS0BTqb0h60ACL5k.ttf',
        'Bangers': 'https://fonts.gstatic.com/s/bangers/v25/FeVQS0BTqb0h60ACL5k.ttf',
        'Inter': 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
        'Inter-Regular': 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
        'Inter-Bold': 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
      };

      const fontFamily = capSettings?.font_family || presetFont;
      const fontSize = typeof capSettings?.font_size === 'number' ? capSettings.font_size : presetSize;
      const textColor = capSettings?.text_color || presetColor;
      const activeColor = capSettings?.word_highlight_color || presetActiveColor;
      const outlineWeight = typeof capSettings?.outline_weight === 'number' ? capSettings.outline_weight : presetStrokeWeight;
      const outlineColor = capSettings?.outline_color || presetStrokeColor;
      const textAlign = capSettings?.text_align || 'center';
      const textCase = capSettings?.text_case || presetCase;
      const wordsPerLine = capSettings?.words_per_line || 'multiple';
      const bgBox = capSettings?.enable_background_box !== undefined ? Boolean(capSettings.enable_background_box) : presetBgBox;
      const bgColor = capSettings?.bg_color || presetBgColor;
      const isVisible = isPrimary && (capSettings?.enable_caption !== false);
      const fontUrl = capSettings?.font_url || CAPTION_FONT_URL_MAP[fontFamily] || CAPTION_FONT_URL_MAP['Outfit-Bold'];

      const defaultCaptionConfig = {
        captions: {
          style: {
            fontSize,
            fontFamily,
            fontWeight: '700',
            fontStyle: 'normal',
            color: textColor,
            fill: textColor,
            align: textAlign,
            textAlign,
            textCase,
            wordWrap: true,
            wordWrapWidth: captionWidth,
            breakWords: true,
            fontUrl,
            stroke: outlineWeight > 0 ? { color: outlineColor, width: outlineWeight, join: 'round' } : undefined,
            strokeWidth: outlineWeight,
            shadow: { color: '#000000', alpha: 0.6, blur: 4, offsetX: 2, offsetY: 2 },
            background: bgBox ? { color: bgColor, opacity: 0.7, borderRadius: 8, paddingX: 10, paddingY: 6 } : undefined,
            backgroundColor: bgBox ? bgColor : undefined,
            padding: bgBox ? 10 : undefined,
            borderRadius: bgBox ? 8 : undefined,
            appeared: textColor,
            active: activeColor,
            activeFill: activeColor,
            keyword: activeColor,
          },
          colors: {
            active: { color: activeColor, background: bgBox ? bgColor : undefined },
            future: { color: textColor },
            keyword: { color: activeColor, preserveAfterSpoken: true },
          },
          states: {
            default: { color: textColor },
            active: { color: activeColor, background: bgBox ? bgColor : undefined },
            future: { color: textColor },
          },
          positioning: {
            videoWidth: canvasWidth,
            videoHeight: canvasHeight,
            bottomOffset: Math.round(canvasHeight - (top + captionHeight)),
            vertical: capSettings?.vertical_align || 'bottom',
            horizontal: 'center',
          },
          wordsPerLine,
          wordAnimation: capSettings?.highlight_animate !== false ? {
            type: 'scale',
            application: 'active',
            value: 1.15,
          } : undefined,
        },
      };

      let capTrack = timeline.tracks.find(t => t.id === capTrackId);
      if (!capTrack) {
        const newCapTrack: ITrack = {
          id: capTrackId,
          name: `Subtitles (${langCode})`,
          type: 'Caption',
          accepts: ['caption', 'Caption'],
          languageCode: langCode,
          visible: isVisible,
          config: defaultCaptionConfig,
          clipIds: [],
        };
        timeline.tracks.unshift(newCapTrack);
        capTrack = newCapTrack;
      } else {
        capTrack.languageCode = langCode;
        capTrack.visible = isVisible;
        capTrack.config = defaultCaptionConfig;
        if (!Array.isArray(capTrack.clipIds)) capTrack.clipIds = [];
      }

      // 3. Build & Sync clips for this language
      rawScenes.forEach((scene: SceneEntity, idx: number) => {
        const scIdx = scene.index || (idx + 1);
        const vClipId = `clip_v_${episodeId}_s${scIdx}`;
        const vClip = timeline.clips[vClipId];
        const sceneFromUs = vClip?.timing?.display?.from ?? (idx * 6_000_000);
        const sceneDurUs = vClip?.timing?.duration ?? ((Number(scene.duration_seconds) || 6) * 1_000_000);
        const sceneEndUs = sceneFromUs + sceneDurUs;
        const hasDialogue = this.checkSceneHasDialogue(scene);
        if (vClip) {
          vClip.volume = hasDialogue ? 0 : 1;
        }
        // Also ensure any matching scene clip on track_video has volume properly set
        Object.values(timeline.clips || {}).forEach((c: any) => {
          if (c && (c.trackId === 'track_video' || c.type === 'Video')) {
            if (c.id === vClipId || c.id?.endsWith(`_s${scIdx}`) || c.name?.includes(`Scene #${scIdx}`) || c.name?.includes(`Scene ${scIdx}`)) {
              c.volume = hasDialogue ? 0 : 1;
            }
          }
        });
        const characterDialogue = hasDialogue && scene.dialogue?.[0] ? scene.dialogue[0].character : '';
        const trans = scene.translations?.[langCode];

        const voClipId = `clip_vo_${episodeId}_s${scIdx}_${safeLang}`;
        const rawVoUrl = trans?.voiceover_url || (isPrimary ? scene.voiceover_url : null);
        const voUrl = (rawVoUrl && !rawVoUrl.startsWith('/api/assets/file/voice_')) ? rawVoUrl : null;

        // --- Voiceover Management ---
        if (voTrack) {
          if (hasDialogue && voUrl) {
            const ltCues = (trans?.captions_data && trans.captions_data.length > 0)
              ? trans.captions_data
              : (isPrimary ? (scene.captions_data || []) : []);
            const firstCue = ltCues[0];
            const lastCue = ltCues[ltCues.length - 1];

            const cueVoiceDurUs = (firstCue && lastCue)
              ? Math.min(sceneDurUs, Math.max(500_000, ((Number(lastCue.end_ms) || (sceneDurUs / 1000)) - (Number(firstCue.start_ms) || 0)) * 1000))
              : sceneDurUs;
            const voFromUs = sceneFromUs + (firstCue?.start_ms ? Math.round(Number(firstCue.start_ms) * 1000) : 0);
            const voToUs = Math.min(sceneEndUs, voFromUs + cueVoiceDurUs);

            if (!voTrack.clipIds.includes(voClipId)) {
              voTrack.clipIds.push(voClipId);
            }
            timeline.clips[voClipId] = {
              id: voClipId,
              trackId: voTrackId,
              type: 'Audio',
              name: `Voice #${scIdx} (${langCode})`,
              src: voUrl,
              timing: {
                display: { from: voFromUs, to: voToUs },
                trim: { from: 0, to: cueVoiceDurUs },
                duration: cueVoiceDurUs,
                playbackRate: 1,
              },
              visible: isPrimary,
              volume: 1,
              style: {},
              locked: false,
              transform: {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                angle: 0,
                zIndex: 0,
                opacity: 1,
              },
            };
          } else {
            // No dialogue or voiceover: Remove old voiceover clip from timeline
            delete timeline.clips[voClipId];
            voTrack.clipIds = voTrack.clipIds.filter(id => id !== voClipId);
          }
        }

        // --- Caption Cues Management ---
        const capPrefix = `clip_cap_${episodeId}_s${scIdx}_${safeLang}_`;
        if (capTrack) {
          let ltCues: Array<SceneCaptionData> = (trans?.captions_data && trans.captions_data.length > 0)
            ? trans.captions_data
            : (isPrimary ? (scene.captions_data || []) : []);

          const rawSceneWords: SceneCaptionWord[] = trans?.words || (isPrimary ? scene.words : []) || [];

          // If ltCues is empty or has only 1 monolithic cue, but rawSceneWords is available:
          if ((!ltCues || ltCues.length <= 1) && Array.isArray(rawSceneWords) && rawSceneWords.length > 0) {
            const groupedCues = CaptionService.groupWordsIntoCues(rawSceneWords);
            if (groupedCues.length > 0) {
              ltCues = groupedCues;
            }
          }

          if (hasDialogue && ltCues.length > 0) {
            const activeCapClipIds = new Set<string>();
            let lastEndUs = sceneFromUs;

            ltCues.forEach((cue: SceneCaptionData, cIdx: number) => {
              const capClipId = `${capPrefix}${cIdx + 1}`;
              activeCapClipIds.add(capClipId);

              if (!capTrack!.clipIds.includes(capClipId)) {
                capTrack!.clipIds.push(capClipId);
              }

              // Calculate start and end ms safely
              const rawStartMs = (cue as any).start_ms !== undefined ? Number((cue as any).start_ms) : ((cue as any).startMs !== undefined ? Number((cue as any).startMs) : ((cue as any).from_us !== undefined ? Number((cue as any).from_us) / 1000 : 0));
              const rawEndMs = (cue as any).end_ms !== undefined ? Number((cue as any).end_ms) : ((cue as any).endMs !== undefined ? Number((cue as any).endMs) : (rawStartMs + 2000));

              let cueFromUs = sceneFromUs + Math.round(rawStartMs * 1000);
              let cueToUs = sceneFromUs + Math.round(rawEndMs * 1000);

              // 1. Strict overlap prevention: current cue cannot start before previous cue ends
              if (cueFromUs < lastEndUs) {
                cueFromUs = lastEndUs;
              }

              // 2. Minimum duration & Scene boundary clamping
              if (cueToUs <= cueFromUs) {
                cueToUs = Math.min(sceneEndUs, cueFromUs + 1_500_000);
              }
              if (cueToUs > sceneEndUs) {
                cueToUs = sceneEndUs;
              }

              const cueDurUs = Math.max(200_000, cueToUs - cueFromUs);
              cueToUs = cueFromUs + cueDurUs;
              lastEndUs = cueToUs; // Advance watermark

              const cleanedCueText = CaptionService.cleanDialogueLine(cue.text || '', cue.character || characterDialogue);

              const cueWords: TimelineCaptionWord[] = Array.isArray(cue.words) && cue.words.length > 0
                ? (cue.words as TimelineCaptionWord[]).map((w: TimelineCaptionWord) => ({
                    text: CaptionService.cleanDialogueLine(w.text || '', cue.character || characterDialogue),
                    from: Number(w.from || 0),
                    to: Number(w.to || Math.round(cueDurUs / 1000)),
                    isKeyWord: Boolean(w.isKeyWord),
                  }))
                : (Array.isArray(rawSceneWords) && rawSceneWords.length > 0
                  ? (rawSceneWords as SceneCaptionWord[]).map((w: SceneCaptionWord, idx: number) => {
                      const wText = CaptionService.cleanDialogueLine(w.punctuated_word || w.word || '', cue.character || characterDialogue);
                      const wStartMs = Math.round(Number(w.start || 0) * 1000);
                      const wEndMs = Math.round(Number(w.end || (w.start || 0) + 0.3) * 1000);
                      const fromMs = Math.max(0, wStartMs - rawStartMs);
                      const toMs = Math.max(fromMs + 50, wEndMs - rawStartMs);
                      return {
                        text: wText,
                        from: fromMs,
                        to: toMs,
                        isKeyWord: Boolean(idx === 0 || idx === rawSceneWords.length - 1 || wText.length > 4),
                      };
                    })
                  : [{ text: cleanedCueText, from: 0, to: Math.round(cueDurUs / 1000), isKeyWord: true }]);

              const hasVoiceover = Boolean(hasDialogue && voUrl && timeline.clips[voClipId]);
              const targetSourceClipId = hasVoiceover ? voClipId : vClipId;

              timeline.clips[capClipId] = {
                id: capClipId,
                trackId: capTrackId,
                type: 'Caption',
                name: `Sub #${scIdx} (${langCode})`,
                text: cleanedCueText,
                mediaId: targetSourceClipId,
                metadata: {
                  sourceClipId: targetSourceClipId,
                },
                wordsPerLine: '',
                timing: {
                  display: { from: cueFromUs, to: cueToUs },
                  trim: { from: 0, to: cueDurUs },
                  duration: cueDurUs,
                  playbackRate: 1,
                },
                visible: isVisible,
                caption: {
                  words: cueWords,
                },
                style: {
                  color: textColor,
                },
                locked: false,
                effects: [],
                animations: [],
                transform: {
                  x: left,
                  y: top,
                  width: captionWidth,
                  height: captionHeight,
                  angle: 0,
                  opacity: 1,
                  zIndex: 10,
                  flip: {
                    x: false,
                    y: false,
                  },
                },
              };
            });

            // Clean up any stale caption clips if cue count was reduced
            capTrack.clipIds = capTrack.clipIds.filter((cid: string) => {
              if (cid.startsWith(capPrefix) && !activeCapClipIds.has(cid)) {
                delete timeline.clips[cid];
                return false;
              }
              return true;
            });
          } else {
            // No captions: Clean up all caption clips for this scene & language
            capTrack.clipIds = capTrack.clipIds.filter((cid: string) => {
              if (cid.startsWith(capPrefix)) {
                delete timeline.clips[cid];
                return false;
              }
              return true;
            });
          }
        }
      });

      // Purge orphan voiceover & caption clips from deleted scenes
      if (voTrack) {
        voTrack.clipIds = voTrack.clipIds.filter((cid: string) => {
          const match = cid.match(/_s(\d+)_/);
          if (match && !activeSceneIndices.has(Number(match[1]))) {
            delete timeline.clips[cid];
            return false;
          }
          return true;
        });
      }
      if (capTrack) {
        capTrack.clipIds = capTrack.clipIds.filter((cid: string) => {
          const match = cid.match(/_s(\d+)_/);
          if (match && !activeSceneIndices.has(Number(match[1]))) {
            delete timeline.clips[cid];
            return false;
          }
          return true;
        });
      }
    });
  }

  /**
   * Synchronize updated scene media (new video URLs, storyboards, audio) into an existing timeline
   */
  static syncTimelineWithScenes(episode: EpisodeEntity, timeline: IProject, series?: SeriesEntity | null): IProject {
    const rawScenes = this.extractScenes(episode);
    const episodeId = episode.id;
    const clips = { ...(timeline.clips || {}) };
    let tracks = Array.isArray(timeline.tracks) ? [...timeline.tracks] : [];

    const canvasWidth = timeline.settings?.width || 1080;
    const canvasHeight = timeline.settings?.height || 1920;

    // Prune legacy generic tracks
    tracks = tracks.filter(t => t.id !== 'track_voiceover_main' && t.id !== 'track_captions_main');
    Object.keys(clips).forEach(cid => {
      const clip = clips[cid];
      if (clip && (clip.trackId === 'track_voiceover_main' || clip.trackId === 'track_captions_main')) {
        delete clips[cid];
      }
    });

    // Ensure core tracks exist
    let videoTrack = tracks.find(t => t.id === 'track_video');
    if (!videoTrack) {
      videoTrack = { id: 'track_video', name: 'Scene Video (9:16)', type: 'Video', accepts: ['Video', 'Image'], clipIds: [] };
      tracks.push(videoTrack);
    }
    if (!Array.isArray(videoTrack.clipIds)) videoTrack.clipIds = [];

    let effectsTrack = tracks.find(t => t.id === 'track_effects');
    if (!effectsTrack) {
      effectsTrack = { id: 'track_effects', name: 'Visual Effects', type: 'Effect', accepts: ['Effect'], clipIds: [] };
      tracks.unshift(effectsTrack);
    }
    if (!Array.isArray(effectsTrack.clipIds)) effectsTrack.clipIds = [];

    let bgmTrack = tracks.find(t => t.id === 'track_bgm');
    if (!bgmTrack) {
      bgmTrack = { id: 'track_bgm', name: 'Background Music (BGM)', type: 'Audio', accepts: ['Audio'], clipIds: [] };
      tracks.push(bgmTrack);
    }
    if (!Array.isArray(bgmTrack.clipIds)) bgmTrack.clipIds = [];

    let currentTimelineUs = 0;

    rawScenes.forEach((scene: SceneEntity, idx: number) => {
      const scIdx = scene.index || (idx + 1);
      const vClipId = `clip_v_${episodeId}_s${scIdx}`;
      const sceneDurSeconds = Number(scene.duration_seconds) || 6;
      const sceneDurUs = sceneDurSeconds * 1_000_000;
      const fromUs = currentTimelineUs;
      const toUs = fromUs + sceneDurUs;
      const hasDialogue = this.checkSceneHasDialogue(scene);

      // 1. Video / Visual Clip
      if (clips[vClipId]) {
        if (scene.video_url) {
          clips[vClipId].src = scene.video_url;
          clips[vClipId].type = 'Video';
        } else if (scene.storyboard_frame_url) {
          clips[vClipId].src = scene.storyboard_frame_url;
          clips[vClipId].type = 'Image';
        }
        clips[vClipId].volume = hasDialogue ? 0 : 1;
        if (clips[vClipId].timing) {
          clips[vClipId].timing.display = { from: fromUs, to: toUs };
          clips[vClipId].timing.duration = sceneDurUs;
        }
      } else {
        const srcUrl = scene.video_url || scene.storyboard_frame_url || '/images/dashboard/poster-1.jpg';
        clips[vClipId] = {
          id: vClipId,
          trackId: 'track_video',
          type: scene.video_url ? 'Video' : 'Image',
          name: scene.heading || `Scene #${scIdx}`,
          src: srcUrl,
          timing: {
            display: { from: fromUs, to: toUs },
            trim: { from: 0, to: sceneDurUs },
            duration: sceneDurUs,
            playbackRate: 1,
          },
          volume: hasDialogue ? 0 : 1,
          style: {},
          locked: false,
          transform: {
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            angle: 0,
            zIndex: 10,
            opacity: 1,
          },
        };
      }
      if (!videoTrack!.clipIds.includes(vClipId)) {
        videoTrack!.clipIds.push(vClipId);
      }

      // 2. Transition between visual clips
      const normalizedTransKey = normalizeTransitionKey(scene.transition_effect as string);
      if (scIdx > 1 && normalizedTransKey) {
        const transClipId = `clip_trans_${episodeId}_s${scIdx - 1}`;
        clips[transClipId] = {
          id: transClipId,
          type: 'Transition',
          name: `Transition: ${normalizedTransKey}`,
          transitionKey: normalizedTransKey,
          duration: 1_000_000,
          fromClipId: `clip_v_${episodeId}_s${scIdx - 1}`,
          toClipId: vClipId,
        };
      }

      // 3. Visual Effect Clip on track_effects
      const normalizedEffKey = normalizeEffectKey(scene.video_effect as string);
      if (normalizedEffKey) {
        const effClipId = `clip_eff_${episodeId}_s${scIdx}`;
        clips[effClipId] = {
          id: effClipId,
          trackId: 'track_effects',
          type: 'Effect',
          name: `Effect: ${normalizedEffKey}`,
          effectKey: normalizedEffKey,
          intensity: 0.8,
          timing: {
            display: { from: fromUs, to: fromUs + 500_000 },
            trim: { from: 0, to: 500_000 },
            duration: 500_000,
            playbackRate: 1,
          },
          visible: true,
          style: {},
          locked: false,
        };
        if (!effectsTrack!.clipIds.includes(effClipId)) {
          effectsTrack!.clipIds.push(effClipId);
        }
      }

      // 4. BGM Clip (Music Track)
      if (scene.bgm_url) {
        const bgmClipId = `clip_bgm_${episodeId}_s${scIdx}`;
        if (clips[bgmClipId]) {
          clips[bgmClipId].src = scene.bgm_url;
          clips[bgmClipId].volume = hasDialogue ? 0.15 : 0;
          if (clips[bgmClipId].timing) {
            clips[bgmClipId].timing.display = { from: fromUs, to: toUs };
            clips[bgmClipId].timing.duration = sceneDurUs;
          }
        } else {
          clips[bgmClipId] = {
            id: bgmClipId,
            trackId: 'track_bgm',
            type: 'Audio',
            name: `BGM #${scIdx}`,
            src: scene.bgm_url,
            timing: {
              display: { from: fromUs, to: toUs },
              trim: { from: 0, to: sceneDurUs },
              duration: sceneDurUs,
              playbackRate: 1,
            },
            volume: hasDialogue ? 0.15 : 0,
            style: {},
            locked: false,
            transform: {
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              angle: 0,
              zIndex: 0,
              opacity: 1,
            },
          };
        }
        if (!bgmTrack!.clipIds.includes(bgmClipId)) {
          bgmTrack!.clipIds.push(bgmClipId);
        }
      }

      currentTimelineUs += sceneDurUs;
    });

    // Fallback: If episode has bgm_url and no per-scene BGM was added, add a global episode BGM clip
    // if (episode.bgm_url && bgmTrack && bgmTrack.clipIds.length === 0) {
    //   const epBgmClipId = `clip_bgm_${episodeId}_main`;
    //   clips[epBgmClipId] = {
    //     id: epBgmClipId,
    //     trackId: 'track_bgm',
    //     type: 'Audio',
    //     name: 'Episode BGM',
    //     src: episode.bgm_url,
    //     timing: {
    //       display: { from: 0, to: currentTimelineUs },
    //       trim: { from: 0, to: currentTimelineUs },
    //       duration: currentTimelineUs,
    //       playbackRate: 1,
    //     },
    //     volume: 0.35,
    //     style: {},
    //     locked: false,
    //     transform: {
    //       x: 0,
    //       y: 0,
    //       width: 0,
    //       height: 0,
    //       angle: 0,
    //       zIndex: 0,
    //       opacity: 1,
    //     },
    //   };
    //   bgmTrack.clipIds.push(epBgmClipId);
    // }

    timeline.tracks = tracks;
    timeline.clips = clips;
    const primaryLang = episode.dubbing_languages?.[0] || episode.caption_languages?.[0] || series?.language || 'en-US';
    this.syncLanguageTracksIntoTimeline(timeline, episode, primaryLang, series);
    return this.sanitizeTimelineClips(timeline, episode);
  }

  /**
   * High-level method: Get or build the synchronized timeline for an episode
   */
  static async getOrBuildEpisodeTimeline(episodeId: string): Promise<IProject> {
    const db = await getDatabaseProvider();
    const episode = await db.getEpisodeById(episodeId);
    if (!episode) throw new Error(`Episode ${episodeId} not found`);

    const series = await db.getSeriesById(episode.series_id);
    const latest = await db.getLatestTimeline(episodeId);

    if (latest?.tracks && latest?.clips) {
      let updatedTimeline = this.syncTimelineWithScenes(episode, { ...latest }, series);
      updatedTimeline = TimelineService.sanitizeTimelineClips(updatedTimeline, episode);
      try {
        await db.saveTimeline(episodeId, updatedTimeline, { id: 'system', name: 'Studio System' }, 'Synchronized timeline with latest scene media');
      } catch (saveErr) {
        Logger.warn(`[TimelineService] Failed to auto-save synchronized timeline: ${saveErr}`);
      }

      PatchSyncService.broadcast(episode.series_id, 'timeline:updated', updatedTimeline);
      return updatedTimeline;
    }

    // Build fresh initial timeline
    let freshTimeline = this.buildInitialTimelineData(episode, series);
    try {
      freshTimeline = TimelineService.sanitizeTimelineClips(freshTimeline, episode);
      await db.saveTimeline(episodeId, freshTimeline, { id: 'system', name: 'Studio System' }, 'Auto-generated initial timeline from episode scenes');
    } catch (saveErr) {
      Logger.warn(`[TimelineService] Failed to auto-save initial timeline version: ${saveErr}`);
    }

    PatchSyncService.broadcast(episode.series_id, 'timeline:updated', freshTimeline);
    return freshTimeline;
  }
}

export const timelineService = TimelineService;

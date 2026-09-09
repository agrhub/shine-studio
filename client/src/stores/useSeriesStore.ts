import { defineStore } from 'pinia';
import { ref, computed, nextTick } from 'vue';
import http from '@/utils/http';
import { core } from '@/utils/project';
import { GEMINI_LANGUAGE_DEFAULTS, getLanguageByCode } from '@/constants/geminiLanguages';
import { sanitizeTimelineData, sanitizeEffectAndTransitionKeys } from '@/components/editor/data';
import { generateUUID } from '@/utils/id';
import type { Series, Episode, Character, Scene, SceneDialogue, SceneTranslation, CaptionCue, LanguageTrack, CaptionsData, CaptionSettings, DubbingSettings, RenderVersionEntity } from '../types/api';
// import { IProject } from '@openvideo/timeline';
import { useProjectStore } from '@/stores/useProjectStore';
import { usePlaybackStore } from '@/composables/usePlaybackStore';
import { useStudioStore } from '@/composables/useStudioStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { toast } from 'vue-sonner';
import { IProject } from '@openvideo/core';

export interface LoadTimelineOptions {
  forceReset?: boolean;
  silent?: boolean;
  timeline?: IProject;
}

export const useSeriesStore = defineStore('series', () => {
  const seriesList = ref<Series[]>([]);
  const currentSeries = ref<Series | null>(null);
  const episodesList = ref<Episode[]>([]);
  const charactersList = ref<Character[] | []>([]);
  const activeEpisodeId = ref<string>('');
  const currentMountedEpId = ref<string>('');
  const isEpisodeSwitching = ref(false);
  const activeLanguageCode = ref<string>('');
  const isLoading = ref(false);
  const isScriptLoading = ref(false);

  const activeEpisode = computed<Episode | null>(() => {
    return episodesList.value.find(ep => ep.id === activeEpisodeId.value) || episodesList.value[0] || null;
  });

  function setActiveLanguage(code: string) {
    if (!code) return;
    activeLanguageCode.value = code;
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  let activeFetchSeriesPromise: Promise<Series[]> | null = null;

  async function fetchSeriesList(params?: { userId?: string }): Promise<Series[]> {
    if (activeFetchSeriesPromise) return activeFetchSeriesPromise;
    isLoading.value = true;
    activeFetchSeriesPromise = (async () => {
      try {
        const res: any = await http.get('/series', { params });
        const list = res?.data?.series || res?.series || res?.data || res;
        seriesList.value = Array.isArray(list) ? list : [];
        return seriesList.value;
      } catch {
        seriesList.value = [];
        return [];
      } finally {
        isLoading.value = false;
        activeFetchSeriesPromise = null;
      }
    })();
    return activeFetchSeriesPromise;
  }

  async function createSeries(data: {
    title: string;
    genre: string;
    visualStyle?: string;
    visualStylePrompt?: string;
    episodeCount?: number;
    userId?: string;
    masterPlan?: any;
    description?: string;
    synopsis?: string;
    country?: string;
    ratio?: string;
    characters?: any[];
    locations?: any[];
    props?: any[];
  }) : Promise<Series> {
    isLoading.value = true;
    try {
      const res: any = await http.post('/series', data);
      const newSeries = res.series || res.data?.series || res.data || res;
      seriesList.value.unshift(newSeries);
      return newSeries;
    } finally {
      isLoading.value = false;
    }
  }

  // Unified single loader for entire workspace
  async function loadWorkspaceData(seriesId: string) {
    isLoading.value = true;
    try {
      const res: any = await http.get(`/series/${seriesId}`);
      if (res?.data?.series) {
        currentSeries.value = res.data.series;

        // 1. Sync Characters
        const rawChars = res.data.series.characters || res.data.series.master_plan?.characters || [];
        if (Array.isArray(rawChars) && rawChars.length > 0) {
          charactersList.value = rawChars.map((c: Character, idx: number) => ({
            ...c,
            id: c.id || `char_${seriesId}_${idx + 1}`,
            series_id: seriesId,
            name: c.name,
            role: c.role || 'protagonist',
            gender: c.gender || (idx === 0 ? 'male' : idx === 1 ? 'female' : 'neutral'),
            age: c.age || 25,
            nationality: c.nationality || res.data.series.country || 'Vietnam',
            voice_id: c.voice_id || (c.gender === 'female' ? 'Kore' : 'Fenrir'),
            identity: c.identity || '',
            traits: c.traits || '',
            visual_traits: c.visual_traits || '',
            physical_characteristics: c.physical_characteristics || '',
            appearance: c.appearance || '',
            clothing_and_accessories: c.clothing_and_accessories || '',
            speech_style: c.speech_style || 'Sharp and concise',
            avatar: c.avatar || undefined,
            lora_model: c.lora_model || `lora-${(c.name || 'char').toLowerCase().replace(/\s+/g, '-')}-sdxl`,
            description: c.description || '',
            wardrobe_variants: Array.isArray(c.wardrobe_variants) ? c.wardrobe_variants : [],
            frame_description: c.frame_description || '',
          }));
        }

        // 2. Sync Episodes
        if (res.data.episodes && Array.isArray(res.data.episodes)) {
          episodesList.value = res.data.episodes.map((ep: Episode, idx: number): Episode => {
            const scenes = Array.isArray(ep.scenes) ? ep.scenes : [];
            const scenesTotalDuration = scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0);
            const rawDur = Number(ep.duration_seconds) || Number(ep.duration) || 0;
            const durSeconds = scenesTotalDuration > 0
              ? scenesTotalDuration
              : (rawDur > 0 ? rawDur : (Number(res.data.series?.episode_duration) || 90));

            return {
              id: ep.id,
              number: Number(ep.episode_number) || idx + 1,
              episode_number: Number(ep.episode_number) || idx + 1,
              title: ep.title || `Episode ${idx + 1}`,
              synopsis: ep.synopsis || '',
              screenplay: ep.screenplay || '',
              // script: ep.script || ep.screenplay || '',
              scene_core: ep.scene_core || '',
              conflict_escalation: ep.conflict_escalation || '',
              cliffhanger_hook: ep.cliffhanger_hook || '',
              duration: formatTime(durSeconds),
              duration_seconds: durSeconds,
              scenes_count: scenes.length || 0,
              status: ep.status === 'PUBLISHED' ? 'PUBLISHED' : ep.status === 'REVIEW' ? 'REVIEWING' : 'LIVE EDITING',
              cover_image: ep.cover_image || (Array.isArray(ep.scenes) && (ep.scenes[0]?.storyboard_frame_url)) || '/images/dashboard/episode-thumb-default.jpg',
              scenes,
              characters: ep.characters || res.data.series?.characters || [],
              locations: ep.locations || res.data.series?.locations || [],
              props: ep.props || res.data.series?.props || [],
            };
          });

          if (episodesList.value.length > 0) {
            const exists = episodesList.value.some(e => e.id === activeEpisodeId.value);
            if (!exists) {
              activeEpisodeId.value = episodesList.value[0].id;
            }
          } else {
            activeEpisodeId.value = '';
          }
        }

        // 3. Load script for active episode
        if (activeEpisodeId.value) {
          await loadEpisode(seriesId, activeEpisodeId.value);
        }
      }
      return { series: currentSeries.value, episodes: episodesList.value, characters: charactersList.value };
    } finally {
      isLoading.value = false;
    }
  }

  function updateEpisode(episode: Episode) {
    const targetEp = episodesList.value.find(e => e.id === episode.id);
    if (targetEp) {
      if (episode.title) targetEp.title = episode.title;
      if (episode.synopsis) targetEp.synopsis = episode.synopsis;
      if (episode.screenplay) {
        targetEp.screenplay = episode.screenplay;
      }
      // if(episode.script){
      //   targetEp.script = episode.script;
      // }
      if (episode.characters) {
        targetEp.characters = episode.characters;
      }
      if (episode.locations) {
        targetEp.locations = episode.locations;
      }
      if (episode.props) {
        targetEp.props = episode.props;
      }
      if (episode.scene_core) targetEp.scene_core = episode.scene_core;
      if (episode.conflict_escalation) targetEp.conflict_escalation = episode.conflict_escalation;
      if (episode.cliffhanger_hook) targetEp.cliffhanger_hook = episode.cliffhanger_hook;
      let epDur = 0;
      if (episode.scenes && Array.isArray(episode.scenes)) {
        targetEp.scenes = episode.scenes;
        targetEp.scenes_count = episode.scenes.length || 0;
        const scenesTotal = episode.scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0);
        if (scenesTotal > 0) {
          epDur = scenesTotal;
        }
      }
      if (!epDur) {
        const d = Number((episode as any).total_duration_seconds || episode.duration_seconds || episode.duration || 0);
        if (d > 0) {
          epDur = d;
        }
      }
      if (epDur > 0) {
        targetEp.duration_seconds = epDur;
        targetEp.duration = formatTime(epDur);
      }
      episodesList.value = [...episodesList.value];
      if (episode.dubbing_settings) {
        targetEp.dubbing_settings = episode.dubbing_settings;
      }
      if (episode.caption_settings) {
        targetEp.caption_settings = episode.caption_settings;
      }
      const primaryCode = currentSeries.value?.language || 'en-US';
      const capLangs = Array.isArray(episode.caption_languages) && episode.caption_languages.length > 0
        ? episode.caption_languages
        : [primaryCode];
      const dubLangs = Array.isArray(episode.dubbing_languages) && episode.dubbing_languages.length > 0
        ? episode.dubbing_languages
        : [primaryCode];

      captionLanguages.value = Array.from(new Set<string>(capLangs));
      dubbingLanguages.value = Array.from(new Set<string>(dubLangs));
      (targetEp.scenes || []).forEach((sc: Scene) => {
        if (sc.translations && typeof sc.translations === 'object') {
          Object.keys(sc.translations).forEach((code: string) => {
            if (code && code !== primaryCode) {
              if (!captionLanguages.value.includes(code)) captionLanguages.value.push(code);
              if (!dubbingLanguages.value.includes(code)) dubbingLanguages.value.push(code);
            }
          });
        }
      });
      if (!activePreviewCaptionLang.value || !captionLanguages.value.includes(activePreviewCaptionLang.value)) {
        activePreviewCaptionLang.value = primaryCode;
      }
      if (!activePreviewVoiceLang.value || !dubbingLanguages.value.includes(activePreviewVoiceLang.value)) {
        activePreviewVoiceLang.value = primaryCode;
      }
      return targetEp;
    }
    return activeEpisode.value;
  }

  async function loadEpisode(seriesId: string, epId: string, episode?: Episode) {
    if (episode && episode.scenes && episode.scenes.length > 0
      && episode.screenplay && episode.characters
      && episode.locations && episode.props) {
      return updateEpisode(episode);
    }
    isScriptLoading.value = true;
    try {
      const res: any = await http.get(`/series/${seriesId}/episodes/${epId}`);
      if (res?.data) {
        return updateEpisode(res.data);
      }
    } catch (e) {
      console.warn('Failed to load episode', e);
      return null;
    } finally {
      isScriptLoading.value = false;
    }
  }

  async function selectEpisode(epId: string): Promise<IProject | null> {
    if (!epId) return null;
    if (activeEpisodeId.value === epId && currentMountedEpId.value === epId) {
      return null;
    }
    isEpisodeSwitching.value = true;
    activeEpisodeId.value = epId;
    try {
      if (currentSeries.value?.id) {
        await loadEpisode(currentSeries.value.id, epId);
      }
      return await loadEpisodeTimeline(epId, { forceReset: true });
    } finally {
      isEpisodeSwitching.value = false;
    }
  }

  async function generateScriptForEpisode(epId: string, overrides?: any) {
    if (!currentSeries.value?.id) return null;
    isScriptLoading.value = true;
    try {
      const res: any = await http.post(`/series/${currentSeries.value.id}/episodes/${epId}/generate-script`, overrides || {});
      if (res?.data) {
        const targetEp = episodesList.value.find(e => e.id === epId);
        if (targetEp) {
          if (res.data.screenplay) {
            targetEp.screenplay = res.data.screenplay;
          }
          if (res.data.characters) {
            targetEp.characters = res.data.characters;
          }
          if (res.data.locations) {
            targetEp.locations = res.data.locations;
          }
          if (res.data.props) {
            targetEp.props = res.data.props;
          }
          if (res.data.scenes && Array.isArray(res.data.scenes)) {
            targetEp.scenes = res.data.scenes;
            targetEp.scenes_count = res.data.scenes?.length || 0;
            const scenesTotal = res.data.scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0);
            const epDur = scenesTotal > 0 ? scenesTotal : Number(res.data.total_duration_seconds || res.data.duration_seconds || res.data.duration || 0);
            if (epDur > 0) {
              targetEp.duration_seconds = epDur;
              targetEp.duration = formatTime(epDur);
            }
            episodesList.value = [...episodesList.value];
          }
        }
      }
      return activeEpisode.value;
    } catch (e) {
      console.warn('Failed to generate script for episode', e);
      return null;
    } finally {
      isScriptLoading.value = false;
    }
  }

  async function getSeriesById(id: string) {
    return loadWorkspaceData(id);
  }

  // ─── Asset Update Mutations ───────────────────────────────────────────────

  function updateCharacterAvatar(charId: string, avatarUrl: string) {
    const char = charactersList.value.find(c => c.id === charId || c.name?.toLowerCase() === charId?.toLowerCase());
    if (char) {
      char.avatar = avatarUrl;
    }
    const epChars = activeEpisode.value?.characters;
    if (epChars && Array.isArray(epChars)) {
      const epChar = epChars.find((c): c is Character => typeof c === 'object' && c !== null && (c.id === charId || c.name?.toLowerCase() === charId?.toLowerCase()));
      if (epChar && epChar.wardrobe_variants && epChar.wardrobe_variants.length > 0) {
        epChar.wardrobe_variants[0].image_url = avatarUrl;
      }
    }
  }

  function getCharacterById(id: string) {
    if (!id) return undefined;
    return charactersList.value.find(c => c.id === id || c.name?.toLowerCase().trim() === id?.toLowerCase().trim());
  }

  function updateSceneStoryboard(epId: string, sceneIndex: number, url: string) {
    const ep = episodesList.value.find(e => e.id === epId);
    if (ep) {
      if (ep.scenes) {
        const scene = ep.scenes.find(s => s.index === sceneIndex);
        if (scene) {
          scene.storyboard_frame_url = url;
        }
      }
      // Auto-update episode thumbnail if scene 1 or no custom thumb
      if (sceneIndex === 1 || !ep.cover_image) {
        ep.cover_image = url;
      }
    }
  }

  function updateSceneVideoUrl(epId: string, sceneIndex: number, url: string) {
    const ep = episodesList.value.find(e => e.id === epId);
    if (ep?.scenes) {
      const scene = ep.scenes.find(s => s.index === sceneIndex);
      if (scene) scene.video_url = url;
    }
  }

  function updateSceneAssets(epId: string, sceneIndex: number, assets: { voiceover_url?: string; voiceoverUrl?: string; bgm_url?: string; bgmUrl?: string; captions_data?: CaptionsData[]; captionsData?: CaptionsData[]; voice_duration_us?: number; voiceDurationUs?: number; [key: string]: unknown }) {
    const vUrl = assets.voiceover_url || assets.voiceoverUrl;
    const bUrl = assets.bgm_url || assets.bgmUrl;
    const cData = assets.captions_data || assets.captionsData;
    const vDurUs = assets.voice_duration_us || assets.voiceDurationUs;

    const ep = episodesList.value.find(e => e.id === epId);
    if (ep?.scenes) {
      const scene = ep.scenes.find(s => s.index === sceneIndex);
      if (scene) {
        if (vUrl) scene.voiceover_url = vUrl;
        if (bUrl) scene.bgm_url = bUrl;
        if (cData) scene.captions_data = cData;
        if (vDurUs) scene.voice_duration_us = vDurUs;
      }
    }
  }

  // ─── Auto-save Episode Scenes & Settings to Server ────────────────────────────
  async function saveEpisodeScenes(seriesId: string, epId: string) {
    const ep = episodesList.value.find(e => e.id === epId);
    const scenes = ep?.scenes || [];
    if (!scenes.length) return;
    const thumbUrl = ep?.cover_image || scenes[0]?.storyboard_frame_url || '';
    try {
      await http.put(`/series/${seriesId}/episodes/${epId}`, {
        scenes,
        title: ep?.title,
        synopsis: ep?.synopsis,
        cover_image: thumbUrl,
        dubbing_settings: ep?.dubbing_settings || {},
        caption_settings: ep?.caption_settings || {},
        caption_languages: Array.from(new Set<string>(captionLanguages.value)),
        dubbing_languages: Array.from(new Set<string>(dubbingLanguages.value)),
      });
    } catch (err) {
      console.warn('[saveEpisodeScenes] Failed to auto-save episode scenes:', err);
    }
  }

  // ─── Render Version Operations ───────────────────────────────────────────
  async function addRenderVersion(
    seriesId: string,
    epId: string,
    versionData: Partial<RenderVersionEntity>,
    file?: File | Blob,
    thumbFile?: File | Blob
  ) {
    try {
      let res: any;
      if (file || thumbFile) {
        const formData = new FormData();
        if (file) {
          formData.append('file', file, (file as File).name || `render_${epId}.mp4`);
        }
        if (thumbFile) {
          formData.append('thumbnail', thumbFile, (thumbFile as File).name || `thumb_${epId}.jpg`);
        }
        if (versionData.language) formData.append('language', versionData.language);
        if (versionData.voice) formData.append('voice', versionData.voice);
        if (versionData.resolution) formData.append('resolution', versionData.resolution);
        if (typeof versionData.thumbnail_url === 'string' && !versionData.thumbnail_url.startsWith('blob:') && versionData.thumbnail_url !== '[object Blob]') {
          formData.append('thumbnail_url', versionData.thumbnail_url);
        }
        if (versionData.duration) formData.append('duration', String(versionData.duration));
        if (versionData.subtitles) formData.append('subtitles', JSON.stringify(versionData.subtitles));
        res = await http.post(`/series/${seriesId}/episodes/${epId}/render-versions`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        res = await http.post(`/series/${seriesId}/episodes/${epId}/render-versions`, versionData);
      }
      const newVer = res?.data?.version;
      const ep = episodesList.value.find(e => e.id === epId);
      if (ep && newVer) {
        if (!Array.isArray(ep.render_versions)) ep.render_versions = [];
        const idx = ep.render_versions.findIndex((v: any) => (v.version_id === newVer.version_id || v.id === newVer.id));
        if (idx >= 0) {
          ep.render_versions[idx] = newVer;
        } else {
          ep.render_versions.unshift(newVer);
        }
        if (newVer.video_url) ep.video_url = newVer.video_url;
      }
      return newVer;
    } catch (err: any) {
      console.error('[addRenderVersion] Failed:', err);
      throw err;
    }
  }

  async function removeRenderVersion(seriesId: string, epId: string, versionId: string) {
    try {
      const res: any = await http.delete(`/series/${seriesId}/episodes/${epId}/render-versions/${versionId}`);
      const remaining = res?.data?.render_versions;
      const ep = episodesList.value.find(e => e.id === epId);
      if (ep) {
        ep.render_versions = remaining || (ep.render_versions || []).filter((v: any) => (v.version_id !== versionId && v.id !== versionId));
        if (ep?.render_versions?.length === 0) {
          ep.video_url = undefined;
        } else {
          ep.video_url = ep?.render_versions?.[0].video_url || ep?.render_versions?.[0].url;
        }
      }
      return remaining;
    } catch (err: any) {
      console.error('[removeRenderVersion] Failed:', err);
      throw err;
    }
  }

  // ─── Language Track Mutations & Sync ──────────────────────────────────────────
  const LANGUAGE_DEFAULTS: Record<string, { label: string }> = GEMINI_LANGUAGE_DEFAULTS;

  const activePreviewCaptionLang = ref<string>('');
  const activePreviewVoiceLang = ref<string>('');
  const captionLanguages = ref<string[]>([]);
  const dubbingLanguages = ref<string[]>([]);

  function setCaptionLanguages(langs: string[]) {
    const clean = Array.from(new Set<string>(langs.filter(l => Boolean(l && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(l.trim())))));
    captionLanguages.value = clean;
    dubbingLanguages.value = clean;
    if (activePreviewCaptionLang.value !== 'off' && !captionLanguages.value.includes(activePreviewCaptionLang.value)) {
      setPreviewCaptionLanguage(captionLanguages.value[0] || 'off');
    }
  }

  function setDubbingLanguages(langs: string[]) {
    setCaptionLanguages(langs);
  }

  function addLanguage(langCode: string) {
    if (!langCode || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(langCode.trim())) return;
    const code = langCode.trim();
    if (!captionLanguages.value.includes(code)) {
      captionLanguages.value.push(code);
    }
    if (!dubbingLanguages.value.includes(code)) {
      dubbingLanguages.value.push(code);
    }
    if (activeEpisodeId.value) {
      const sId = currentSeries.value?.id;
      if (sId) saveEpisodeScenes(sId, activeEpisodeId.value);
    }
  }

  function removeLanguage(langCode: string) {
    const code = langCode.trim();
    captionLanguages.value = captionLanguages.value.filter(c => c !== code);
    dubbingLanguages.value = dubbingLanguages.value.filter(c => c !== code);
    if (activePreviewCaptionLang.value === code) {
      setPreviewCaptionLanguage(captionLanguages.value[0] || 'off');
    }
    if (activePreviewVoiceLang.value === code) {
      setPreviewVoiceLanguage(dubbingLanguages.value[0] || 'mute');
    }
    if (activeEpisodeId.value) {
      const sId = currentSeries.value?.id;
      if (sId) saveEpisodeScenes(sId, activeEpisodeId.value);
    }
  }

  function addCaptionLanguage(langCode: string) {
    addLanguage(langCode);
  }

  function removeCaptionLanguage(langCode: string) {
    removeLanguage(langCode);
  }

  function addDubbingLanguage(langCode: string) {
    addLanguage(langCode);
  }

  function removeDubbingLanguage(langCode: string) {
    removeLanguage(langCode);
  }

  const masterTracks = ref<any[]>([]);
  const masterClips = ref<Record<string, any>>({});

  function isMatchingLang(langA?: string | null, langB?: string | null): boolean {
    if (!langA || !langB) return false;
    const cleanA = langA.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanB = langB.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanA === cleanB || cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA);
  }

  function extractTrackLanguage(track: any): string | null {
    if (track.languageCode) return track.languageCode;
    if (track.id?.startsWith('track_caption_')) {
      const suffix = track.id.replace('track_caption_', '');
      if (suffix !== 'main') return suffix;
    }
    if (track.id?.startsWith('track_captions_')) {
      const suffix = track.id.replace('track_captions_', '');
      if (suffix !== 'main') return suffix;
    }
    if (track.id?.startsWith('track_voiceover_')) {
      const suffix = track.id.replace('track_voiceover_', '');
      if (suffix !== 'main') return suffix;
    }
    if (track.id?.startsWith('track_voice_')) {
      const suffix = track.id.replace('track_voice_', '');
      if (suffix !== 'main') return suffix;
    }
    if (track.type === 'Caption' || track.id === 'track_captions' || track.id === 'track_captions_main') {
      return currentSeries.value?.language || captionLanguages.value[0] || 'en-US';
    }
    if (track.id === 'track_voiceover' || track.id === 'track_voiceover_main') {
      return currentSeries.value?.language || dubbingLanguages.value[0] || 'en-US';
    }
    return null;
  }

  function initTimelineTracks(rawTracks: any[], rawClips: Record<string, any>) {
    const safeTracks = Array.isArray(rawTracks)
      ? rawTracks.filter(Boolean).map((t) => ({ ...t, clipIds: Array.isArray(t.clipIds) ? t.clipIds : [] }))
      : [];
    masterTracks.value = JSON.parse(JSON.stringify(safeTracks));
    masterClips.value = JSON.parse(JSON.stringify(rawClips || {}));
    applyLanguageTrackFilter();
  }

  function applyLanguageTrackFilter() {
    try {
      const state = core.store.getState();
      const allTracks = masterTracks.value.length > 0 ? masterTracks.value : ((state.tracks as any[]) || []);
      const allClips = Object.keys(masterClips.value).length > 0 ? masterClips.value : (state.clips || {});

      const primaryCode = currentSeries.value?.language || captionLanguages.value[0] || 'en-US';

      const capLang = activePreviewCaptionLang.value || primaryCode; // e.g. 'en-US' or 'vi-VN' or 'off'
      const voiceLang = activePreviewVoiceLang.value || primaryCode; // e.g. 'en-US' or 'vi-VN' or 'mute'

      const safeCapLang = capLang !== 'off' ? capLang.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
      const targetCaptionTrackId = safeCapLang ? `track_caption_${safeCapLang}` : '';

      const safeVoiceLang = voiceLang !== 'mute' ? voiceLang.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
      const targetVoiceTrackId = safeVoiceLang ? `track_voiceover_${safeVoiceLang}` : '';

      // Filter tracks: Keep only selected caption & voiceover tracks + base tracks (video, effects, bgm)
      const filteredTracks = allTracks.filter((track: any) => {
        if (!track || typeof track !== 'object') return false;
        if (!Array.isArray(track.clipIds)) track.clipIds = [];

        const isCaptionTrack = track.type === 'Caption' || track.id?.startsWith('track_caption') || track.id?.startsWith('track_captions');
        const isVoiceTrack = track.type === 'Audio' && (track.id?.startsWith('track_voiceover') || track.id?.startsWith('track_voice'));

        if (isCaptionTrack) {
          if (capLang === 'off') return false;
          if (targetCaptionTrackId && (track.id === targetCaptionTrackId || track.id === `track_caption_${capLang}`)) return true;
          const trackLang = extractTrackLanguage(track);
          return isMatchingLang(trackLang, capLang);
        }

        if (isVoiceTrack) {
          if (voiceLang === 'mute') return false;
          if (targetVoiceTrackId && (track.id === targetVoiceTrackId || track.id === `track_voiceover_${voiceLang}`)) return true;
          const trackLang = extractTrackLanguage(track);
          return isMatchingLang(trackLang, voiceLang);
        }

        return true;
      });

      // Update visibility & muting on filtered tracks
      filteredTracks.forEach((track: any) => {
        if (!Array.isArray(track.clipIds)) {
          track.clipIds = [];
        }
        const isCaptionTrack = track.type === 'Caption' || track.id?.startsWith('track_caption') || track.id?.startsWith('track_captions');
        const isVoiceTrack = track.type === 'Audio' && (track.id?.startsWith('track_voiceover') || track.id?.startsWith('track_voice'));

        if (isCaptionTrack) {
          track.visible = true;
        }
        if (isVoiceTrack) {
          track.muted = false;
          track.visible = true;
        }
      });

      // Filter clips: include clips that belong to the active tracks
      const activeTrackIds = new Set(filteredTracks.map((t: any) => t.id));
      const filteredClips: Record<string, any> = {};

      Object.keys(allClips).forEach((clipId) => {
        const clip = allClips[clipId];
        if (!clip) return;
        if (!clip.trackId || activeTrackIds.has(clip.trackId)) {
          filteredClips[clipId] = {
            ...clip,
            visible: true,
          };
        }
      });

      core.store.setState({
        ...state,
        tracks: filteredTracks,
        clips: filteredClips,
      });

      // Emit change event to trigger TimelineBridge synchronization
      try {
        (core as any).emit('change', [
          { op: 'update', path: '/tracks', value: filteredTracks },
          { op: 'update', path: '/clips', value: filteredClips },
          { op: 'update', path: '/', value: { ...state, tracks: filteredTracks, clips: filteredClips } },
        ]);
      } catch (_) {}

      // Refresh Pixi canvas to redraw the current frame
      try {
        const curTime = core.store.getState().currentTime || 0;
        core.playback.seek(curTime);
      } catch (_) {}
    } catch (err) {
      console.warn('[applyLanguageTrackFilter] Failed:', err);
    }
  }

  function setPreviewCaptionLanguage(langCode: string | 'off') {
    activePreviewCaptionLang.value = langCode;
    applyLanguageTrackFilter();
  }

  function setPreviewVoiceLanguage(langCode: string | 'mute') {
    activePreviewVoiceLang.value = langCode;
    applyLanguageTrackFilter();
  }

  function applyTimelineUpdate(projectData: any, isNewEpisode = false) {
    const currentState = core.store.getState();
    const currentClips = currentState.clips || {};
    const incomingClips = projectData.clips || {};
    const incomingTracks = projectData.tracks || [];

    const hasExistingClips = Object.keys(currentClips).length > 0;

    // If loading a completely different episode or initial empty state, perform a clean full reset
    if (isNewEpisode || !hasExistingClips) {
      try { core.pause(); } catch {}
      try{
        projectData = sanitizeTimelineData(projectData);
        core.project.import(projectData);
        console.log('Imported timeline data:', projectData);
        try { core.seek(0); } catch {}
        initTimelineTracks(projectData.tracks, projectData.clips);
      }catch(err){

      }
      return;
    }

    // --- Differential in-place property updates ---
    // If the resource (src) of Video, Audio, or Image has NOT changed, we update properties
    // in-place so the canvas engine preserves existing textures, video decoders, and audio elements.
    const clipUpdates: Array<{ id: string; updates: Partial<any> }> = [];
    const clipsToAdd: any[] = [];
    const incomingClipIds = new Set(Object.keys(incomingClips));
    const currentClipIds = new Set(Object.keys(currentClips));

    // 1. Process incoming clips
    for (const [id, incomingClip] of Object.entries<any>(incomingClips)) {
      const existing = currentClips[id];
      if (existing) {
        // Existing clip: update properties in-place
        clipUpdates.push({
          id,
          updates: incomingClip,
        });
      } else {
        // New clip to add
        clipsToAdd.push(incomingClip);
      }
    }

    // 2. Identify removed clips
    const clipIdsToRemove = [...currentClipIds].filter((id) => !incomingClipIds.has(id));

    // Remove deleted clips if any
    if (clipIdsToRemove.length > 0) {
      core.execute({
        id: generateUUID(),
        type: 'clip.remove',
        payload: { ids: clipIdsToRemove },
      });
    }

    // Apply batch in-place property updates
    if (clipUpdates.length > 0) {
      core.execute({
        id: generateUUID(),
        type: 'clip.update',
        payload: clipUpdates,
      });
    }

    // Add newly created clips
    for (const newClip of clipsToAdd) {
      core.execute({
        id: generateUUID(),
        type: 'clip.add',
        payload: { clip: newClip },
      });
    }

    // 3. Update tracks layout/structure
    core.execute({
      id: generateUUID(),
      type: 'track.set',
      payload: incomingTracks,
    });

    // 4. Update settings if changed
    if (projectData.settings) {
      core.store.getState().updateSettings(projectData.settings);
    }

    // 5. Update master tracks and clips in store cache
    initTimelineTracks(projectData.tracks, projectData.clips);
  }

  let loadingTimelinePromise: Promise<IProject | null> | null = null;
  let loadingEpId: string = '';

  async function loadEpisodeTimeline(epId: string, options: LoadTimelineOptions = {}): Promise<IProject | null> {
    if (!epId) return null;
    const forceReset = !!options.forceReset;
    const silent = !!options.silent;
    const incomingTimeline = options.timeline;

    // Deduplicate in-flight loads for the exact same episode without incoming timeline override
    if (loadingTimelinePromise && loadingEpId === epId && !forceReset && !incomingTimeline) {
      return loadingTimelinePromise;
    }

    const isNewEpisode = forceReset || (currentMountedEpId.value !== epId);
    loadingEpId = epId;

    loadingTimelinePromise = (async () => {
      try {
        let rawTimeline: IProject | null = incomingTimeline || null;
        if (!rawTimeline) {
          const res: any = await http.get(`/episodes/${epId}/timeline`);
          if (res?.data) {
            rawTimeline = res.data?.data || res.data;
          }
        }
        if (!rawTimeline) return null;

        // Check if another episode switch took precedence while fetching
        if (loadingEpId !== epId) {
          return null;
        }

        const projectData = sanitizeTimelineData(rawTimeline);
        applyTimelineUpdate(projectData, isNewEpisode);
        currentMountedEpId.value = epId;

        const targetEp = episodesList.value.find(e => e.id === epId);
        if (targetEp && projectData.settings?.duration) {
          const durSec = Math.round(projectData.settings.duration / 1_000_000);
          if (durSec > 0) {
            targetEp.duration_seconds = durSec;
            targetEp.duration = formatTime(durSec);
          }
          if (Array.isArray(projectData.tracks)) {
            const vTrack = projectData.tracks.find((t: any) => t.id === 'track_video' || t.type === 'video');
            if (vTrack && Array.isArray(vTrack.clipIds) && vTrack.clipIds.length > 0) {
              targetEp.scenes_count = vTrack.clipIds.length || 0;
            }
          }
          episodesList.value = [...episodesList.value];
        }

        // Synchronize UI stores (Project, Playback, Studio, Pipeline)
        try {
          const projectStore = useProjectStore();
          const { seek, setDuration, pause } = usePlaybackStore();
          const { state: studioState } = useStudioStore();
          const pipelineStore = usePipelineStore();

          if (isNewEpisode) {
            try { pause(); } catch {}
          }

          if (projectData.settings) {
            const targetRatio = currentSeries.value?.ratio || '9:16';
            projectStore.setCanvasSize({ width: projectData.settings.width, height: projectData.settings.height }, targetRatio);
            if (targetEp) {
              const epTitle = `EP ${String(targetEp.number).padStart(2, '0')}: ${targetEp.title.toUpperCase()}`;
              projectStore.setProjectName(epTitle);
            }
            projectStore.setFps(projectData.settings.fps || 30);
            if (projectData.settings.duration) {
              await setDuration(projectData.settings.duration / 1_000_000);
            }
            if (isNewEpisode) {
              seek(0);
            }
          }

          nextTick(() => {
            if (studioState.value.studio) {
              (studioState.value.studio as any).updateArtboardLayout?.();
              (studioState.value.studio as any).requestRender?.();
            }
          });

          pipelineStore.syncStepStatusesWithEpisode(activeEpisode.value, charactersList.value);
        } catch (uiErr) {
          console.warn('[useSeriesStore] Non-critical UI sync warning during loadEpisodeTimeline:', uiErr);
        }

        if (!silent) {
          toast.success('Project loaded');
        }

        return projectData;
      } catch (err) {
        console.error('[useSeriesStore] Failed to load episode timeline:', err);
        return null;
      } finally {
        if (loadingEpId === epId) {
          loadingTimelinePromise = null;
        }
      }
    })();

    return loadingTimelinePromise;
  }

  async function syncVoiceoverTrackToTimeline(epId: string, langCode: string) {
    activePreviewVoiceLang.value = langCode;
    await loadEpisodeTimeline(epId, { forceReset: true });
    applyLanguageTrackFilter();
  }

  async function syncCaptionTrackToTimeline(epId: string, langCode: string, _styleOpts?: any) {
    activePreviewCaptionLang.value = langCode;
    await loadEpisodeTimeline(epId, { forceReset: true });
    applyLanguageTrackFilter();
  }

  async function createEpisode(seriesId: string, data: { title: string; synopsis?: string }) {
    const res: any = await http.post(`/series/${seriesId}/episodes`, data);
    if (res?.data?.episode) {
      const ep = res.data.episode;
      const formattedEp = {
        id: ep.id,
        number: ep.episode_number,
        title: ep.title,
        duration: ep.duration,
        scenes_count: ep.scenes_count || ep.scenes?.length || 0,
        status: 'LIVE EDITING',
      };
      episodesList.value.push(formattedEp as any);
      return formattedEp;
    }
    return null;
  }

  const isReanalyzingScreenplay = ref(false);

  async function reanalyzeScreenplay(seriesId?: string, episodeId?: string) {
    const sId = seriesId || currentSeries.value?.id || '';
    const epId = episodeId || activeEpisodeId.value || '';
    if (!sId || !epId) return;

    const ep = episodesList.value.find(e => e.id === epId) || activeEpisode.value;
    const screenplayText = ep?.screenplay || '';
    if (!screenplayText.trim()) {
      throw new Error('No script available to analyze');
    }

    const targetDur = Number(currentSeries.value?.episode_duration) || 60;
    const currentScenes = ep?.scenes || [];

    isReanalyzingScreenplay.value = true;
    try {
      const res: any = await http.post('/assets/screenplay/analyze', {
        series_id: sId,
        episode_id: epId,
        screenplay: screenplayText,
        target_duration_seconds: targetDur,
        country: currentSeries.value?.country,
        language: currentSeries.value?.language,
        existing_scenes: currentScenes,
        existing_characters: charactersList.value,
        existing_locations: ep?.locations || currentSeries.value?.locations,
        existing_props: ep?.props || currentSeries.value?.props,
      });

      const resData = res?.data?.data || res?.data;
      if (resData && Array.isArray(resData.scenes)) {
        const targetEp = episodesList.value.find(e => e.id === epId);
        if (targetEp) {
          targetEp.scenes = resData.scenes;
          targetEp.scenes_count = resData.scenes.length || 0;
          const dur = Number(resData.total_duration_seconds || resData.duration_seconds || resData.duration) ||
            resData.scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0);
          if (dur > 0) {
            targetEp.duration_seconds = dur;
            targetEp.duration = formatTime(dur);
          }
          episodesList.value = [...episodesList.value];
        }
      }

      await loadEpisode(sId, epId);
      await loadEpisodeTimeline(epId, { forceReset: true });
      return resData;
    } finally {
      isReanalyzingScreenplay.value = false;
    }
  }

  async function saveWorkspaceSnapshot(seriesId: string, episodeId: string) {
    const state = core.store.getState();
    if (episodeId) {
      const currentMasterTracks = masterTracks.value?.length > 0 ? masterTracks.value : (state.tracks as any[]);
      const currentMasterClips = Object.keys(masterClips.value || {}).length > 0 ? masterClips.value : state.clips;

      const activeTrackMap = new Map((state.tracks as any[]).map((t: any) => [t.id, t]));
      const mergedTracks = currentMasterTracks.map((t: any) => activeTrackMap.get(t.id) || t);
      const mergedClips = { ...currentMasterClips, ...state.clips };

      await http.put(`/episodes/${episodeId}/timeline`, {
        settings: state.settings,
        tracks: mergedTracks,
        clips: mergedClips,
        changeSummary: 'Updated via Workspace Editor',
      });
    }

    if (seriesId && charactersList.value.length > 0) {
      await http.put(`/series/${seriesId}/characters`, {
        characters: charactersList.value,
      });
    }
  }

  function updateSceneTranslation(epId: string, sceneIndex: number, langCode: string, translationData: Partial<SceneTranslation>) {
    const ep = episodesList.value.find(e => e.id === epId);
    if (ep?.scenes) {
      const scene = ep.scenes.find((s: any) => s.index === sceneIndex);
      if (scene) {
        if (!scene.translations) scene.translations = {};
        scene.translations[langCode] = { ...(scene.translations[langCode] || {}), ...translationData };
      }
    }
  }

  function getSceneTranslation(epId: string, sceneIndex: number, langCode: string): SceneTranslation | undefined {
    const ep = episodesList.value.find(e => e.id === epId);
    const scene = ep?.scenes?.find((s: any) => s.index === sceneIndex);
    return scene?.translations?.[langCode];
  }

  async function updateLanguageTrackVoiceover(epId: string, langCode: string, sceneIndex: number, url: string) {
    const mainLang = currentSeries.value?.language || '';
    updateSceneTranslation(epId, sceneIndex, langCode, { voiceover_url: url });
    if (langCode === mainLang) {
      updateSceneAssets(epId, sceneIndex, { voiceoverUrl: url });
    }
    await syncVoiceoverTrackToTimeline(epId, langCode);
  }

  async function updateLanguageTrackCaptions(epId: string, langCode: string, sceneIndex: number, cues: CaptionCue[], words?: any[]) {
    const mainLang = currentSeries.value?.language;
    updateSceneTranslation(epId, sceneIndex, langCode, { captions_data: cues, ...(words ? { words } : {}) });
    if (langCode === mainLang) {
      updateSceneAssets(epId, sceneIndex, { captionsData: cues, ...(words ? { words } : {}) });
    }
    await syncCaptionTrackToTimeline(epId, langCode);
  }

  function updateLanguageTrackDialogue(epId: string, langCode: string, sceneIndex: number, text: string) {
    updateSceneTranslation(epId, sceneIndex, langCode, { dialogue: [{ character: '', line: text }] });
  }

  function getLanguageTrackDialogue(epId: string, langCode: string, sceneIndex: number): string | null {
    const trans = getSceneTranslation(epId, sceneIndex, langCode);
    if (!trans) return null;
    if (Array.isArray(trans.dialogue) && trans.dialogue.length > 0) {
      return trans.dialogue.map((d: any) => d.line || d.text || '').filter(Boolean).join(' ');
    }
    return null;
  }

  function updateEpisodeDubbingSettings(epId: string, settings: DubbingSettings) {
    const ep = episodesList.value.find(e => e.id === epId);
    if (ep) {
      ep.dubbing_settings = { ...(ep.dubbing_settings || {}), ...settings };
    }
  }

  function updateEpisodeCaptionSettings(epId: string, settings: CaptionSettings) {
    const ep = episodesList.value.find(e => e.id === epId);
    if (ep) {
      ep.caption_settings = { ...(ep.caption_settings || {}), ...settings };
    }
  }

  function getLanguageTracks(epId: string): LanguageTrack[] {
    const ep = episodesList.value.find(e => e.id === epId);
    const scenes = ep?.scenes || [];
    const mainLang = currentSeries.value?.language || 'en-US';
    const allLangs = [...new Set([...captionLanguages.value, ...dubbingLanguages.value, mainLang])];

    return allLangs.map(langCode => {
      const langInfo = getLanguageByCode(langCode);
      const label = LANGUAGE_DEFAULTS[langCode]?.label || langInfo?.nativeName || langCode;
      const sceneVoiceovers: Record<number, string> = {};
      const sceneCaptions: Record<number, any[]> = {};
      const sceneDialogues: Record<number, string> = {};

      scenes.forEach((sc: Scene) => {
        const scIdx = sc.index;
        if (langCode === mainLang) {
          if (sc.voiceover_url) sceneVoiceovers[scIdx] = sc.voiceover_url;
          if (sc.captions_data) sceneCaptions[scIdx] = sc.captions_data;
          if (sc.dialogue) {
            sceneDialogues[scIdx] = Array.isArray(sc.dialogue)
              ? sc.dialogue.map((d: SceneDialogue) => d.line).join(' ')
              : String(sc.dialogue);
          }
        } else if (sc.translations?.[langCode]) {
          const trans = sc.translations[langCode];
          if (trans.voiceover_url) sceneVoiceovers[scIdx] = trans.voiceover_url;
          if (trans.captions_data) sceneCaptions[scIdx] = trans.captions_data;
          if (Array.isArray(trans.dialogue) && trans.dialogue.length > 0) {
            sceneDialogues[scIdx] = trans.dialogue.map((d: any) => d.line || d.text || '').filter(Boolean).join(' ');
          }
        }
      });

      return {
        language_code: langCode,
        language_label: label,
        scene_voiceovers: sceneVoiceovers,
        scene_captions: sceneCaptions,
        scene_dialogues: sceneDialogues,
      };
    });
  }

  // ─── Auto-save Character Avatars to Server ─────────────────────────────────
  async function saveCharacterAvatars(seriesId: string) {
    try {
      await http.put(`/series/${seriesId}/characters`, {
        characters: charactersList.value,
      });
    } catch (err) {
      console.warn('[saveCharacterAvatars] Failed to auto-save character avatars:', err);
    }
  }

  async function updateSeries(id: string, updates: {
    title?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'PUBLISHED' | 'ARCHIVED';
    description?: string;
    visual_style?: string;
    genre?: string;
  }) {
    isLoading.value = true;
    try {
      const res: any = await http.patch(`/series/${id}`, updates);
      const updated = res?.data?.series || res?.series || res?.data;
      if (updated) {
        const idx = seriesList.value.findIndex(s => s.id === id);
        if (idx >= 0) {
          seriesList.value[idx] = { ...seriesList.value[idx], ...updated };
        }
        if (currentSeries.value?.id === id) {
          currentSeries.value = { ...currentSeries.value, ...updated };
        }
      }
      return updated;
    } finally {
      isLoading.value = false;
    }
  }

  async function renameSeries(id: string, title: string) {
    return updateSeries(id, { title });
  }

  async function archiveSeries(id: string) {
    return updateSeries(id, { status: 'ARCHIVED' });
  }

  async function unarchiveSeries(id: string) {
    return updateSeries(id, { status: 'DRAFT' });
  }

  async function deleteSeries(id: string) {
    isLoading.value = true;
    try {
      await http.delete(`/series/${id}`);
      seriesList.value = seriesList.value.filter(s => s.id !== id);
      if (currentSeries.value?.id === id) {
        currentSeries.value = null;
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function updateCharacter(charId: string, updates: Partial<Character>) {
    const char = charactersList.value.find(c => c.id === charId || c.name === charId);
    if (char) {
      Object.assign(char, updates);
    }
    const seriesId = currentSeries.value?.id;
    if (seriesId) {
      try {
        await http.put(`/series/${seriesId}/characters`, {
          characters: charactersList.value,
        });
      } catch (err) {
        console.warn('Failed to update character to server:', err);
      }
    }
  }

  return {
    seriesList,
    currentSeries,
    episodesList,
    charactersList,
    activeEpisodeId,
    activeEpisode,
    isLoading,
    isScriptLoading,
    fetchSeriesList,
    createSeries,
    updateSeries,
    renameSeries,
    archiveSeries,
    unarchiveSeries,
    getSeriesById,
    loadWorkspaceData,
    loadEpisode,
    updateEpisode,
    selectEpisode,
    generateScriptForEpisode,
    deleteSeries,
    getCharacterById,
    updateCharacter,
    updateCharacterAvatar,
    updateSceneStoryboard,
    updateSceneVideoUrl,
    updateSceneAssets,
    saveEpisodeScenes,
    addRenderVersion,
    removeRenderVersion,
    saveCharacterAvatars,
    updateLanguageTrackVoiceover,
    updateLanguageTrackCaptions,
    updateLanguageTrackDialogue,
    getLanguageTrackDialogue,
    updateEpisodeDubbingSettings,
    updateEpisodeCaptionSettings,
    getLanguageTracks,
    activeLanguageCode,
    setActiveLanguage,
    LANGUAGE_DEFAULTS,
    activePreviewCaptionLang,
    activePreviewVoiceLang,
    captionLanguages,
    dubbingLanguages,
    setCaptionLanguages,
    setDubbingLanguages,
    addCaptionLanguage,
    removeCaptionLanguage,
    addDubbingLanguage,
    removeDubbingLanguage,
    setPreviewCaptionLanguage,
    setPreviewVoiceLanguage,
    loadEpisodeTimeline,
    createEpisode,
    isReanalyzingScreenplay,
    reanalyzeScreenplay,
    saveWorkspaceSnapshot,
    syncVoiceoverTrackToTimeline,
    syncCaptionTrackToTimeline,
    masterTracks,
    masterClips,
    initTimelineTracks,
    applyLanguageTrackFilter,
    formatTime,
    currentMountedEpId,
    isEpisodeSwitching,
  };
});

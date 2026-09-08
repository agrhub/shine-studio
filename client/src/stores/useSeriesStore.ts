import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import http from '@/utils/http';
import { core } from '@/utils/project';
import { GEMINI_LANGUAGE_DEFAULTS, getLanguageByCode } from '@/constants/geminiLanguages';
import { sanitizeTimelineData } from '@/components/editor/data';
import { generateUUID } from '@/utils/id';
import type { Series, Episode, Character, Scene, SceneDialogue, SceneTranslation, CaptionCue, LanguageTrack, CaptionsData, CaptionSettings, DubbingSettings, RenderVersionEntity } from '../types/api';

export const useSeriesStore = defineStore('series', () => {
  const seriesList = ref<Series[]>([]);
  const currentSeries = ref<Series | null>(null);
  const episodesList = ref<Episode[]>([]);
  const charactersList = ref<Character[] | []>([]);
  const activeEpisodeId = ref<string>('');
  const activeLanguageCode = ref<string>('');
  const activeScript = ref<Episode | null>(null);
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
          episodesList.value = res.data.episodes.map((ep: any, idx: number): Episode => {
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
              screenplay: ep.screenplay || ep.script || '',
              script: ep.script || ep.screenplay || '',
              scene_core: ep.scene_core || '',
              conflict_escalation: ep.conflict_escalation || '',
              cliffhanger_hook: ep.cliffhanger_hook || '',
              duration: formatTime(durSeconds),
              duration_seconds: durSeconds,
              scenes_count: `${scenes.length || 3} scenes`,
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
          await loadEpisodeScript(seriesId, activeEpisodeId.value);
        }
      }
      return { series: currentSeries.value, episodes: episodesList.value, characters: charactersList.value };
    } finally {
      isLoading.value = false;
    }
  }

  async function loadEpisodeScript(seriesId: string, epId: string) {
    isScriptLoading.value = true;
    try {
      const res: any = await http.get(`/series/${seriesId}/episodes/${epId}/script`);
      if (res?.data) {
        activeScript.value = res.data;
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
          let epDur = 0;
          if (res.data.scenes && Array.isArray(res.data.scenes)) {
            targetEp.scenes = res.data.scenes;
            targetEp.scenes_count = `${res.data.scenes.length} scenes`;
            const scenesTotal = res.data.scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0);
            if (scenesTotal > 0) {
              epDur = scenesTotal;
            }
          }
          if (!epDur) {
            const d = Number(res.data.total_duration_seconds || res.data.duration_seconds || res.data.duration || 0);
            if (d > 0) {
              epDur = d;
            }
          }
          if (epDur > 0) {
            targetEp.duration_seconds = epDur;
            targetEp.duration = formatTime(epDur);
          }
          episodesList.value = [...episodesList.value];
          if (res.data.dubbing_settings) {
            targetEp.dubbing_settings = res.data.dubbing_settings;
          }
          if (res.data.caption_settings) {
            targetEp.caption_settings = res.data.caption_settings;
          }
          const primaryCode = currentSeries.value?.language || 'en-US';
          const capLangs = Array.isArray(res.data.caption_languages) && res.data.caption_languages.length > 0
            ? res.data.caption_languages
            : [primaryCode];
          const dubLangs = Array.isArray(res.data.dubbing_languages) && res.data.dubbing_languages.length > 0
            ? res.data.dubbing_languages
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
        }
      }
      return activeScript.value;
    } catch (e) {
      console.warn('Failed to load episode script', e);
      return null;
    } finally {
      isScriptLoading.value = false;
    }
  }

  async function selectEpisode(epId: string) {
    activeEpisodeId.value = epId;
    if (currentSeries.value?.id) {
      await loadEpisodeScript(currentSeries.value.id, epId);
    }
  }

  async function generateScriptForEpisode(epId: string, overrides?: any) {
    if (!currentSeries.value?.id) return null;
    isScriptLoading.value = true;
    try {
      const res: any = await http.post(`/series/${currentSeries.value.id}/episodes/${epId}/generate-script`, overrides || {});
      if (res?.data) {
        activeScript.value = res.data;
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
            targetEp.scenes_count = `${res.data.scenes.length} scenes`;
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
      return activeScript.value;
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
    // Update in activeScript
    if (activeScript.value?.scenes) {
      const scene = activeScript.value.scenes.find(s => s.index === sceneIndex);
      if (scene) {
        scene.storyboard_frame_url = url;
      }
    }
    // Update in episodesList scenes
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
    if (activeScript.value?.scenes) {
      const scene = activeScript.value.scenes.find(s => s.index === sceneIndex);
      if (scene) scene.video_url = url;
    }
    const ep = episodesList.value.find(e => e.id === epId);
    if (ep) {
      if (ep.scenes) {
        const scene = ep.scenes.find(s => s.index === sceneIndex);
        if (scene) scene.video_url = url;
      }
    }
  }

  function updateSceneAssets(epId: string, sceneIndex: number, assets: { voiceover_url?: string; voiceoverUrl?: string; bgm_url?: string; bgmUrl?: string; captions_data?: CaptionsData[]; captionsData?: CaptionsData[]; voice_duration_us?: number; voiceDurationUs?: number; [key: string]: unknown }) {
    const vUrl = assets.voiceover_url || assets.voiceoverUrl;
    const bUrl = assets.bgm_url || assets.bgmUrl;
    const cData = assets.captions_data || assets.captionsData;
    const vDurUs = assets.voice_duration_us || assets.voiceDurationUs;

    if (activeScript.value?.scenes) {
      const scene = activeScript.value.scenes.find(s => s.index === sceneIndex);
      if (scene) {
        if (vUrl) scene.voiceover_url = vUrl;
        if (bUrl) scene.bgm_url = bUrl;
        if (cData) scene.captions_data = cData;
        if (vDurUs) scene.voice_duration_us = vDurUs;
      }
    }
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
    const scenes = ep?.scenes || activeScript.value?.scenes || [];
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
  async function addRenderVersion(seriesId: string, epId: string, versionData: Partial<RenderVersionEntity>, file?: File | Blob) {
    try {
      let res: any;
      if (file) {
        const formData = new FormData();
        formData.append('file', file, (file as File).name || `render_${epId}.mp4`);
        if (versionData.language) formData.append('language', versionData.language);
        if (versionData.voice) formData.append('voice', versionData.voice);
        if (versionData.resolution) formData.append('resolution', versionData.resolution);
        if (versionData.thumbnail_url) formData.append('thumbnail_url', versionData.thumbnail_url);
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

  let lastLoadedTimelineEpId = '';

  function applyTimelineUpdate(projectData: any, isNewEpisode = false) {
    const currentState = core.store.getState();
    const currentClips = currentState.clips || {};
    const incomingClips = projectData.clips || {};
    const incomingTracks = projectData.tracks || [];

    const hasExistingClips = Object.keys(currentClips).length > 0;

    // If loading a completely different episode or initial empty state, perform a clean full reset
    if (isNewEpisode || !hasExistingClips) {
      core.reset(projectData);
      try { core.seek(0); } catch {}
      initTimelineTracks(projectData.tracks, projectData.clips);
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

  async function loadEpisodeTimeline(epId: string, silent = false, forceReset = false) {
    if (!epId) return null;
    try {
      const res: any = await http.get(`/episodes/${epId}/timeline`);
      if (res?.data) {
        const rawTimeline = res.data?.data || res.data;
        const projectData = sanitizeTimelineData(rawTimeline);
        const isNewEpisode = forceReset || (lastLoadedTimelineEpId !== epId);
        lastLoadedTimelineEpId = epId;
        applyTimelineUpdate(projectData, isNewEpisode);

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
              targetEp.scenes_count = `${vTrack.clipIds.length} scenes`;
            }
          }
          episodesList.value = [...episodesList.value];
        }

        return projectData;
      }
    } catch (err) {
      console.error('[useSeriesStore] Failed to load episode timeline from backend:', err);
    }
    return null;
  }

  async function syncVoiceoverTrackToTimeline(epId: string, langCode: string) {
    activePreviewVoiceLang.value = langCode;
    await loadEpisodeTimeline(epId, true);
    applyLanguageTrackFilter();
  }

  async function syncCaptionTrackToTimeline(epId: string, langCode: string, _styleOpts?: any) {
    activePreviewCaptionLang.value = langCode;
    await loadEpisodeTimeline(epId, true);
    applyLanguageTrackFilter();
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
    if (activeScript.value?.scenes) {
      const scene = activeScript.value.scenes.find((s: any) => s.index === sceneIndex);
      if (scene) {
        if (!scene.translations) scene.translations = {};
        scene.translations[langCode] = { ...(scene.translations[langCode] || {}), ...translationData };
      }
    }
  }

  function getSceneTranslation(epId: string, sceneIndex: number, langCode: string): SceneTranslation | undefined {
    const ep = episodesList.value.find(e => e.id === epId);
    const scenes = ep?.scenes || activeScript.value?.scenes || [];
    const scene = scenes.find((s: any) => s.index === sceneIndex);
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
    const scenes = ep?.scenes || activeScript.value?.scenes || [];
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
    activeScript,
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
    loadEpisodeScript,
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
    syncVoiceoverTrackToTimeline,
    syncCaptionTrackToTimeline,
    masterTracks,
    masterClips,
    initTimelineTracks,
    applyLanguageTrackFilter,
    formatTime,
  };
});

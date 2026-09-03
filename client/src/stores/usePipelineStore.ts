import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import http from '@/utils/http';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { getVisualStyleById } from '@/constants/visualStyles';
import { toast } from 'vue-sonner';
import i18n from '@/i18n';
import { core } from '@/utils/project';
import { generateCaptionClips } from '@/utils/caption-generator';

import { normalizeTransitionKey } from '@/constants/transitions';
import { normalizeEffectKey } from '@/constants/effects';
import { useWebSocket } from '@/composables/useWebSocket';
import { VoicePreset } from '@/types';
import { AssetJobItem, CaptionCue, CaptionsData, Character, LocationAsset, PipelineStep, PropAsset, Scene, SceneDialogue, SceneRenderStatus, StepStatus } from '@/types/api';
export { normalizeTransitionKey, normalizeEffectKey };

export const usePipelineStore = defineStore('pipeline', () => {
  const seriesStore = useSeriesStore();

  // ─── Voice Presets Catalog ────────────────────────────────────────────────
  const voicePresets = ref<VoicePreset[]>([]);
  const isVoicePresetsLoading = ref(false);

  async function fetchVoicePresets(force = false) {
    if (voicePresets.value.length > 0 && !force) {
      return voicePresets.value;
    }
    isVoicePresetsLoading.value = true;
    try {
      const res: any = await http.get('/voices/presets');
      const list = res?.data || res;
      if (Array.isArray(list)) {
        voicePresets.value = list;
      }
    } catch (e) {
      console.warn('Failed to load voice presets from API', e);
    } finally {
      isVoicePresetsLoading.value = false;
    }
    return voicePresets.value;
  }

  // ─── 6-Step Pipeline ─────────────────────────────────────────────────────
  const pipelineSteps = ref<PipelineStep[]>([
    { id: 'b1', label: 'Cast Render', icon: 'UserFilled', status: 'idle' },
    { id: 'b2', label: 'Assets & Storyboard', icon: 'Picture', status: 'idle' },
    { id: 'b3', label: 'Storyboard to Video', icon: 'Film', status: 'idle' },
    { id: 'b4', label: 'Dubbing', icon: 'Microphone', status: 'idle' },
    { id: 'b5', label: 'Subtitle', icon: 'ChatSquare', status: 'idle' },
    { id: 'b6', label: 'Export Video', icon: 'Cpu', status: 'idle' },
  ]);

  // ─── Per-Scene Render Status ───────────────────────────────────────────────
  const sceneRenderStatuses = ref<Map<number, SceneRenderStatus>>(new Map());

  // ─── Per-Character Render Status ──────────────────────────────────────────
  const characterRenderStatuses = ref<Map<string, 'idle' | 'running' | 'done' | 'error'>>(new Map());

  // ─── Global Active Rendering State ─────────────────────────────────────────
  const isRendering = ref(false);
  const currentRenderingMessage = ref('');
  const currentRenderingPercent = ref(0);
  const currentRenderingScene = ref<number | null>(null);

  // ─── Live Copilot / Agent Active Item Progress ─────────────────────────────
  const activeRenderingItem = ref<string | null>(null);
  const activeRenderingStep = ref<string | null>(null);
  const activeRenderingProgress = ref<{ step: string; item: string; current: number; total: number; message: string } | null>(null);

  function setActiveProgress(progress: { step: string; item: string; current: number; total: number; message: string } | null) {
    activeRenderingProgress.value = progress;
    activeRenderingItem.value = progress?.item || null;
    activeRenderingStep.value = progress?.step || null;
    if (progress) {
      isRendering.value = true;
      currentRenderingMessage.value = progress.message || '';
    } else {
      isRendering.value = false;
      currentRenderingMessage.value = '';
    }
  }

  function isItemRendering(target: string | number | undefined | null): boolean {
    if (!target || !activeRenderingItem.value) return false;
    const active = String(activeRenderingItem.value).toLowerCase().trim();
    const str = String(target).toLowerCase().trim();
    if (active === str) return true;
    if (active.includes(str) || str.includes(active)) return true;
    // Check scene numbers (e.g. "Scene #9" vs 9)
    if (typeof target === 'number' || /^\d+$/.test(str)) {
      const match = active.match(/scene\s*#?(\d+)/i);
      if (match && match[1] === String(target)) return true;
    }
    return false;
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const doneStepsCount = computed(() => pipelineSteps.value.filter(s => s.status === 'done').length);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function setStepStatus(id: string, status: StepStatus) {
    const step = pipelineSteps.value.find(s => s.id === id);
    if (step) step.status = status;
  }

  function getSceneStatus(sceneIndex: number): SceneRenderStatus {
    if (!sceneRenderStatuses.value.has(sceneIndex)) {
      sceneRenderStatuses.value.set(sceneIndex, {
        scene_index: sceneIndex,
        bg_status: 'idle',
        video_status: 'idle',
        voiceover_status: 'idle',
        bgm_status: 'idle',
        caption_status: 'idle',
      });
    }
    return sceneRenderStatuses.value.get(sceneIndex)!;
  }

  function updateSceneStatus(sceneIndex: number, patch: Partial<SceneRenderStatus>) {
    const current = getSceneStatus(sceneIndex);
    sceneRenderStatuses.value.set(sceneIndex, { ...current, ...patch });
  }

  function getCharStatus(charId: string) {
    return characterRenderStatuses.value.get(charId) || 'idle';
  }

  // Sync step statuses with current active episode data
  function syncStepStatusesWithEpisode(episode: any, characters?: any[]) {
    if (!episode) return;
    const scenes = episode.scenes || [];
    if (!scenes.length) return;

    const mainLang = seriesStore.currentSeries?.language || 'en-US';
    const activeLang = seriesStore.activePreviewCaptionLang || mainLang;

    const allHaveBg = scenes.every((s: Scene) => s.storyboard_frame_url);
    const allHaveVideo = scenes.every((s: Scene) => s.video_url);
    const allHaveVoiceover = scenes.every((s: Scene) => (activeLang === mainLang ? s.voiceover_url : s.translations?.[activeLang]?.voiceover_url) || s.voiceover_url);
    const allHaveBgm = scenes.every((s: Scene) => s.bgm_url);
    const allHaveCaptions = scenes.every((s: Scene) => {
      const cues = (activeLang === mainLang ? s.captions_data : s.translations?.[activeLang]?.captions_data) || s.captions_data;
      return cues && cues.length > 0;
    });

    const chars = (Array.isArray(characters) && characters.length > 0) ? characters : (seriesStore.charactersList || []);
    const allCharsDone = chars.length > 0 && chars.every((c: Character) => c.avatar);

    setStepStatus('b1', allCharsDone ? 'done' : 'idle');
    setStepStatus('b2', allHaveBg ? 'done' : 'idle');
    setStepStatus('b3', allHaveVideo ? 'done' : 'idle');
    setStepStatus('b4', allHaveVoiceover ? 'done' : 'idle');
    setStepStatus('b5', allHaveCaptions ? 'done' : 'idle');

    scenes.forEach((s: Scene) => {
      const trans = s.translations?.[activeLang];
      const voiceSrc = (activeLang === mainLang ? s.voiceover_url : trans?.voiceover_url) || s.voiceover_url;
      const capData = (activeLang === mainLang ? s.captions_data : trans?.captions_data) || s.captions_data;
      updateSceneStatus(s.index, {
        bg_status: s.storyboard_frame_url ? 'done' : 'idle',
        video_status: s.video_url ? 'done' : 'idle',
        voiceover_status: voiceSrc ? 'done' : 'idle',
        bgm_status: s.bgm_url ? 'done' : 'idle',
        caption_status: (capData && capData.length > 0) ? 'done' : 'idle',
        storyboard_url: s.storyboard_frame_url,
        video_url: s.video_url,
        voiceover_url: voiceSrc,
        bgm_url: s.bgm_url,
      });
    });
  }

  // ─── B1: Character Render & Persona Lock ─────────────────────────────────────
  async function renderCharacter(char: Character) {
    characterRenderStatuses.value.set(char.id, 'running');
    setStepStatus('b1', 'running');
    isRendering.value = true;
    currentRenderingMessage.value = `Rendering Character: ${char.name || 'Lead'}`;
    currentRenderingPercent.value = 40;

    try {
      const sId = seriesStore.currentSeries?.id;
      const targetAspect = seriesStore.currentSeries?.ratio || '9:16';
      const seriesGenre = seriesStore.currentSeries?.genre || 'micro-drama';
      const currentStyle = seriesStore.currentSeries?.visual_style || 'realistic';
      const styleObj = getVisualStyleById(currentStyle);

      const res: any = await http.post(`/characters/${char.id}/portrait`, {
        series_id: sId,
        character_id: char.id,
        name: char.name,
        visual_traits: char.visual_traits || char.identity || `${char.name}, role: ${char.role || 'lead'}, ${char.nationality || 'intense expression'}, ${seriesGenre}`,
        style: styleObj.promptModifier,
        visual_style: currentStyle,
        visual_style_prompt: styleObj.promptModifier,
        aspect_ratio: targetAspect,
      });

      const url = res?.data?.image_url || res?.data?.url;
      if (url) {
        characterRenderStatuses.value.set(char.id, 'done');
        seriesStore.updateCharacterAvatar(char.id, url);
        // Auto-save avatar immediately
        if (sId) await seriesStore.saveCharacterAvatars(sId);
      } else {
        characterRenderStatuses.value.set(char.id, 'done');
      }
      setStepStatus('b1', 'done');
      currentRenderingPercent.value = 100;
    } catch (err) {
      characterRenderStatuses.value.set(char.id, 'error');
      setStepStatus('b1', 'error');
      throw err;
    } finally {
      isRendering.value = false;
    }
  }

  // Smart batch B1: only render character without an avatar
  async function renderAllCharacters() {
    const sId = seriesStore.currentSeries?.id;
    const characters = seriesStore.charactersList || [];
    setStepStatus('b1', 'running');
    isRendering.value = true;
    let hasError = false;
    console.log(`[Pipeline] Rendering ${characters.length} characters...`);
    const toRender = characters.filter(c => !c.avatar);
    const total = toRender.length || 1;

    for (let i = 0; i < toRender.length; i++) {
      const char = toRender[i];
      currentRenderingMessage.value = `Rendering Character (${i + 1}/${total}): ${char.name}`;
      currentRenderingPercent.value = Math.round(((i + 1) / total) * 100);
      try {
        await renderCharacter(char);
      } catch {
        hasError = true;
      }
    }
    setStepStatus('b1', hasError ? 'error' : 'done');
    isRendering.value = false;
  }

  // ─── B2: Scene Background & Storyboard Render (With Character Face References) ─
  async function renderScene(sceneIndex: number, sceneData: any) {
    const epId = seriesStore.activeEpisodeId;
    if (!epId) return;

    updateSceneStatus(sceneIndex, { bg_status: 'running' });
    setStepStatus('b2', 'running');
    isRendering.value = true;
    currentRenderingScene.value = sceneIndex;
    currentRenderingMessage.value = `Rendering Scene ${sceneIndex} Background`;
    currentRenderingPercent.value = 35;

    try {
      const sId = seriesStore.currentSeries?.id;
      const currentGenre = seriesStore.currentSeries?.genre || 'cinematic micro-drama';
      const targetAspect = seriesStore.currentSeries?.ratio || '9:16';
      const currentStyle = seriesStore.currentSeries?.visual_style || 'realistic';
      const styleObj = getVisualStyleById(currentStyle);

      const sceneChars = Array.isArray(sceneData.characters) && sceneData.characters.length > 0
        ? sceneData.characters
        : (sceneData.dialogue || []).map((d: any) => d.character).filter(Boolean);

      const res: any = await http.post('/assets/image-generate', {
        series_id: sId,
        episode_id: epId,
        scene_index: sceneIndex,
        scene_id: `scene_${String(sceneIndex).padStart(2, '0')}`,
        prompt: sceneData.visual_prompt || sceneData.description || undefined,
        scene_data: sceneData,
        aspect_ratio: targetAspect,
        visual_style: currentStyle,
        visual_style_prompt: styleObj.promptModifier,
        style: sceneData.lighting_mood || styleObj.promptModifier,
        characters: sceneChars,
      });

      const url = res?.data?.image_url || res?.data?.url;
      if (url) {
        updateSceneStatus(sceneIndex, { bg_status: 'done', storyboard_url: url });
        seriesStore.updateSceneStoryboard(epId, sceneIndex, url);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
      } else {
        updateSceneStatus(sceneIndex, { bg_status: 'done' });
      }
      currentRenderingPercent.value = 100;
    } catch (err) {
      updateSceneStatus(sceneIndex, { bg_status: 'error' });
      setStepStatus('b2', 'error');
      throw err;
    } finally {
      isRendering.value = false;
    }
  }

  // Smart batch B2: only render scenes without a background image
  async function renderAllScenes() {
    const epId = seriesStore.activeEpisodeId;
    if (!epId) return;

    const allScenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
    // Skip scenes that already have a background or video
    const scenes = allScenes.filter((s: Scene) => !s.storyboard_frame_url && !s.video_url);

    if (allScenes.length === 0) {
      toast.warning(i18n.global.t('toast.noScenesAvailableToRender'));
      return;
    }
    if (scenes.length === 0) {
      toast.info(i18n.global.t('toast.allScenesAlreadyRendered', 'All scenes already have backgrounds'));
      return;
    }

    setStepStatus('b2', 'running');
    isRendering.value = true;
    let hasError = false;
    const total = scenes.length;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      currentRenderingScene.value = scene.index;
      currentRenderingMessage.value = `Rendering Scene ${scene.index} Background (${i + 1}/${total})`;
      currentRenderingPercent.value = Math.round(((i + 1) / total) * 100);
      try {
        await renderScene(scene.index, scene);
      } catch {
        hasError = true;
      }
    }

    setStepStatus('b2', hasError ? 'error' : 'done');
    isRendering.value = false;
  }

  // ─── B2: Assets & Storyboard (Sequentially Render Characters/Wardrobes, Locations, Props, and Scenes) ───
  async function renderAllAssetsAndStoryboard() {
    const epId = seriesStore.activeEpisodeId;
    const sId = seriesStore.currentSeries?.id;
    if (!epId || !sId) return;

    setStepStatus('b2', 'running');
    isRendering.value = true;
    let hasError = false;

    try {
      const ep = seriesStore.activeEpisode as any;
      const sc = seriesStore.activeScript as any;

      const characters: Character[] = (sc?.characters && sc.characters.length > 0)
        ? sc.characters
        : (seriesStore.currentSeries?.characters || seriesStore.charactersList || []);

      const locations: LocationAsset[] = (sc?.locations && sc.locations.length > 0)
        ? sc.locations
        : (seriesStore.currentSeries?.locations || []);

      const props: PropAsset[] = (sc?.props && sc.props.length > 0)
        ? sc.props
        : (seriesStore.currentSeries?.props || []);

      const scenes = sc?.scenes || ep?.scenes || [];

      // Calculate total work items for smooth percentage (only unrendered items)
      let totalItems = 0;
      characters.forEach((c: Character) => {
        const hasCharImage = !!seriesStore.getCharacterById(c.id)?.avatar;
        if (c.wardrobe_variants && c.wardrobe_variants.length > 0) {
          totalItems += c.wardrobe_variants.filter((v: any) => !v.image_url && !(c.wardrobe_variants?.length === 1 && hasCharImage)).length;
        } else if (!hasCharImage) {
          totalItems++;
        }
      });
      totalItems += locations.filter((l: any) => !l.image_url).length;
      totalItems += props.filter((p: any) => !p.image_url).length;
      totalItems += scenes.filter((s: any) => !(s.storyboard_frame_url || s.video_url || sceneRenderStatuses.value.get(s.index)?.storyboard_url)).length;

      if (totalItems === 0) {
        toast.info(i18n.global.t('toast.allAssetsAlreadyRendered', 'All assets and storyboard frames already rendered'));
        setStepStatus('b2', 'done');
        return;
      }

      let completedItems = 0;
      const updateProgress = (msg: string) => {
        completedItems++;
        currentRenderingMessage.value = `${msg} (${completedItems}/${totalItems})`;
        currentRenderingPercent.value = Math.min(100, Math.round((completedItems / totalItems) * 100));
      };

      const scriptStore = (await import('@/stores/useScriptStore')).useScriptStore();

      // 1. Render Characters & Wardrobe Variants
      for (const char of characters) {
        let matchedCast = (seriesStore.charactersList || []).find(
          (c: Character) => c.name?.toLowerCase().trim() === char.name?.toLowerCase().trim() || c.id === char.id
        ) as Character;
        if (!matchedCast) continue;
        let referenceAvatar = matchedCast?.avatar || '';
        const resolvedPhysical = matchedCast?.visual_traits || matchedCast?.physical_characteristics || matchedCast?.appearance || matchedCast?.traits || '';
        // const hasCharImage = !!(referenceAvatar);

        if (!referenceAvatar) {
          //render avatar first
          await renderCharacter(matchedCast);
          matchedCast = (seriesStore.charactersList || []).find(
            (c: Character) => c.name?.toLowerCase().trim() === char.name?.toLowerCase().trim() || c.id === char.id
          ) as Character;
          // if the new matched cast is the same as the old one, it means the avatar is not rendered
          referenceAvatar = matchedCast?.avatar || '';
          if (!matchedCast || !referenceAvatar) {
            toast.error(i18n.global.t('toast.renderAvatarFailed', { name: char.name }));
            hasError = true;
            continue;
          }
        }

        if (char.wardrobe_variants && char.wardrobe_variants.length > 0) {
          for (const variant of char.wardrobe_variants) {
            if (variant.image_url) continue;

            try {
              updateProgress(`Rendering Wardrobe: ${char.name} (${variant.name})`);
              const res = await scriptStore.generateCharacterSheet({
                character_name: char.name,
                physical_characteristics: resolvedPhysical,
                clothing_and_accessories: variant.clothing_and_accessories || '',
                visual_style: seriesStore.currentSeries?.visual_style || 'realistic',
                reference_image_url: referenceAvatar || undefined,
              });
              if (res?.image_url) {
                variant.image_url = res.image_url;
              }
            } catch (err) {
              console.warn(`[renderAllAssetsAndStoryboard] Failed to render wardrobe for ${char.name}:`, err);
              hasError = true;
            }
          }
        }

        // if (!matchedCast.avatar) {
        //   // If variants have an image, reuse first variant image
        //   const firstVariantImg = char.wardrobe_variants?.find((v: any) => v.imageUrl)?.imageUrl;
        //   if (firstVariantImg) {
        //     char.avatar = firstVariantImg;
        //   } else {
        //     try {
        //       updateProgress(`Rendering Character: ${char.name}`);
        //       const res = await scriptStore.generateCharacterSheet({
        //         character_name: char.name,
        //         physical_characteristics: resolvedPhysical,
        //         clothing_and_accessories: char.clothing_and_accessories || '',
        //         visual_style: seriesStore.currentSeries?.visual_style || 'realistic',
        //         reference_image_url: referenceAvatar || undefined,
        //       });
        //       if (res?.image_url) {
        //         char.avatar = res.image_url;
        //       }
        //     } catch (err) {
        //       console.warn(`[renderAllAssetsAndStoryboard] Failed to render character ${char.name}:`, err);
        //       hasError = true;
        //     }
        //   }
        // }
      }

      // Save Characters
      try {
        await http.patch(`/series/${sId}/episodes/${epId}`, {
          characters,
          locations,
          props,
        });
      } catch (err) {
        console.warn('[renderAllAssetsAndStoryboard] Failed to save episode assets:', err);
      }

      // 2. Render Locations
      for (const loc of locations) {
        if (loc.image_url) continue;
        try {
          updateProgress(`Rendering Location: ${loc.name}`);
          const res = await scriptStore.generateLocationSheet({
            location_name: loc.name,
            physical_characteristics: loc.physical_characteristics,
            time_of_day: loc.time_of_day,
            visual_style: seriesStore.currentSeries?.visual_style || 'realistic',
          });
          if (res?.image_url) {
            loc.image_url = res.image_url;
          }
        } catch (err) {
          console.warn(`[renderAllAssetsAndStoryboard] Failed to render location ${loc.name}:`, err);
          hasError = true;
        }
      }

      // Save Locations
      try {
        await http.patch(`/series/${sId}/episodes/${epId}`, {
          characters,
          locations,
          props,
        });
      } catch (err) {
        console.warn('[renderAllAssetsAndStoryboard] Failed to save episode assets:', err);
      }

      // 3. Render Props
      for (const prop of props) {
        if (prop.image_url) continue;
        try {
          updateProgress(`Rendering Prop: ${prop.name}`);
          const res = await scriptStore.generatePropSheet({
            prop_name: prop.name,
            physical_characteristics: prop.physical_characteristics,
            visual_style: seriesStore.currentSeries?.visual_style || 'realistic',
          });
          if (res?.image_url) {
            prop.image_url = res.image_url;
          }
        } catch (err) {
          console.warn(`[renderAllAssetsAndStoryboard] Failed to render prop ${prop.name}:`, err);
          hasError = true;
        }
      }

      // Save Props
      try {
        await http.patch(`/series/${sId}/episodes/${epId}`, {
          characters,
          locations,
          props,
        });
      } catch (err) {
        console.warn('[renderAllAssetsAndStoryboard] Failed to save episode assets:', err);
      }

      // 4. Render Storyboard Shots for all Scenes
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (scene.storyboard_frame_url || scene.image_url || scene.video_url || sceneRenderStatuses.value.get(scene.index)?.storyboard_url) continue;
        try {
          updateProgress(`Rendering Storyboard Scene ${scene.index}`);
          await renderScene(scene.index, scene);
        } catch (err) {
          console.warn(`[renderAllAssetsAndStoryboard] Failed to render scene ${scene.index}:`, err);
          hasError = true;
        }
      }

      setStepStatus('b2', hasError ? 'error' : 'done');
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
    } catch (err: any) {
      setStepStatus('b2', 'error');
      toast.error(err.message || 'Assets & Storyboard batch generation failed');
    } finally {
      isRendering.value = false;
    }
  }

  // ─── B3: Image-to-Video Render ─────────────────────────────────────────────
  async function renderSceneVideo(sceneIndex: number, scene: Scene) {
    const epId = seriesStore.activeEpisodeId;
    if (!epId) return;

    updateSceneStatus(sceneIndex, { video_status: 'running' });
    setStepStatus('b3', 'running');
    isRendering.value = true;
    currentRenderingScene.value = sceneIndex;
    currentRenderingMessage.value = `Rendering Scene ${sceneIndex} Video`;
    currentRenderingPercent.value = 50;

    try {
      const sId = seriesStore.currentSeries?.id;
      const calculatedDuration = Math.min(8, Math.max(4, Number(scene.duration_seconds) || 5));
      const targetAction = scene.action || 'walk_forward';
      const targetCamera = scene.camera_movement || 'dolly_in';
      const lightingMood = scene.lighting_mood || "";

      const allScenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
      const nextScene = allScenes.find((s: Scene) => s.index === sceneIndex + 1) as any;
      const nextFrameUrl = nextScene?.storyboard_frame_url;

      const res: any = await http.post('/assets/video-generate', {
        series_id: sId,
        episode_id: epId,
        scene_id: `scene_${String(sceneIndex).padStart(2, '0')}`,
        start_frame_url: scene.storyboard_frame_url,
        end_frame_url: scene.storyboard_end_frame_url || undefined,
        duration: calculatedDuration,
        action: targetAction,
        camera_movement: targetCamera,
        lighting_mood: lightingMood,
        prompt: scene.visual_prompt || scene.description || undefined,
        scene_data: scene,
      });

      const url = res?.data?.url;
      if (url) {
        updateSceneStatus(sceneIndex, { video_status: 'done', video_url: url });
        seriesStore.updateSceneVideoUrl(epId, sceneIndex, url);

        // 1. Update Video Clip Properties & Transitions directly on OpenVideo Timeline
        await syncVideoClipToTimeline(sceneIndex, url, calculatedDuration, scene, res?.data);

        // 2. If scene has dialogue, trigger consistent TTS Voiceover & Synchronized Captions
        if (Array.isArray(scene.dialogue) && scene.dialogue.length > 0 && !scene.voiceover_url) {
          // const firstChar = scene.dialogue[0]?.character;
          // const matchedCast = (seriesStore.charactersList || []).find((c: any) => c.name?.toLowerCase().trim() === String(firstChar || '').toLowerCase().trim());
          // const defaultVoice = matchedCast?.voiceId || (matchedCast?.gender === 'female' ? 'Aoede' : 'Puck');
          // Non-blocking trigger so UI stays fast
          // renderSceneVoiceover(sceneIndex, scene.dialogue, defaultVoice, 85, 1.1).catch(err => {
          //   console.warn(`[Pipeline] Auto Voiceover for scene ${sceneIndex} notice:`, err?.message);
          // });
        }

        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
      } else {
        updateSceneStatus(sceneIndex, { video_status: 'done' });
      }
      setStepStatus('b3', 'done');
      currentRenderingPercent.value = 100;
    } catch (err) {
      updateSceneStatus(sceneIndex, { video_status: 'error' });
      setStepStatus('b3', 'error');
      throw err;
    } finally {
      isRendering.value = false;
    }
  }

  // Smart batch B3: only render scenes that have a BG image but no video yet
  async function renderAllVideos() {
    const epId = seriesStore.activeEpisodeId;
    if (!epId) return;

    const allScenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
    const scenes = allScenes.filter((s: Scene) => s.storyboard_frame_url && !s.video_url);

    if (scenes.length === 0) {
      toast.info(i18n.global.t('toast.noScenesNeedVideo', 'All scenes already have videos or are missing backgrounds'));
      return;
    }

    setStepStatus('b3', 'running');
    isRendering.value = true;
    let hasError = false;
    const total = scenes.length;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      currentRenderingScene.value = scene.index;
      currentRenderingMessage.value = `Rendering Scene ${scene.index} Video (${i + 1}/${total})`;
      currentRenderingPercent.value = Math.round(((i + 1) / total) * 100);
      try {
        await renderSceneVideo(scene.index, scene);
      } catch {
        hasError = true;
      }
    }
    setStepStatus('b3', hasError ? 'error' : 'done');
    isRendering.value = false;
  }

  // ─── Scene Voiceover Render ─────────────────────────────────────────────
  async function renderSceneVoiceover(
    sceneIndex: number,
    dialogue: SceneDialogue[],
    voicePreset: string,
    intensity: number,
    speed?: number,
    languageCode?: string,
  ) {
    const epId = seriesStore.activeEpisodeId;
    if (!epId || dialogue.length === 0) return;

    updateSceneStatus(sceneIndex, { voiceover_status: 'running' });
    setStepStatus('b4', 'running');
    isRendering.value = true;
    currentRenderingScene.value = sceneIndex;
    currentRenderingMessage.value = `Generating Voiceover for Scene ${sceneIndex}`;
    currentRenderingPercent.value = 50;

    const dialogueSpeed = Array.isArray(dialogue)
      ? dialogue.find((d: SceneDialogue) => typeof d.speed === 'number' && d.speed > 0)?.speed
      : undefined;
    const effectiveSpeed = speed ?? dialogueSpeed ?? 1.0;

    try {
      const text = dialogue.map((d: SceneDialogue) => `${d.character}: ${d.line}`).join('\n');
      const res: any = await http.post('/voices/tts', {
        episode_id: epId,
        scene_index: sceneIndex,
        text,
        voice_id: voicePreset,
        intensity,
        speed: effectiveSpeed,
        dialogue,
        language: languageCode || seriesStore.currentSeries?.country || 'en-US',
      });

      const url = res?.data?.audioUrl || res?.data?.url;
      if (url) {
        updateSceneStatus(sceneIndex, { voiceover_status: 'done', voiceover_url: url });
        if (languageCode) {
          seriesStore.updateLanguageTrackVoiceover(epId, languageCode, sceneIndex, url);
        } else {
          seriesStore.updateSceneAssets(epId, sceneIndex, { voiceover_url: url });
        }

        // Sync Voiceover Audio and Captions on OpenVideo Timeline
        const allScenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
        const currentScene = allScenes.find((s: Scene) => s.index === sceneIndex) || { index: sceneIndex, dialogue };
        await syncSceneVoiceoverAndCaptionsToTimeline(sceneIndex, url, res?.data?.cues || dialogue, currentScene);

        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
      } else {
        updateSceneStatus(sceneIndex, { voiceover_status: 'done' });
      }
      setStepStatus('b4', 'done');
      currentRenderingPercent.value = 100;
    } catch (err) {
      updateSceneStatus(sceneIndex, { voiceover_status: 'error' });
      setStepStatus('b4', 'error');
      throw err;
    } finally {
      isRendering.value = false;
    }
  }

  // Smart batch B4: render dialogue scenes without voiceover for a given language
  async function renderAllVoiceovers(voicePreset = 'Puck', intensity = 85, speed = 1.1, languageCode?: string) {
    const epId = seriesStore.activeEpisodeId;
    if (!epId) return;

    const allScenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];

    if (languageCode) {
      // Smart skip: only scenes not yet rendered for this language track
      const scenes = allScenes.filter((s: Scene) =>
        Array.isArray(s.dialogue) && s.dialogue.length > 0
        && !s.translations?.[languageCode]?.voiceover_url
      );
      const trackVoice = voicePreset;
      if (scenes.length === 0) {
        toast.info(i18n.global.t('toast.allVoiceoversAlreadyRendered', { lang: languageCode }));
        return;
      }
      setStepStatus('b4', 'running');
      isRendering.value = true;
      let hasError = false;
      const total = scenes.length;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneDialogue = scene.dialogue || [];
        const sceneSpeed = Array.isArray(scene.dialogue)
          ? scene.dialogue.find((d: SceneDialogue) => typeof d.speed === 'number' && d.speed > 0)?.speed ?? speed
          : speed;
        currentRenderingScene.value = scene.index;
        currentRenderingMessage.value = `Generating Voiceover (${languageCode}) Scene ${scene.index} (${i + 1}/${total})`;
        currentRenderingPercent.value = Math.round(((i + 1) / total) * 100);
        try { await renderSceneVoiceover(scene.index, sceneDialogue, trackVoice, intensity, sceneSpeed, languageCode); }
        catch { hasError = true; }
      }
      setStepStatus('b4', hasError ? 'error' : 'done');
      isRendering.value = false;
    } else {
      // Default: skip scenes already with voiceover_url
      const scenes = allScenes.filter((s: Scene) => Array.isArray(s.dialogue) && s.dialogue.length > 0 && !s.voiceover_url);
      if (scenes.length === 0) {
        toast.info(i18n.global.t('toast.allVoiceoversRendered', 'All voiceovers already rendered'));
        return;
      }
      setStepStatus('b4', 'running');
      isRendering.value = true;
      let hasError = false;
      const total = scenes.length;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneDialogue = scene.dialogue || [];
        const sceneSpeed = Array.isArray(scene.dialogue)
          ? scene.dialogue.find((d: SceneDialogue) => typeof d.speed === 'number' && d.speed > 0)?.speed ?? speed
          : speed;
        currentRenderingScene.value = scene.index;
        currentRenderingMessage.value = `Generating Voiceover Scene ${scene.index} (${i + 1}/${total})`;
        currentRenderingPercent.value = Math.round(((i + 1) / total) * 100);
        try { await renderSceneVoiceover(scene.index, sceneDialogue, voicePreset, intensity, sceneSpeed); }
        catch { hasError = true; }
      }
      setStepStatus('b4', hasError ? 'error' : 'done');
      isRendering.value = false;
    }
  }

  // ─── Scene BGM Render ─────────────────────────────────────────────────────
  // async function renderSceneBgm(sceneIndex: number, bgmMood: string, duration: number) {
  //   const epId = seriesStore.activeEpisodeId;
  //   if (!epId) return;

  //   updateSceneStatus(sceneIndex, { bgm_status: 'running' });
  //   setStepStatus('b5', 'running');
  //   isRendering.value = true;
  //   currentRenderingScene.value = sceneIndex;
  //   currentRenderingMessage.value = `Generating BGM for Scene ${sceneIndex}`;
  //   currentRenderingPercent.value = 50;

  //   try {
  //     const currentGenre = seriesStore.currentSeries?.genre || 'micro_drama_suspense';

  //     const res: any = await http.post('/assets/music-generate', {
  //       episode_id: epId,
  //       scene_index: sceneIndex,
  //       prompt: bgmMood || `Cinematic micro-drama score, genre: ${currentGenre}`,
  //       genre: currentGenre,
  //       duration: duration || 15,
  //     });

  //     const url = res?.data?.audio_url || res?.data?.url;
  //     if (url) {
  //       updateSceneStatus(sceneIndex, { bgm_status: 'done', bgm_url: url });
  //       seriesStore.updateSceneAssets(epId, sceneIndex, { bgm_url: url });
  //       // Auto-save immediately
  //       const sId = seriesStore.currentSeries?.id;
  //       if (sId) await seriesStore.saveEpisodeScenes(sId, epId);
  //       if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
  //     } else {
  //       updateSceneStatus(sceneIndex, { bgm_status: 'done' });
  //     }
  //     setStepStatus('b5', 'done');
  //     currentRenderingPercent.value = 100;
  //   } catch (err) {
  //     updateSceneStatus(sceneIndex, { bgm_status: 'error' });
  //     setStepStatus('b5', 'error');
  //     throw err;
  //   } finally {
  //     isRendering.value = false;
  //   }
  // }

  // Smart batch B5: only render scenes without bgm
  // async function renderAllBgm() {
  //   const epId = seriesStore.activeEpisodeId;
  //   if (!epId) return;

  //   const allScenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
  //   const scenes = allScenes.filter((s: Scene) => !s.bgm_url);

  //   if (scenes.length === 0) {
  //     toast.info(i18n.global.t('toast.allBgmRendered', 'All scenes already have BGM'));
  //     return;
  //   }

  //   setStepStatus('b5', 'running');
  //   isRendering.value = true;
  //   let hasError = false;
  //   const total = scenes.length;

  //   for (let i = 0; i < scenes.length; i++) {
  //     const scene = scenes[i];
  //     currentRenderingScene.value = scene.index;
  //     currentRenderingMessage.value = `Generating BGM Scene ${scene.index} (${i + 1}/${total})`;
  //     currentRenderingPercent.value = Math.round(((i + 1) / total) * 100);
  //     try {
  //       await renderSceneBgm(scene.index, scene.bgm_mood || 'dramatic cinematic', scene.duration_seconds || 15);
  //     } catch {
  //       hasError = true;
  //     }
  //   }
  //   setStepStatus('b5', hasError ? 'error' : 'done');
  //   isRendering.value = false;
  // }

  // ─── B5: Caption Generation + Translation per Language ───────────────────────────

  // Generate (and optionally translate) captions for one language; stores cues per-scene
  async function generateCaptionsForLanguage(langCode: string, translateFrom?: string) {
    const epId = seriesStore.activeEpisodeId;
    const sId = seriesStore.currentSeries?.id;
    if (!epId) return;

    const scenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
    setStepStatus('b5', 'running');
    isRendering.value = true;
    currentRenderingMessage.value = `Generating Captions (${langCode})`;
    currentRenderingPercent.value = 30;

    if (translateFrom && translateFrom !== langCode) {
      // Batch-translate all scenes in one fast call using Gemini AI
      currentRenderingMessage.value = `Translating Captions to ${langCode}...`;
      currentRenderingPercent.value = 50;

      const scenesToTranslate = scenes.map((s: Scene) => ({
        sceneIndex: s.index,
        dialogue: Array.isArray(s.dialogue)
          ? s.dialogue.map((d: any) => d.line || d.text || '').filter(Boolean).join(' ')
          : (s.dialogue || ''),
      })).filter((s: any) => s.dialogue.trim().length > 0);

      try {
        const batchRes: any = await http.post('/captions/batch-translate', {
          episode_id: epId,
          target_language: langCode,
          source_language: translateFrom,
          scenes: scenesToTranslate,
        });

        const translatedScenes: Array<{ scene_index: number; translated_dialogue: string }> = batchRes?.data?.translated_scenes || [];
        const transMap = new Map<number, string>();
        translatedScenes.forEach((ts) => {
          if (ts.scene_index !== undefined) {
            transMap.set(ts.scene_index, ts.translated_dialogue);
          }
        });

        for (const scene of scenes) {
          const translated = transMap.get(scene.index) || (Array.isArray(scene.dialogue) ? scene.dialogue.map((d: SceneDialogue) => d.line).join(' ') : (scene.dialogue || ''));
          if (!translated) continue;

          const sourceCues: CaptionsData[] = (translateFrom ? scene.translations?.[translateFrom]?.captions_data : scene.captions_data) || scene.captions_data || [];
          let cues: CaptionCue[] = [];

          if (sourceCues.length === 1) {
            cues = [{
              id: `cue_${scene.index}_${langCode}_0`,
              text: translated,
              start_ms: sourceCues[0].start_ms,
              end_ms: sourceCues[0].end_ms,
              from_us: sourceCues[0].start_ms * 1000,
              to_us: sourceCues[0].end_ms * 1000,
              duration_ms: sourceCues[0].end_ms - sourceCues[0].start_ms,
            }];
          } else if (sourceCues.length > 1) {
            const words = translated.split(' ');
            const wordsPerCue = Math.max(1, Math.ceil(words.length / sourceCues.length));
            cues = sourceCues.map((srcCue, idx) => {
              const chunk = words.slice(idx * wordsPerCue, (idx + 1) * wordsPerCue).join(' ');
              return {
                id: `cue_${scene.index}_${langCode}_${idx}`,
                text: chunk || srcCue.text,
                start_ms: srcCue.start_ms,
                end_ms: srcCue.end_ms,
                from_us: srcCue.start_ms * 1000,
                to_us: srcCue.end_ms * 1000,
                duration_ms: srcCue.end_ms - srcCue.start_ms,
              };
            });
          } else {
            const durMs = (scene.duration_seconds || 6) * 1000;
            cues = [{
              id: `cue_${scene.index}_${langCode}_0`,
              text: translated,
              start_ms: 0,
              end_ms: durMs,
              from_us: 0,
              to_us: durMs * 1000,
              duration_ms: durMs,
              duration_us: durMs * 1000,
            }];
          }

          updateSceneStatus(scene.index, { caption_status: 'done' });
          seriesStore.updateLanguageTrackDialogue(epId, langCode, scene.index, translated);
          seriesStore.updateLanguageTrackCaptions(epId, langCode, scene.index, cues);
        }

        seriesStore.syncCaptionTrackToTimeline(epId, langCode);
      } catch (err) {
        console.warn(`[generateCaptionsForLanguage] Batch translation failed:`, err);
      }
    } else {
      const total = scenes.length || 1;
      for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
        const scene = scenes[sIdx];
        currentRenderingScene.value = scene.index;
        currentRenderingMessage.value = `Generating Captions (${langCode}) Scene ${scene.index} (${sIdx + 1}/${total})`;
        currentRenderingPercent.value = Math.round(((sIdx + 1) / total) * 100);
        try {
          const dialogueText = (scene.dialogue || []).map((d: any) => d.line || d.text || '').filter(Boolean).join(' ');
          if (!dialogueText) continue;

          const res: any = await http.post('/captions/auto-generate', {
            episode_id: epId,
            language: langCode,
            text: dialogueText,
          });
          const rawCues : CaptionCue[] = res?.data?.cues || [];
          const cues = rawCues.map((c: CaptionCue) => ({
            id: c.id,
            text: c.text,
            start_ms: c.from_us ? c.from_us / 1000 : (c.start_ms || (c.timing?.display?.from || 0) / 1000),
            end_ms: c.to_us ? c.to_us / 1000 : (c.end_ms || (c.timing?.display?.to || 0) / 1000),
            words: c.words,
          }));

          updateSceneStatus(scene.index, { caption_status: 'done' });
          seriesStore.updateLanguageTrackCaptions(epId, langCode, scene.index, cues);
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
        } catch (err) {
          console.warn(`[generateCaptionsForLanguage] scene ${scene.index} failed:`, err);
        }
      }
    }

    setStepStatus('b5', 'done');
    isRendering.value = false;
  }

  // Sync captions (legacy path: flat array of cues with sceneIndex)
  async function syncCaptionsToTimeline(episodeId: string, captionCues: Array<{ sceneIndex: number; startMs: number; endMs: number; text: string }>) {
    const sId = seriesStore.currentSeries?.id;
    const byScene: Record<number, Array<{ startMs: number; endMs: number; text: string }>> = {};
    for (const cue of captionCues) {
      if (!byScene[cue.sceneIndex]) byScene[cue.sceneIndex] = [];
      byScene[cue.sceneIndex].push({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text });
    }
    for (const [idxStr, cues] of Object.entries(byScene)) {
      const idx = Number(idxStr);
      updateSceneStatus(idx, { caption_status: 'done' });
      seriesStore.updateSceneAssets(episodeId, idx, { captionsData: cues });
    }
    if (sId) await seriesStore.saveEpisodeScenes(sId, episodeId);
  }

  // ─── Timeline Live Sync Helpers ─────────────────────────────────────────────
  async function syncVideoClipToTimeline(sceneIndex: number, videoUrl: string, durationSec: number, scene: any, audioData?: any) {
    try {
      const epId = seriesStore.activeEpisodeId;
      if (!epId) return;
      const state = core.store.getState();
      const clips = { ...(state.clips || {}) };
      const tracks = [ ...(state.tracks || []) ];

      const vClipId = `clip_v_${epId}_s${sceneIndex}`;
      let targetClip: any = clips[vClipId];
      if (!targetClip) {
        targetClip = Object.values(clips).find((c: any) =>
          c.id === vClipId || ((c.type === 'Video' || c.type === 'Image') && (c.name?.includes(`Scene ${sceneIndex}`) || c.label?.includes(`Scene ${sceneIndex}`)))
        );
      }

      const durationUs = Math.round(durationSec * 1_000_000);
      const hasDialogue = Array.isArray(scene.dialogue) && scene.dialogue.length > 0;
      const volume = hasDialogue ? 0 : 1; // Mute camera mic when dedicated TTS dialogue is present

      if (targetClip) {
        targetClip.src = videoUrl;
        targetClip.type = 'Video';
        targetClip.volume = volume;
        const currentFromUs = targetClip.timing?.display?.from ?? (targetClip.display?.from ?? 0);
        targetClip.timing = {
          display: {
            from: currentFromUs,
            to: currentFromUs + durationUs,
          },
          trim: {
            from: 0,
            to: durationUs,
          },
          duration: durationUs,
          playbackRate: 1,
        };
        targetClip.style = targetClip.style || {};
        targetClip.locked = false;
        targetClip.effects = targetClip.effects || [];
        targetClip.animations = targetClip.animations || [];
        targetClip.transform = {
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          angle: 0,
          opacity: 1,
          zIndex: 10,
          flip: {
            x: false,
            y: false,
          },
        };

        const effectKey = normalizeEffectKey(scene.video_effect || scene.videoEffect);
        if (effectKey) {
          const effectDurationUs = Math.min(500_000, durationUs);
          targetClip.effects = [
            {
              id: `eff_${targetClip.id}`,
              key: effectKey,
              startTime: 0,
              duration: effectDurationUs,
            },
          ];
        }

        clips[targetClip.id] = { ...targetClip } as any;
      }

      // Add / Update Transition Effect if scene has transitionEffect
      if (sceneIndex > 1) {
        const prevClipId = `clip_v_${epId}_s${sceneIndex - 1}`;
        const transKey = normalizeTransitionKey(scene.transition_effect || scene.transitionEffect);
        if (transKey && clips[prevClipId] && clips[vClipId]) {
          const transClipId = `clip_trans_${epId}_s${sceneIndex - 1}`;
          clips[transClipId] = {
            id: transClipId,
            type: 'Transition',
            name: `Transition: ${transKey}`,
            transitionKey: transKey,
            duration: 1_000_000,
            fromClipId: prevClipId,
            toClipId: vClipId,
          } as any;
        }
      }

      core.store.setState({ ...state, clips, tracks });

      // If backend returned BGM, Voiceover, or Captions directly from video-generate, sync immediately without extra API call!
      if (audioData && (audioData.bgmUrl || audioData.voiceoverUrl || (Array.isArray(audioData.captionsData) && audioData.captionsData.length > 0))) {
        await applySceneAudioDataToTimeline(sceneIndex, audioData, scene);
      } else if (hasDialogue) {
        await separateSceneAudio(sceneIndex, videoUrl, scene.dialogue);
      } else {
        await saveCurrentTimeline(`Scene ${sceneIndex} video clip synced`);
      }
    } catch (e) {
      console.warn('[usePipelineStore] Failed to sync video clip to timeline:', e);
    }
  }

  // ─── Save Timeline Snapshot to Backend DB ─────────────────────────────────
  async function saveCurrentTimeline(changeSummary = 'Pipeline update') {
    try {
      const epId = seriesStore.activeEpisodeId;
      if (!epId) return;
      const state = core.store.getState();
      await http.put(`/episodes/${epId}/timeline`, {
        settings: state.settings,
        tracks: state.tracks,
        clips: state.clips,
        change_summary: changeSummary,
        client_timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      console.warn('[usePipelineStore] Failed to auto-save timeline snapshot:', e?.message);
    }
  }

  async function syncSceneVoiceoverAndCaptionsToTimeline(
    _sceneIndex: number,
    _audioUrl: string,
    _cues: any[],
    _scene: any,
    _words?: any[],
    _explicitVoiceStartUs?: number,
    _explicitVoiceDurationUs?: number
  ) {
    try {
      const epId = seriesStore.activeEpisodeId;
      await seriesStore.loadEpisodeTimeline(epId, true);
    } catch (e) {
      console.warn('[usePipelineStore] Failed to reload synchronized timeline:', e);
    }
  }

  // ─── B4 Dubbing: Re-align clip timings after multi-language TTS ──────────────────
  async function reAlignDubbing(langCode: string) {
    const epId = seriesStore.activeEpisodeId;
    if (!epId) return;
    const scenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
    try {
      await http.post('/voices/dubbing/re-align', {
        episode_id: epId,
        language: langCode,
        scenes: scenes.map((s: any) => ({ index: s.index, duration: s.duration_seconds || s.durationSeconds || 5 })),
      });
    } catch (err) {
      console.warn('[reAlignDubbing] failed:', err);
    }
  }

  // ─── Apply Scene Audio & Captions directly to OpenVideo Timeline ─────────────
  async function applySceneAudioDataToTimeline(sceneIndex: number, data: any, currentScene: any) {
    const epId = seriesStore.activeEpisodeId;
    if (!epId || !data) return;

    // const rawCues = (Array.isArray(data.captionsData) && data.captionsData.length > 0)
    //   ? data.captionsData
    //   : (Array.isArray(data.cues) && data.cues.length > 0 ? data.cues : currentScene?.dialogue || []);
    const rawCues = [];//test caption time by LLM
    const bgmUrl = data.bgm_url || data.bgmUrl;
    const vUrl = data.voiceover_url || data.voiceoverUrl;
    if (bgmUrl || vUrl) {
      seriesStore.updateSceneAssets(epId, sceneIndex, {
        bgm_url: bgmUrl,
        voiceover_url: vUrl,
        captions_data: rawCues.length > 0 ? rawCues : undefined,
        voice_duration_us: data.voice_duration_us || data.voiceDurationUs || data.durationUs,
      });
    }

    const state = core.store.getState();
    const clips = { ...(state.clips || {}) };
    const tracks = [ ...(state.tracks || []) ];

    const vClipId = `clip_v_${epId}_s${sceneIndex}`;
    const vClip: any = clips[vClipId] || Object.values(clips).find((c: any) =>
      c.id === vClipId || ((c.type === 'Video' || c.type === 'Image') && (c.name?.includes(`Scene ${sceneIndex}`) || c.label?.includes(`Scene ${sceneIndex}`)))
    );
    const sceneFromUs = vClip?.timing?.display?.from ?? (vClip?.display?.from ?? 0);
    const sceneDurationUs = vClip?.timing?.duration ?? (vClip?.duration ?? Math.round((Number((currentScene as any)?.duration_seconds || (currentScene as any)?.durationSeconds) || 6) * 1_000_000));

    // 1. Sync BGM / Ambient Track
    if (bgmUrl) {
      let bgmTrack = tracks.find((t: any) => t.id === 'track_bgm' || t.id === 'track_bgm_main' || (t.type === 'Audio' && t.name?.toLowerCase().includes('bgm')));
      if (!bgmTrack) {
        bgmTrack = {
          id: 'track_bgm',
          name: 'Music',
          type: 'Audio',
          clipIds: [],
        };
        tracks.push(bgmTrack);
      }

      const bgmClipId = `clip_bgm_${epId}_s${sceneIndex}`;
      if (!bgmTrack.clipIds.includes(bgmClipId)) {
        bgmTrack.clipIds.push(bgmClipId);
      }

      clips[bgmClipId] = {
        id: bgmClipId,
        type: 'Audio',
        name: `BGM Scene ${sceneIndex}`,
        src: bgmUrl,
        timing: {
          display: { from: sceneFromUs, to: sceneFromUs + sceneDurationUs },
          trim: { from: 0, to: sceneDurationUs },
          duration: sceneDurationUs,
          playbackRate: 1,
        },
        volume: 0.8,
        style: {},
        locked: false,
        effects: [],
        animations: [],
      } as any;
    }

    core.store.setState({ ...state, clips, tracks });

    // 2. Sync Real TTS Voiceover & Word-Level Captions
    if ((rawCues.length > 0) || (Array.isArray(data?.words) && data.words.length > 0) || vUrl) {
      await syncSceneVoiceoverAndCaptionsToTimeline(
        sceneIndex,
        vUrl,
        rawCues,
        currentScene,
        data.words,
        data.voice_start_us || data.voiceStartUs,
        data.voice_duration_us || data.voiceDurationUs
      );
    } else {
      await saveCurrentTimeline(`Scene ${sceneIndex} BGM and audio synced`);
    }

    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
  }

  // ─── Separate Scene Audio (Extract Vocal vs BGM/Ambient with Timestamps) ───
  async function separateSceneAudio(sceneIndex: number, videoUrl: string, dialogue?: any[]) {
    const epId = seriesStore.activeEpisodeId;
    if (!epId || !videoUrl) return;

    try {
      const allScenes = seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || [];
      const currentScene = allScenes.find((s: any) => s.index === sceneIndex) || { index: sceneIndex, dialogue };
      const rawDialogue = dialogue || currentScene.dialogue || [];

      const res: any = await http.post('/voices/separate-audio', {
        episode_id: epId,
        scene_index: sceneIndex,
        video_url: videoUrl,
        dialogue: rawDialogue,
      });

      const data = res?.data;
      if (data) {
        await applySceneAudioDataToTimeline(sceneIndex, data, currentScene);
      }

      return data;
    } catch (err: any) {
      console.warn(`[separateSceneAudio] scene ${sceneIndex} notice:`, err?.message);
      return null;
    }
  }

  // ─── Background Job Tracking & Engine ─────────────────────────────────────
  const activeJobs = ref<any[]>([]);
  const isJobsLoading = ref(false);
  let isPollingBusy = false;
  let currentPollAbortController: AbortController | null = null;
  let jobPollingTimeout: any = null;
  let isPollingActive = false;

  const isJobRunning = computed(() => activeJobs.value.some(j => j.status === 'running' || j.status === 'queued'));
  const activeJob = computed(() => activeJobs.value.find(j => j.status === 'running' || j.status === 'queued') || activeJobs.value[0] || null);

  async function fetchActiveJobs(seriesId?: string, episodeId?: string) {
    if (isPollingBusy) {
      return activeJobs.value;
    }
    isPollingBusy = true;
    isJobsLoading.value = activeJobs.value.length === 0;

    const sid = seriesId !== undefined ? seriesId : (seriesStore.currentSeries?.id || 'all');
    const eid = episodeId || seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;

    if (currentPollAbortController) {
      currentPollAbortController.abort();
    }
    currentPollAbortController = new AbortController();

    try {
      const res: any = await http.get('/jobs/active', {
        params: { series_id: sid, episode_id: eid },
        // signal: currentPollAbortController.signal,
        timeout: 60000,
      });
      const data = res?.data || res;
      const jobsList = data?.jobs || data?.data?.jobs || (Array.isArray(data) ? data : []);
      if (Array.isArray(jobsList)) {
        activeJobs.value = jobsList;
      }
      return activeJobs.value;
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError' && err?.code !== 'ERR_CANCELED') {
        console.warn('[usePipelineStore] Error fetching active jobs:', err?.message || err);
      }
      return activeJobs.value;
    } finally {
      isPollingBusy = false;
      isJobsLoading.value = false;
    }
  }

  async function startBackgroundPipeline(params?: { forceRegenerate?: boolean; type?: string }) {
    const seriesId = seriesStore.currentSeries?.id;
    const episodeId = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
    if (!seriesId || !episodeId) {
      toast.error(i18n.global.t('toast.seriesOrEpisodeNotLoaded'));
      return null;
    }

    try {
      const res: any = await http.post('/jobs/start-pipeline', {
        series_id: seriesId,
        episode_id: episodeId,
        type: params?.type || 'full_pipeline',
        force_regenerate: params?.forceRegenerate || false,
      });

      const data = res?.data || res;
      if (data?.job) {
        await fetchActiveJobs(seriesId, episodeId);
        startJobPolling(seriesId, episodeId);
        toast.success(data.isNew ? 'Pipeline background job started' : 'Attached to running pipeline job');
        return data.job;
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to start pipeline job');
      return null;
    }
  }

  async function cancelBackgroundJob(jobId: string) {
    try {
      await http.post(`/jobs/${jobId}/cancel`);
      toast.info(i18n.global.t('toast.jobCancelled'));
      const sid = seriesStore.currentSeries?.id || 'all';
      const eid = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
      await fetchActiveJobs(sid, eid);
    } catch (err: any) {
      toast.error(i18n.global.t('toast.cancelJobFailed'));
    }
  }

  async function deleteBackgroundJob(jobId: string) {
    try {
      await http.delete(`/jobs/${jobId}`);
      activeJobs.value = activeJobs.value.filter((j) => j.id !== jobId);
      toast.success(i18n.global.t('toast.taskRemoved'));
      const sid = seriesStore.currentSeries?.id || 'all';
      const eid = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
      await fetchActiveJobs(sid, eid);
    } catch (err: any) {
      toast.error(i18n.global.t('toast.deleteTaskFailed'));
    }
  }

  async function retryJob(job: any) {
    if (!job) return;
    const type = job.type || 'full_pipeline';
    if (type.startsWith('step_')) {
      const stepKey = type.replace('step_', '');
      await retryPipelineStep(stepKey);
    } else {
      await startBackgroundPipeline({ forceRegenerate: true, type });
    }
  }

  async function retryPipelineStep(stepKey: string) {
    const seriesId = seriesStore.currentSeries?.id;
    const episodeId = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
    if (!seriesId || !episodeId) {
      toast.error(i18n.global.t('toast.seriesOrEpisodeNotSelected'));
      return null;
    }

    try {
      toast.info(i18n.global.t('toast.retryingStep', { step: stepKey.toUpperCase() }));
      const res: any = await http.post('/jobs/retry-step', {
        series_id: seriesId,
        episode_id: episodeId,
        step: stepKey,
      });
      const data = res?.data || res;
      if (data?.job) {
        await fetchActiveJobs(seriesId, episodeId);
        startJobPolling(seriesId, episodeId);
        toast.success(i18n.global.t('toast.stepRetryJobStarted', { step: stepKey.toUpperCase() }));
        return data.job;
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to retry step');
      return null;
    }
  }

  async function retrySingleAsset(asset: AssetJobItem) {
    const seriesId = seriesStore.currentSeries?.id;
    const episodeId = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
    if (!seriesId || !episodeId) {
      toast.error(i18n.global.t('toast.seriesOrEpisodeNotSelected'));
      return null;
    }

    try {
      toast.info(i18n.global.t('toast.regeneratingAsset', { name: asset.name }));
      const res: any = await http.post('/jobs/retry-asset', {
        series_id: seriesId,
        episode_id: episodeId,
        asset_type: asset.type,
        asset_id: asset.id,
        scene_index: asset.scene_index,
        name: asset.name,
      });
      const data = res?.data || res;
      toast.success(res?.message || `Asset "${asset.name}" regenerated`);
      await fetchActiveJobs(seriesId, episodeId);
      startJobPolling(seriesId, episodeId);
      await seriesStore.loadWorkspaceData(seriesId);
      return data;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to retry asset');
      return null;
    }
  }

  let socketListenersInitialized = false;
  function initJobSocketListeners() {
    if (socketListenersInitialized) return;
    socketListenersInitialized = true;
    try {
      const ws = useWebSocket();
      // Ensure socket room connection for current series
      const sid = seriesStore.currentSeries?.id;
      if (sid) {
        ws.connect(sid);
      } else {
        ws.connect();
      }

      watch(
        () => seriesStore.currentSeries?.id,
        (newSid) => {
          if (newSid) {
            ws.connect(newSid);
          }
        },
        { immediate: true }
      );

      ws.onPipelineJobUpdated((updatedJob: any) => {
        if (!updatedJob?.id) return;
        console.log('[usePipelineStore] Realtime update for job:', updatedJob.id, updatedJob.status, `${updatedJob.progress}%`);
        const idx = activeJobs.value.findIndex(j => j.id === updatedJob.id);
        if (idx >= 0) {
          activeJobs.value[idx] = { ...activeJobs.value[idx], ...updatedJob };
          activeJobs.value = [...activeJobs.value];
        } else {
          activeJobs.value = [updatedJob, ...activeJobs.value];
        }
        const currentSid = seriesStore.currentSeries?.id;
        const currentEid = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
        if (currentSid) {
          // Sync workspace and episode script so new assets from each finished step show up immediately
          seriesStore.loadWorkspaceData(currentSid).then(() => {
            if (currentEid) {
              seriesStore.loadEpisodeScript(currentSid, currentEid);
            }
            if (seriesStore.activeEpisode) {
              syncStepStatusesWithEpisode(seriesStore.activeEpisode, seriesStore.charactersList);
            }
            window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
          });
        }
      });

      ws.onPipelineJobCompleted((completedJob: any) => {
        if (!completedJob?.id) return;
        console.log('[usePipelineStore] Realtime completed for job:', completedJob.id);
        const idx = activeJobs.value.findIndex(j => j.id === completedJob.id);
        if (idx >= 0) {
          activeJobs.value[idx] = { ...activeJobs.value[idx], ...completedJob };
          activeJobs.value = [...activeJobs.value];
        } else {
          activeJobs.value = [completedJob, ...activeJobs.value];
        }
        const currentSid = seriesStore.currentSeries?.id;
        const currentEid = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
        if (currentSid) {
          seriesStore.loadWorkspaceData(currentSid).then(() => {
            if (currentEid) {
              seriesStore.loadEpisodeScript(currentSid, currentEid);
            }
            window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
          });
        }
      });

      ws.onEpisodeUpdated((latestEp: any) => {
        if (latestEp?.id) {
          const idx = seriesStore.episodesList.findIndex((ep: any) => ep.id === latestEp.id);
          if (idx >= 0) {
            seriesStore.episodesList[idx] = { ...seriesStore.episodesList[idx], ...latestEp };
            seriesStore.episodesList = [...seriesStore.episodesList];
          } else {
            seriesStore.episodesList.push(latestEp);
          }
          if (latestEp.id === (seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId)) {
            syncStepStatusesWithEpisode(latestEp, seriesStore.charactersList);
            const currentSid = seriesStore.currentSeries?.id;
            if (currentSid) {
              seriesStore.loadEpisodeScript(currentSid, latestEp.id);
            }
            window.dispatchEvent(new CustomEvent('pipeline-asset-updated'));
          }
        }
      });
    } catch (err) {
      console.warn('[usePipelineStore] WebSocket listeners init notice:', err);
    }
  }

  // Eagerly initialize WebSocket listeners immediately when store is created
  initJobSocketListeners();

  function startJobPolling(seriesId?: string, episodeId?: string, runningIntervalMs = 60000, idleIntervalMs = 120000) {
    initJobSocketListeners();
    stopJobPolling();
    isPollingActive = true;

    const sid = seriesId !== undefined ? seriesId : (seriesStore.currentSeries?.id || 'all');
    const eid = episodeId || seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;

    async function pollTick() {
      if (!isPollingActive) return;
      const currentSid = seriesStore.currentSeries?.id || sid || 'all';
      const currentEid = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId || eid;

      try {
        const ws = useWebSocket();
        // If WebSocket is connected, we don't need rapid HTTP polling!
        // We only do a light fallback check at very relaxed intervals (60s-120s)
        const jobs = await fetchActiveJobs(currentSid, currentEid);
        const runningJob = jobs.find((j: any) => j.status === 'running' || j.status === 'queued');
        if (runningJob && seriesStore.activeEpisode) {
          syncStepStatusesWithEpisode(seriesStore.activeEpisode, seriesStore.charactersList);
        }
      } catch (err) {
        console.warn('[usePipelineStore] Polling tick notice:', err);
      } finally {
        if (isPollingActive) {
          const ws = useWebSocket();
          // If WS is healthy and connected, relax polling to 2 minutes; if disconnected, fallback to 30s
          const delay = ws.isConnected.value ? idleIntervalMs : (runningIntervalMs || 30000);
          jobPollingTimeout = setTimeout(pollTick, delay);
        }
      }
    }

    // Launch first poll immediately to initialize initial state
    pollTick();
  }

  function stopJobPolling() {
    isPollingActive = false;
    if (jobPollingTimeout) {
      clearTimeout(jobPollingTimeout);
      jobPollingTimeout = null;
    }
    if (currentPollAbortController) {
      currentPollAbortController.abort();
      currentPollAbortController = null;
    }
    isPollingBusy = false;
  }

  // ─── Reset ────────────────────────────────────────────────────────────────
  function resetAll() {
    pipelineSteps.value.forEach(s => s.status = 'idle');
    sceneRenderStatuses.value.clear();
    characterRenderStatuses.value.clear();
    isRendering.value = false;
    currentRenderingMessage.value = '';
    currentRenderingPercent.value = 0;
    currentRenderingScene.value = null;
    stopJobPolling();
  }

  return {
    voicePresets,
    isVoicePresetsLoading,
    fetchVoicePresets,
    pipelineSteps,
    sceneRenderStatuses,
    characterRenderStatuses,
    isRendering,
    currentRenderingMessage,
    currentRenderingPercent,
    currentRenderingScene,
    activeRenderingItem,
    activeRenderingStep,
    activeRenderingProgress,
    setActiveProgress,
    isItemRendering,
    doneStepsCount,
    setStepStatus,
    getSceneStatus,
    updateSceneStatus,
    getCharStatus,
    syncStepStatusesWithEpisode,
    renderScene,
    renderAllScenes,
    renderAllAssetsAndStoryboard,
    renderCharacter,
    renderAllCharacters,
    renderSceneVideo,
    renderAllVideos,
    renderSceneVoiceover,
    renderAllVoiceovers,
    // renderSceneBgm,
    // renderAllBgm,
    syncCaptionsToTimeline,
    generateCaptionsForLanguage,
    reAlignDubbing,
    separateSceneAudio,
    activeJobs,
    activeJob,
    isJobRunning,
    isJobsLoading,
    fetchActiveJobs,
    startBackgroundPipeline,
    cancelBackgroundJob,
    deleteBackgroundJob,
    retryJob,
    retryPipelineStep,
    retrySingleAsset,
    startJobPolling,
    stopJobPolling,
    resetAll,
  };
});

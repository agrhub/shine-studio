<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { toast } from 'vue-sonner';
import CountryFlag from '@/components/common/CountryFlag.vue';
import {
  GEMINI_SPEECH_LANGUAGES,
  getLanguageByCode,
  type GeminiSpeechLanguage
} from '@/constants/geminiLanguages';
import { TabPaneName } from 'element-plus';
import { core } from '@/utils/project';
import { fontManager } from '@openvideo/engine-pixi';
import { getGroupedFonts, getFontByPostScriptName } from '@/utils/font-utils';
import http from '@/utils/http';

const emit = defineEmits<{
  (e: 'apply-captions'): void;
}>();

const { t } = useI18n();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();

// Font List
const GROUPED_FONTS = getGroupedFonts();

// Caption Styles & Properties matching OpenVideo Spec
const selectedCaptionStyle = ref<'pop' | 'minimal' | 'comic' | 'neon' | 'karaoke'>('pop');
const selectedFontFamily = ref('Bangers-Regular');
const captionTextColor = ref('#FFFFFF');
const activeWordHighlightColor = ref('#FFD700');
const captionOutlineColor = ref('#000000');
const captionFontSize = ref(44);
const captionVerticalPos = ref(80);
const captionOutlineWeight = ref(3);
const selectedVerticalAlign = ref<'top' | 'center' | 'bottom'>('bottom');
const selectedTextAlign = ref<'left' | 'center' | 'right'>('center');
const selectedWordsPerLine = ref<'multiple' | 'single'>('multiple');
const selectedTextCase = ref<'none' | 'uppercase' | 'lowercase'>('uppercase');
const enableBackgroundBox = ref(false);
const captionBgColor = ref('rgba(0, 0, 0, 0.7)');
const aiHighlightAnimate = ref(true);

const isTranslating = ref(false);

// Main target language for series
const mainTargetLang = computed<GeminiSpeechLanguage>(() => {
  return getLanguageByCode(seriesStore.currentSeries?.language || 'en-US');
});

// Language track state
const activeCapLang = ref('en-US');
const translateSourceLang = ref('en-US');
const activeTrackCodes = computed(() => seriesStore.captionLanguages);
const selectedBatchLangs = ref<string[]>([]);
const isBatchMode = ref(false);
const isEnableCaption = ref(true);
const selectedLangToAdd = ref<string>('');

// Hydrate caption settings from active episode
watch(() => seriesStore.activeEpisode?.caption_settings, (settings) => {
  if (settings) {
    if (settings.enable_caption !== undefined) isEnableCaption.value = settings.enable_caption;
    if (settings.caption_style) selectedCaptionStyle.value = settings.caption_style;
    if (settings.font_family) selectedFontFamily.value = settings.font_family;
    if (settings.font_size !== undefined) captionFontSize.value = settings.font_size;
    if (settings.text_color) captionTextColor.value = settings.text_color;
    if (settings.word_highlight_color) activeWordHighlightColor.value = settings.word_highlight_color;
    if (settings.outline_color) captionOutlineColor.value = settings.outline_color;
    if (settings.outline_weight !== undefined) captionOutlineWeight.value = settings.outline_weight;
    if (settings.vertical_pos !== undefined) captionVerticalPos.value = settings.vertical_pos;
    if (settings.vertical_align) selectedVerticalAlign.value = settings.vertical_align;
    if (settings.text_align) selectedTextAlign.value = settings.text_align;
    if (settings.words_per_line) selectedWordsPerLine.value = settings.words_per_line;
    if (settings.text_case) selectedTextCase.value = settings.text_case;
    if (settings.enable_background_box !== undefined) enableBackgroundBox.value = settings.enable_background_box;
    if (settings.bg_color) captionBgColor.value = settings.bg_color;
    if (settings.highlight_animate !== undefined) aiHighlightAnimate.value = settings.highlight_animate;
    applyStyleToTimeline();
  }
}, { immediate: true, deep: true });

function persistCaptionSettings() {
  const epId = seriesStore.activeEpisodeId;
  const sId = seriesStore.currentSeries?.id;
  if (!epId) return;
  seriesStore.updateEpisodeCaptionSettings(epId, {
    enable_caption: isEnableCaption.value,
    caption_style: selectedCaptionStyle.value,
    font_family: selectedFontFamily.value,
    font_size: captionFontSize.value,
    text_color: captionTextColor.value,
    word_highlight_color: activeWordHighlightColor.value,
    outline_color: captionOutlineColor.value,
    outline_weight: captionOutlineWeight.value,
    vertical_pos: captionVerticalPos.value,
    vertical_align: selectedVerticalAlign.value,
    text_align: selectedTextAlign.value,
    words_per_line: selectedWordsPerLine.value,
    text_case: selectedTextCase.value,
    enable_background_box: enableBackgroundBox.value,
    bg_color: captionBgColor.value,
    highlight_animate: aiHighlightAnimate.value,
  });
  if (sId) seriesStore.saveEpisodeScenes(sId, epId);
}

watch([
  isEnableCaption,
  selectedCaptionStyle,
  selectedFontFamily,
  captionFontSize,
  captionTextColor,
  activeWordHighlightColor,
  captionOutlineColor,
  captionOutlineWeight,
  captionVerticalPos,
  selectedVerticalAlign,
  selectedTextAlign,
  selectedWordsPerLine,
  selectedTextCase,
  enableBackgroundBox,
  captionBgColor,
  aiHighlightAnimate
], () => {
  persistCaptionSettings();
  applyStyleToTimeline();
});

// Auto-sync main language when active series changes
watch(mainTargetLang, (newMain) => {
  if (newMain) {
    seriesStore.addCaptionLanguage(newMain.code);
    if (!activeCapLang.value || (activeCapLang.value === 'en-US' && newMain.code !== 'en-US')) {
      activeCapLang.value = newMain.code;
    }
    translateSourceLang.value = newMain.code;
  }
}, { immediate: true });

// Bi-directional sync between activeCapLang and seriesStore.activePreviewCaptionLang
watch(activeCapLang, (newLang) => {
  if (newLang && newLang !== seriesStore.activePreviewCaptionLang) {
    seriesStore.setPreviewCaptionLanguage(newLang);
  }
});

watch(() => seriesStore.activePreviewCaptionLang, (newLang) => {
  if (newLang && newLang !== 'off' && newLang !== activeCapLang.value) {
    activeCapLang.value = newLang;
  }
});

function handleAddLanguage(code: string) {
  if (!code) return;
  seriesStore.addCaptionLanguage(code);
  activeCapLang.value = code;
  seriesStore.setPreviewCaptionLanguage(code);
  selectedLangToAdd.value = '';
  if (isEnableCaption.value && code !== mainTargetLang.value?.code) {
    handleTranslateActiveLanguage();
  }
}

const scenes = computed(() => seriesStore.activeEpisode?.scenes || []);
const b6Step = computed(() => pipelineStore.pipelineSteps.find(s => s.id === 'b6'));

// Caption state per-scene — tracks whether captions are synced
const captionSyncStatus = ref<Map<number, 'idle' | 'synced'>>(new Map());

function getCaptionStatus(sceneIndex: number) {
  return captionSyncStatus.value.get(sceneIndex) || 'idle';
}

const styleOptions = [
  { value: 'pop', label: '🔥 Pop' },
  { value: 'minimal', label: '✨ Minimal' },
  { value: 'comic', label: '💬 Comic' },
  { value: 'neon', label: '⚡ Neon' },
  { value: 'karaoke', label: '🎤 Karaoke' },
];

// Presets configuration matching OpenVideo Creative Captions Spec
function applyPreset(presetKey: 'pop' | 'minimal' | 'comic' | 'neon' | 'karaoke') {
  selectedCaptionStyle.value = presetKey;
  if (presetKey === 'pop') {
    selectedFontFamily.value = 'Bangers-Regular';
    captionFontSize.value = 46;
    captionTextColor.value = '#FFFFFF';
    activeWordHighlightColor.value = '#FFD700';
    captionOutlineWeight.value = 4;
    captionOutlineColor.value = '#000000';
    selectedTextCase.value = 'uppercase';
    selectedVerticalAlign.value = 'bottom';
    selectedTextAlign.value = 'center';
    enableBackgroundBox.value = false;
    captionVerticalPos.value = 80;
  } else if (presetKey === 'minimal') {
    selectedFontFamily.value = 'Inter-Regular';
    captionFontSize.value = 36;
    captionTextColor.value = '#FFFFFF';
    activeWordHighlightColor.value = '#67C23A';
    captionOutlineWeight.value = 0;
    captionOutlineColor.value = '#000000';
    selectedTextCase.value = 'none';
    selectedVerticalAlign.value = 'bottom';
    selectedTextAlign.value = 'center';
    enableBackgroundBox.value = true;
    captionBgColor.value = 'rgba(0, 0, 0, 0.6)';
    captionVerticalPos.value = 85;
  } else if (presetKey === 'comic') {
    selectedFontFamily.value = 'Bangers-Regular';
    captionFontSize.value = 48;
    captionTextColor.value = '#FFFF00';
    activeWordHighlightColor.value = '#FF3366';
    captionOutlineWeight.value = 5;
    captionOutlineColor.value = '#000000';
    selectedTextCase.value = 'uppercase';
    selectedVerticalAlign.value = 'bottom';
    selectedTextAlign.value = 'center';
    enableBackgroundBox.value = false;
    captionVerticalPos.value = 78;
  } else if (presetKey === 'neon') {
    selectedFontFamily.value = 'Outfit-Bold';
    captionFontSize.value = 44;
    captionTextColor.value = '#00FFFF';
    activeWordHighlightColor.value = '#FF00FF';
    captionOutlineWeight.value = 3;
    captionOutlineColor.value = '#001A33';
    selectedTextCase.value = 'uppercase';
    selectedVerticalAlign.value = 'bottom';
    selectedTextAlign.value = 'center';
    enableBackgroundBox.value = false;
    captionVerticalPos.value = 80;
  } else if (presetKey === 'karaoke') {
    selectedFontFamily.value = 'Outfit-Bold';
    captionFontSize.value = 44;
    captionTextColor.value = '#FFFFFF';
    activeWordHighlightColor.value = '#00FF66';
    captionOutlineWeight.value = 3;
    captionOutlineColor.value = '#111111';
    selectedTextCase.value = 'uppercase';
    selectedVerticalAlign.value = 'bottom';
    selectedTextAlign.value = 'center';
    enableBackgroundBox.value = false;
    captionVerticalPos.value = 82;
  }
  applyStyleToTimeline();
}

// Real-time Style Sync to OpenVideo Timeline & Pixi Compositor
async function applyStyleToTimeline() {
  const state = core.store.getState();
  const settings = state.settings || { width: 1080, height: 1920 };
  const videoHeight = settings.height || 1920;
  const videoWidth = settings.width || 1080;
  const captionWidth = Math.round(videoWidth * 0.85);

  const font = getFontByPostScriptName(selectedFontFamily.value);
  if (font && font.url) {
    try {
      await fontManager.addFont({ name: font.postScriptName, url: font.url });
    } catch {
      // Font load fallback
    }
  }

  const styleObj: any = {
    fontFamily: selectedFontFamily.value,
    fontSize: captionFontSize.value,
    color: captionTextColor.value,
    textAlign: selectedTextAlign.value,
    align: selectedTextAlign.value,
    textCase: selectedTextCase.value,
    backgroundColor: enableBackgroundBox.value ? captionBgColor.value : undefined,
    padding: enableBackgroundBox.value ? 10 : undefined,
    borderRadius: enableBackgroundBox.value ? 8 : undefined,
    stroke: captionOutlineWeight.value > 0 ? {
      color: captionOutlineColor.value,
      width: captionOutlineWeight.value,
    } : undefined,
    fontUrl: font?.url,
  };

  const colorsObj: any = {
    active: {
      color: activeWordHighlightColor.value,
    },
    keyword: {
      color: activeWordHighlightColor.value,
    },
  };

  const calculatedTop = Math.round((videoHeight * (captionVerticalPos.value / 100)) - 120 / 2);

  // 1. Update masterTracks in seriesStore (All language subtitle tracks)
  if (Array.isArray(seriesStore.masterTracks)) {
    seriesStore.masterTracks.forEach((t: any) => {
      if (t.type === 'Caption' || t.id?.startsWith('track_caption')) {
        t.config = {
          ...(t.config || {}),
          captions: {
            ...(t.config?.captions || {}),
            style: {
              ...(t.config?.captions?.style || {}),
              ...styleObj,
            },
            colors: {
              ...(t.config?.captions?.colors || {}),
              ...colorsObj,
            },
            wordsPerLine: selectedWordsPerLine.value,
          },
        };
      }
    });
  }

  // 2. Update masterClips in seriesStore (All language subtitle clips across ALL tracks)
  if (seriesStore.masterClips && typeof seriesStore.masterClips === 'object') {
    Object.keys(seriesStore.masterClips).forEach((clipId) => {
      const clip = seriesStore.masterClips[clipId];
      if (clip && (clip.type === 'Caption' || clip.trackId?.startsWith('track_caption'))) {
        clip.left = Math.round((videoWidth - captionWidth) / 2);
        clip.top = calculatedTop;
        clip.visible = isEnableCaption.value;
        clip.transform = {
          ...(clip.transform || {}),
          x: clip.left,
          y: calculatedTop,
          width: captionWidth,
          height: clip.height || 120,
        };
        clip.wordsPerLine = selectedWordsPerLine.value;
        clip.textCase = selectedTextCase.value;
        clip.style = {
          ...(clip.style || {}),
          ...styleObj,
        };
        clip.caption = {
          ...(clip.caption || {}),
          colors: {
            ...(clip.caption?.colors || {}),
            ...colorsObj,
          },
          wordAnimation: aiHighlightAnimate.value ? {
            type: 'scale',
            application: 'active',
            value: 1.15,
          } : undefined,
        };
      }
    });
  }

  // 3. Update current active clips in core store
  const currentClips = { ...(state.clips || {}) };
  Object.keys(currentClips).forEach((clipId) => {
    const clip = currentClips[clipId];
    if (clip && (clip.type === 'Caption' || clip.trackId?.startsWith('track_caption'))) {
      clip.left = Math.round((videoWidth - captionWidth) / 2);
      clip.top = calculatedTop;
      clip.visible = isEnableCaption.value;
      clip.transform = {
        ...(clip.transform || {}),
        x: clip.left,
        y: calculatedTop,
        width: captionWidth,
        height: clip.height || 120,
      };
      clip.wordsPerLine = selectedWordsPerLine.value;
      clip.textCase = selectedTextCase.value;
      clip.style = {
        ...(clip.style || {}),
        ...styleObj,
      };
      clip.caption = {
        ...(clip.caption || {}),
        colors: {
          ...(clip.caption?.colors || {}),
          ...colorsObj,
        },
        wordAnimation: aiHighlightAnimate.value ? {
          type: 'scale',
          application: 'active',
          value: 1.15,
        } : undefined,
      };
    }
  });

  const currentTracks = (state.tracks || []).map((t: any) => {
    if (t.type === 'Caption' || t.id?.startsWith('track_caption')) {
      return {
        ...t,
        config: {
          ...(t.config || {}),
          captions: {
            ...(t.config?.captions || {}),
            style: {
              ...(t.config?.captions?.style || {}),
              ...styleObj,
            },
            colors: {
              ...(t.config?.captions?.colors || {}),
              ...colorsObj,
            },
            wordsPerLine: selectedWordsPerLine.value,
          },
        },
      };
    }
    return t;
  });

  core.store.setState({
    ...state,
    clips: currentClips,
    tracks: currentTracks,
  });

  // Re-apply language filter to keep preview tracks in sync
  seriesStore.applyLanguageTrackFilter();

  // Force Pixi canvas redraw at current playhead position
  try {
    const curTime = core.store.getState().currentTime || 0;
    core.playback.seek(curTime);
  } catch (_) {}
}

// Vertical align slot quick-setter
function setVerticalSlot(slot: 'top' | 'center' | 'bottom') {
  selectedVerticalAlign.value = slot;
  if (slot === 'top') captionVerticalPos.value = 15;
  else if (slot === 'center') captionVerticalPos.value = 50;
  else captionVerticalPos.value = 80;
  applyStyleToTimeline();
}

function handleVerticalSliderChange() {
  if (captionVerticalPos.value < 30) selectedVerticalAlign.value = 'top';
  else if (captionVerticalPos.value > 70) selectedVerticalAlign.value = 'bottom';
  else selectedVerticalAlign.value = 'center';
  applyStyleToTimeline();
}

// Format microsecond timestamps to standard SRT format
function formatSRTTime(micros: number): string {
  const ms = Math.floor(micros / 1000);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Export SRT Subtitle File
function handleExportSRT() {
  const state = core.store.getState();
  const clips = Object.values(state.clips || {}).filter((c: any) => c.type === 'Caption');
  if (clips.length === 0) {
    toast.info(t('toast.noCaptionsToExport', 'No caption clips found on timeline to export'));
    return;
  }
  clips.sort((a: any, b: any) => (a.timing?.display?.from || a.display?.from || 0) - (b.timing?.display?.from || b.display?.from || 0));
  const srtContent = clips.map((clip: any, idx: number) => {
    const fromUs = clip.timing?.display?.from || clip.display?.from || 0;
    const toUs = clip.timing?.display?.to || clip.display?.to || fromUs + 2_000_000;
    return `${idx + 1}\n${formatSRTTime(fromUs)} --> ${formatSRTTime(toUs)}\n${clip.text || ''}\n`;
  }).join('\n');

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `subtitles_${activeCapLang.value}.srt`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(t('toast.subtitlesExported'));
}

// Shift All Captions Calibration (+/- ms)
function shiftAllCaptions(offsetMs: number) {
  const state = core.store.getState();
  const clips = { ...(state.clips || {}) };
  let updated = false;

  Object.keys(clips).forEach((key) => {
    const clip = clips[key];
    if (clip && clip.type === 'Caption') {
      updated = true;
      const curFrom = clip.timing?.display?.from ?? clip.display?.from ?? 0;
      const curTo = clip.timing?.display?.to ?? clip.display?.to ?? (curFrom + (clip.duration || 2_000_000));
      const newFrom = Math.max(0, curFrom + offsetMs * 1000);
      const newTo = Math.max(newFrom + 200_000, curTo + offsetMs * 1000);
      clip.display = { from: newFrom, to: newTo };
      clip.timing = {
        ...(clip.timing || {}),
        display: { from: newFrom, to: newTo },
      };
    }
  });

  if (updated) {
    core.store.setState({ ...state, clips });
    toast.info(t('toast.captionsShifted'));
  }
}

function applyAllCaptions() {
  pipelineStore.setStepStatus('b6', 'running');
  applyStyleToTimeline();
  scenes.value.forEach(scene => {
    captionSyncStatus.value.set(scene.index, 'synced');
  });
  setTimeout(() => {
    pipelineStore.setStepStatus('b6', 'done');
    toast.success(t('toast.b6CaptionsSynced', 'Captions applied to timeline'));
  }, 400);
}

// Get cues for active language + scene
function getSceneCues(sceneIndex: number) {
  const langCode = activeCapLang.value;
  const sc = scenes.value.find((s: any) => s.index === sceneIndex);
  const cleanTarget = langCode ? langCode.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

  if (sc) {
    if (langCode === mainTargetLang.value?.code && Array.isArray(sc.captions_data) && sc.captions_data.length > 0) {
      return sc.captions_data;
    }
    if (sc.translations && typeof sc.translations === 'object') {
      for (const [k, trans] of Object.entries(sc.translations as Record<string, any>)) {
        const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey === cleanTarget || cleanKey.startsWith(cleanTarget) || cleanTarget.startsWith(cleanKey)) {
          if (trans && Array.isArray(trans.captions_data) && trans.captions_data.length > 0) {
            return trans.captions_data;
          }
          const line = trans.translated_dialogue
            || (typeof trans.dialogue === 'string' ? trans.dialogue : (Array.isArray(trans.dialogue) ? trans.dialogue.map((d: any) => d.line).join(' ') : ''));
          if (line) {
            const durMs = (sc.duration_seconds || 6) * 1000;
            return [{
              id: `cue_${sc.index}_${langCode}_0`,
              text: line,
              start_ms: 0,
              end_ms: durMs,
              from_us: 0,
              to_us: durMs * 1000,
              duration_ms: durMs,
            }];
          }
        }
      }
    }
  }

  const epId = seriesStore.activeEpisodeId;
  if (!epId) return [];
  const tracks = seriesStore.getLanguageTracks(epId);
  const track = tracks.find(t => {
    const cleanT = t.language_code ? t.language_code.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    return cleanT === cleanTarget || cleanT.startsWith(cleanTarget) || cleanTarget.startsWith(cleanT);
  });
  return track?.scene_captions[sceneIndex] || [];
}

function hasCaptions(sceneIndex: number) {
  return getSceneCues(sceneIndex).length > 0;
}

function getSceneDialogueLine(scene: any, langCode: string) {
  if (langCode === mainTargetLang.value?.code) {
    return scene.dialogue?.[0]?.line || '';
  }
  const cleanTarget = langCode ? langCode.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  if (scene.translations && typeof scene.translations === 'object') {
    for (const [k, trans] of Object.entries(scene.translations as Record<string, any>)) {
      const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanKey === cleanTarget || cleanKey.startsWith(cleanTarget) || cleanTarget.startsWith(cleanKey)) {
        if (typeof trans.translated_dialogue === 'string' && trans.translated_dialogue.trim()) return trans.translated_dialogue;
        if (typeof trans.dialogue === 'string' && trans.dialogue.trim()) return trans.dialogue;
        if (Array.isArray(trans.dialogue) && trans.dialogue[0]?.line) return trans.dialogue[0].line;
      }
    }
  }
  return scene.dialogue?.[0]?.line || '';
}

// AI Auto Translate Subtitles for active language tab
async function handleTranslateActiveLanguage() {
  const targetLang = activeCapLang.value;
  const sourceLang = mainTargetLang.value.code;
  if (targetLang === sourceLang) {
    toast.info(t('toast.alreadyMainLang', 'This is the main language track. Use Autofill to generate.'));
    return;
  }

  isTranslating.value = true;
  try {
    toast.info(t('toast.translatingCaptions', `Translating subtitles from ${getLanguageByCode(sourceLang).nativeName} to ${getLanguageByCode(targetLang).nativeName}...`));
    await pipelineStore.generateCaptionsForLanguage(targetLang, sourceLang);
    if (seriesStore.activeEpisodeId) {
      await seriesStore.loadEpisode(seriesStore.currentSeries!.id, seriesStore.activeEpisodeId);
      await seriesStore.loadEpisodeTimeline(seriesStore.activeEpisodeId, { forceReset: true });
    }
    emit('apply-captions');
    applyStyleToTimeline();
    toast.success(t('toast.captionsTranslated', `Subtitles translated to ${getLanguageByCode(targetLang).nativeName} successfully!`));
  } catch (err: any) {
    toast.error(t('toast.captionTranslationFailed', `Translation failed: ${err?.message || 'Unknown error'}`));
  } finally {
    isTranslating.value = false;
  }
}

// Generate captions for all selected tracks or active track
async function generateCaptions() {
  const langs = isBatchMode.value && selectedBatchLangs.value.length > 0
    ? selectedBatchLangs.value
    : [activeCapLang.value];

  for (const lang of langs) {
    try {
      toast.info(t('toast.generatingCaptionsLang', { lang }));
      await pipelineStore.generateCaptionsForLanguage(lang);
      emit('apply-captions');
      applyStyleToTimeline();
      toast.success(t('toast.b6CaptionsSynced', 'Captions generated successfully'));
    } catch {
      toast.error(t('toast.captionGenerationFailed', 'Caption generation failed'));
    }
  }
}

function handleRemoveLanguage(lang: TabPaneName) {
  if (seriesStore.captionLanguages.length === 1) {
    return;
  }
  seriesStore.removeCaptionLanguage(lang as string);
  if (activeCapLang.value === lang) {
    activeCapLang.value = seriesStore.captionLanguages[0];
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header Feature Toggle -->
    <div class="space-y-3">
      <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
        {{ t('workspace.captionFeatures', 'Caption Features') }}
      </h3>

      <div class="p-3.5 rounded-xl border flex items-center justify-between" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
        <div>
          <p class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.aiAutoCaption', 'AI Auto Caption') }}</p>
          <p class="text-[10px]" style="color: var(--el-text-color-secondary);">{{ t('workspace.autoGenerateEpisodeCaption', 'Auto generate & synchronize episode captions') }}</p>
        </div>
        <el-badge value="" class="item">
          <el-switch v-model="isEnableCaption" :disabled="true" size="small" />
        </el-badge>
      </div>
    </div>

    <template v-if="isEnableCaption">
      <!-- Languages Bar -->
      <div class="space-y-3">
        <div class="flex flex-row p-3.5 gap-2 rounded-xl border items-center justify-between" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
          <div>
            <p class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.captionLanguages', 'Caption Languages') }}</p>
            <p class="text-[10px]" style="color: var(--el-text-color-secondary);">{{ t('workspace.episodeCaptionsDescription', 'Add languages for episode subtitles') }}</p>
          </div>
          <!-- Add Language Dropdown from Gemini 48+ Catalog -->
          <el-select
            v-model="selectedLangToAdd"
            size="small"
            filterable
            :placeholder="`+ ${t('workspace.languages', 'Languages')}`"
            class="!w-28" :disabled="true"
            @change="handleAddLanguage"
          >
            <el-option
              v-for="l in GEMINI_SPEECH_LANGUAGES"
              :key="l.code"
              :value="l.code"
              :label="`${l.flag} ${l.nativeName}`"
            >
              <div class="flex items-center justify-between w-full">
                <span class="flex items-center gap-1.5">
                  <CountryFlag :code="l.countryCode" :flag="l.flag" size="small" />
                  <span>{{ l.nativeName }}</span>
                </span>
                <span class="text-[10px]" style="color: var(--el-text-color-placeholder);">{{ l.region }}</span>
              </div>
            </el-option>
          </el-select>
        </div>
      </div>

      <!-- Language Tabs Container -->
      <el-tabs
        v-model="activeCapLang"
        type="card"
        size="small"
        @tab-remove="handleRemoveLanguage"
      >
        <el-tab-pane
          v-for="code in activeTrackCodes"
          :key="code"
          :closable="code !== mainTargetLang.code"
          :name="code"
        >
          <template #label>
            <span class="flex items-center gap-1.5 text-xs font-medium">
              <CountryFlag :code="getLanguageByCode(code).countryCode" :flag="getLanguageByCode(code).flag" size="small" />
              <span>{{ getLanguageByCode(code).nativeName }}</span>
              <span v-if="code === mainTargetLang.code" class="text-[9px] uppercase font-bold text-emerald-500 ml-0.5">({{ t('workspace.mainTag', 'Main') }})</span>
            </span>
          </template>

          <div class="flex flex-col gap-4 px-1 pt-2">
            <!-- Translation Banner for Non-Main Language Tracks -->
            <div
              v-if="code !== mainTargetLang.code"
              class="p-3 rounded-xl border flex items-center justify-between bg-primary/5 border-primary/20"
            >
              <div class="flex flex-col gap-0.5">
                <p class="text-xs font-bold text-primary flex items-center gap-1">
                  🌐 {{ t('workspace.autoTranslateTo', `Translate to ${getLanguageByCode(code).nativeName}`) }}
                </p>
                <p class="text-[10px]" style="color: var(--el-text-color-secondary);">
                  {{ t('workspace.translateFromMainDesc', `Translate dialogue from ${mainTargetLang.nativeName} into ${getLanguageByCode(code).nativeName} using Gemini AI`) }}
                </p>
              </div>
              <el-button
                type="primary"
                size="small"
                round
                :loading="isTranslating"
                icon="MagicStick"
                @click="handleTranslateActiveLanguage"
              >
                {{ isTranslating ? t('workspace.translating', 'Translating...') : t('workspace.translateNow', 'Translate') }}
              </el-button>
            </div>

            <!-- Scene Cues List -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
                  {{ t('workspace.captionPerVoiceover', 'Scene Dialogue & Subtitles') }}
                </h3>
                <div class="flex items-center gap-2">
                  <el-button link type="primary" size="small" icon="MagicStick" @click="code === mainTargetLang.code ? generateCaptions() : handleTranslateActiveLanguage()">
                    {{ code === mainTargetLang.code ? t('workspace.autofill', 'Autofill') : t('workspace.translate', 'Translate') }}
                  </el-button>
                </div>
              </div>

              <div class="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                <template v-for="scene in scenes" :key="`cap_${scene.index}`">
                  <div
                    v-if="scene.dialogue && scene.dialogue.length > 0"
                    class="rounded-xl border overflow-hidden"
                    style="border-color: var(--el-border-color-light); background-color: var(--el-fill-color-light);"
                  >
                    <!-- Scene Header -->
                    <div class="p-2.5 flex justify-between items-center border-b" style="border-color: var(--el-border-color-lighter);">
                      <span class="text-[10px] font-bold uppercase" style="color: var(--el-color-primary);">
                        {{ t('workspace.sceneAbbr', 'Scene') }} {{ String(scene.index).padStart(2, '0') }} — {{ scene.heading || scene.location }}
                      </span>
                      <el-tag
                        :type="hasCaptions(scene.index) ? 'success' : 'info'"
                        size="small"
                        effect="plain"
                        round
                      >
                        {{ hasCaptions(scene.index) ? `✓ ${getSceneCues(scene.index).length} cues` : t('workspace.captionPending', 'Pending') }}
                      </el-tag>
                    </div>

                    <!-- Caption cues list -->
                    <div class="p-2.5 space-y-1">
                      <div
                        v-for="(cue, cIdx) in getSceneCues(scene.index)"
                        :key="cIdx"
                        class="p-1.5 rounded-lg border flex items-center justify-between text-[10px]"
                        style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color-lighter);"
                      >
                        <div class="flex items-center gap-2 min-w-0 flex-1">
                          <span class="shrink-0 font-mono text-[9px]" style="color: var(--el-text-color-secondary);">{{ cue.start_ms }}ms</span>
                          <span class="truncate font-medium" style="color: var(--el-text-color-primary);">{{ cue.text }}</span>
                        </div>
                      </div>

                      <div v-if="!hasCaptions(scene.index)" class="text-[10px] italic p-1" style="color: var(--el-text-color-placeholder);">
                        {{ scene.dialogue?.[0]?.character }}: {{ getSceneDialogueLine(scene, activeCapLang) }}
                      </div>
                    </div>
                  </div>
                </template>

                <div v-if="scenes.length === 0" class="p-4 text-center text-xs rounded-xl border border-dashed" style="color: var(--el-text-color-placeholder); border-color: var(--el-border-color);">
                  Load a script to manage caption tracks.
                </div>
              </div>
            </div>

            <!-- Style Presets (1-Click Apply) -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
                  {{ t('workspace.captionStylePresets', 'Caption Style Presets') }}
                </h3>
              </div>
              <div class="flex flex-wrap gap-2">
                <template v-for="style in styleOptions" :key="style.value">
                  <el-button class="!ml-0"
                    :type="selectedCaptionStyle === style.value ? 'primary' : 'default'" 
                    size="small" round 
                    @click="applyPreset(style.value as any)">
                    {{ style.label }}
                  </el-button>
                </template>
              </div>
              
        
            </div>

            <!-- Design Customization & Typography -->
            <div class="p-4 rounded-2xl border shadow-soft space-y-4" style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color);">
              <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
                {{ t('workspace.designCustomization', 'Design & Typography') }}
              </h3>

              <!-- Font Family Selector -->
              <div class="space-y-1.5">
                <label class="text-[10px] font-bold uppercase" style="color: var(--el-text-color-secondary);">
                  {{ t('workspace.fontFamily', 'Font Family') }}
                </label>
                <el-select
                  v-model="selectedFontFamily"
                  size="small"
                  class="w-full"
                  filterable
                  @change="applyStyleToTimeline"
                >
                  <el-option
                    v-for="group in GROUPED_FONTS"
                    :key="group.family"
                    :label="group.family"
                    :value="group.mainFont.postScriptName"
                  >
                    <div class="flex items-center justify-between w-full py-0.5">
                      <span>{{ group.family }}</span>
                      <span class="text-[10px] opacity-60">{{ group.styles.length }} styles</span>
                    </div>
                  </el-option>
                </el-select>
              </div>

              <!-- Font Size & Text Case -->
              <div class="grid grid-cols-1 gap-3 items-center">
                <div class="space-y-1.5">
                  <div class="flex justify-between text-[10px] font-bold uppercase" style="color: var(--el-text-color-secondary);">
                    <span>{{ t('workspace.fontSize', 'Font Size') }}</span>
                    <span style="color: var(--el-color-primary);">{{ captionFontSize }}px</span>
                  </div>
                  <el-slider v-model="captionFontSize" :min="20" :max="90" size="small" @input="applyStyleToTimeline" />
                </div>

                <div class="space-y-1.5 flex justify-between items-center">
                  <label class="text-[10px] font-bold uppercase block" style="color: var(--el-text-color-secondary);">
                    {{ t('workspace.textCase', 'Text Case') }}
                  </label>
                  <el-radio-group v-model="selectedTextCase" size="small" class="" @change="applyStyleToTimeline">
                    <el-radio-button label="none" value="none" class="flex-1 text-center">aA</el-radio-button>
                    <el-radio-button label="uppercase" value="uppercase" class="flex-1 text-center">AA</el-radio-button>
                    <el-radio-button label="lowercase" value="lowercase" class="flex-1 text-center">aa</el-radio-button>
                  </el-radio-group>
                </div>
              </div>

              <!-- Alignment & Words Per Line -->
              <div class="grid grid-cols-1 gap-3 items-center">
                <div class="space-y-1.5 flex justify-between items-center">
                  <label class="text-[10px] font-bold uppercase block" style="color: var(--el-text-color-secondary);">
                    Text Alignment
                  </label>
                  <el-radio-group v-model="selectedTextAlign" size="small" class="" @change="applyStyleToTimeline">
                    <el-radio-button value="left" class="flex-1 text-center">Left</el-radio-button>
                    <el-radio-button value="center" class="flex-1 text-center">Center</el-radio-button>
                    <el-radio-button value="right" class="flex-1 text-center">Right</el-radio-button>
                  </el-radio-group>
                </div>

                <div class="space-y-1.5 flex justify-between items-center">
                  <label class="text-[10px] font-bold uppercase block" style="color: var(--el-text-color-secondary);">
                    Words Per Line
                  </label>
                  <el-radio-group v-model="selectedWordsPerLine" size="small" class="" @change="applyStyleToTimeline">
                    <el-radio-button value="multiple" class="flex-1 text-center">Line</el-radio-button>
                    <el-radio-button value="single" class="flex-1 text-center">Pop (1-word)</el-radio-button>
                  </el-radio-group>
                </div>
              </div>

              <!-- Vertical Position Slot & Slider -->
              <div class="space-y-2">
                <div class="flex justify-between items-center text-[10px] font-bold uppercase" style="color: var(--el-text-color-secondary);">
                  <span>{{ t('workspace.verticalPosition', 'Vertical Position') }}</span>
                  <span style="color: var(--el-color-primary);">{{ captionVerticalPos }}%</span>
                </div>
                <div class="flex gap-1.5">
                  <el-button
                    size="small"
                    :type="selectedVerticalAlign === 'top' ? 'primary' : 'info'"
                    :plain="selectedVerticalAlign !== 'top'"
                    class="flex-1 !px-1 !ml-0"
                    @click="setVerticalSlot('top')"
                  >
                    ⬆ Top
                  </el-button>
                  <el-button
                    size="small"
                    :type="selectedVerticalAlign === 'center' ? 'primary' : 'info'"
                    :plain="selectedVerticalAlign !== 'center'"
                    class="flex-1 !px-1 !ml-0"
                    @click="setVerticalSlot('center')"
                  >
                    ↔ Center
                  </el-button>
                  <el-button
                    size="small"
                    :type="selectedVerticalAlign === 'bottom' ? 'primary' : 'info'"
                    :plain="selectedVerticalAlign !== 'bottom'"
                    class="flex-1 !px-1 !ml-0"
                    @click="setVerticalSlot('bottom')"
                  >
                    ⬇ Bottom
                  </el-button>
                </div>
                <el-slider v-model="captionVerticalPos" :min="10" :max="95" size="small" @input="handleVerticalSliderChange" />
              </div>

              <!-- Outline / Stroke Weight & Outline Color -->
              <div class="space-y-1.5">
                <div class="flex justify-between text-[10px] font-bold uppercase" style="color: var(--el-text-color-secondary);">
                  <span>{{ t('workspace.outlineWeight', 'Outline Weight') }}</span>
                  <span style="color: var(--el-color-primary);">{{ captionOutlineWeight }}px</span>
                </div>
                <div class="flex items-center gap-3">
                  <el-slider v-model="captionOutlineWeight" :min="0" :max="10" size="small" class="flex-1" @input="applyStyleToTimeline" />
                  <el-color-picker v-model="captionOutlineColor" size="small" @change="applyStyleToTimeline" />
                </div>
              </div>

              <!-- Colors: Text Color & Active Karaoke Highlight -->
              <div class="grid grid-cols-2 gap-3 pt-1 border-t" style="border-color: var(--el-border-color-lighter);">
                <div class="flex items-center justify-between p-2 rounded-xl border" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
                  <div class="flex flex-col">
                    <span class="text-[10px] font-bold uppercase" style="color: var(--el-text-color-secondary);">Text Color</span>
                    <span class="text-[9px] font-mono text-muted-foreground">{{ captionTextColor }}</span>
                  </div>
                  <el-color-picker v-model="captionTextColor" size="small" @change="applyStyleToTimeline" />
                </div>

                <div class="flex items-center justify-between p-2 rounded-xl border" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
                  <div class="flex flex-col">
                    <span class="text-[10px] font-bold uppercase" style="color: var(--el-text-color-secondary);">Active Word</span>
                    <span class="text-[9px] font-mono text-muted-foreground">{{ activeWordHighlightColor }}</span>
                  </div>
                  <el-color-picker v-model="activeWordHighlightColor" size="small" @change="applyStyleToTimeline" />
                </div>
              </div>

              <!-- Background Box Toggle -->
              <div class="flex items-center justify-between p-2 rounded-xl border" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
                <div class="flex flex-col">
                  <span class="text-[10px] font-bold uppercase" style="color: var(--el-text-color-primary);">Background Box</span>
                  <span class="text-[9px]" style="color: var(--el-text-color-secondary);">High-contrast backdrop for subtitles</span>
                </div>
                <div class="flex items-center gap-2">
                  <el-color-picker v-if="enableBackgroundBox" v-model="captionBgColor" size="small" show-alpha @change="applyStyleToTimeline" />
                  <el-switch v-model="enableBackgroundBox" size="small" @change="applyStyleToTimeline" />
                </div>
              </div>
            </div>

            <!-- Smart Word Animation Feature -->
            <div class="space-y-3">
              <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
                {{ t('workspace.smartFeatures', 'Smart AI Features') }}
              </h3>

              <div class="p-3.5 rounded-xl border flex items-center justify-between" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
                <div>
                  <p class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.aiHighlightAnimate', 'AI Word Zoom Animation') }}</p>
                  <p class="text-[10px]" style="color: var(--el-text-color-secondary);">{{ t('workspace.autoHighlightKeywords', 'Dynamically pops & zooms active spoken word in real-time') }}</p>
                </div>
                <el-switch v-model="aiHighlightAnimate" size="small" @change="applyStyleToTimeline" />
              </div>
            </div>

            <!-- Subtitle Calibration & Export Tools -->
            <div class="p-3.5 rounded-xl border space-y-3" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold" style="color: var(--el-text-color-primary);">Subtitle Sync Calibration</span>
                <span class="text-[10px]" style="color: var(--el-text-color-secondary);">Shift timing</span>
              </div>
              <div class="flex items-center gap-1.5">
                <el-button size="small" plain class="flex-1" @click="shiftAllCaptions(-500)">-500ms</el-button>
                <el-button size="small" plain class="flex-1" @click="shiftAllCaptions(-100)">-100ms</el-button>
                <el-button size="small" plain class="flex-1" @click="shiftAllCaptions(100)">+100ms</el-button>
                <el-button size="small" plain class="flex-1" @click="shiftAllCaptions(500)">+500ms</el-button>
              </div>

              <div class="pt-2 border-t flex justify-end" style="border-color: var(--el-border-color-lighter);">
                <el-button size="small" plain icon="Download" @click="handleExportSRT">
                  Export .SRT ({{ getLanguageByCode(code).nativeName }})
                </el-button>
              </div>
            </div>

            <!-- Apply to Timeline Button -->
            <!-- <el-button
              type="primary"
              round
              size="small"
              class="!w-full !font-bold !py-3"
              icon="ChatSquare"
              :loading="b6Step?.status === 'running'"
              @click="applyAllCaptions"
            >
              {{ t('workspace.applyToTimeline', 'Apply Style & Sync to Timeline') }}
            </el-button> -->
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

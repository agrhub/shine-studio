<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
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
import http from '@/utils/http';

const { t } = useI18n();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();

onMounted(() => {
  pipelineStore.fetchVoicePresets();
});

// Voice global settings
const selectedVoicePreset = ref('Puck');
const voiceIntensity = ref(85);
const voicePacing = ref(1.1);
const autoDucking = ref(true);
const sceneScorePrompt = ref('');

const isPlayingSample = ref(false);
let voiceAudioPlayer: HTMLAudioElement | null = null;

// Track which audio clip is currently previewing (e.g. 'vo_1', 'bgm_1', etc.)
const currentlyPlayingId = ref<string | null>(null);
let globalAudioPlayer: HTMLAudioElement | null = null;

function togglePlayAudio(url: string | undefined, id: string) {
  if (!url) return;
  if (currentlyPlayingId.value === id && globalAudioPlayer) {
    globalAudioPlayer.pause();
    currentlyPlayingId.value = null;
    return;
  }

  if (globalAudioPlayer) {
    globalAudioPlayer.pause();
  }

  globalAudioPlayer = new Audio(url);
  currentlyPlayingId.value = id;
  globalAudioPlayer.play().catch(() => {
    toast.error(t('toast.audioPlaybackError', 'Unable to play audio stream'));
    currentlyPlayingId.value = null;
  });
  globalAudioPlayer.onended = () => {
    currentlyPlayingId.value = null;
  };
  globalAudioPlayer.onerror = () => {
    currentlyPlayingId.value = null;
  };
}

onUnmounted(() => {
  if (globalAudioPlayer) {
    globalAudioPlayer.pause();
    globalAudioPlayer = null;
  }
  if (voiceAudioPlayer) {
    voiceAudioPlayer.pause();
    voiceAudioPlayer = null;
  }
});

function playVoiceSample(voiceId: string) {
  if (voiceAudioPlayer) {
    voiceAudioPlayer.pause();
  }
  const matched = pipelineStore.voicePresets.find(v => v.id === voiceId);
  const sampleUrl = matched?.audio_sample_url || `https://gstatic.com/aistudio/voices/samples/${voiceId}.wav`;
  voiceAudioPlayer = new Audio(sampleUrl);
  isPlayingSample.value = true;
  voiceAudioPlayer.play().catch(() => {
    toast.info(t('toast.voicePreview', { voice: voiceId }));
    isPlayingSample.value = false;
  });
  voiceAudioPlayer.onended = () => {
    isPlayingSample.value = false;
  };
}

const characters = computed(() => seriesStore.charactersList);
const scenes = computed(() => seriesStore.activeScript?.scenes || seriesStore.activeEpisode?.scenes || []);

const b4Step = computed(() => pipelineStore.pipelineSteps.find(s => s.id === 'b4'));
const b5Step = computed(() => pipelineStore.pipelineSteps.find(s => s.id === 'b5'));

// Main language matching series target market
const mainTargetLang = computed<GeminiSpeechLanguage>(() => {
  return getLanguageByCode(seriesStore.currentSeries?.language || 'en-US');
});

// Selected active language track
const activeVoiceLang = ref<string>(mainTargetLang.value?.code);
// Multi-select languages for batch voiceover generation
const selectedBatchLangs = ref<string[]>([]);
const isBatchMode = ref(false);
const selectedLangToAdd = ref<string>('');
const isEnableDubbing = ref(false);

// Visible language tabs
const activeTrackCodes = computed(() => seriesStore.dubbingLanguages);

// Dubbing settings hydration from active episode
watch(() => seriesStore.activeEpisode?.dubbing_settings, (settings) => {
  if (settings) {
    if (settings?.enable_dubbing !== undefined) isEnableDubbing.value = settings.enable_dubbing;
    if (settings?.auto_ducking !== undefined) autoDucking.value = settings.auto_ducking;
    if (settings?.voice_preset) selectedVoicePreset.value = settings.voice_preset;
    if (settings?.voice_intensity !== undefined) voiceIntensity.value = settings.voice_intensity;
    if (settings?.voice_pacing !== undefined) voicePacing.value = settings.voice_pacing;
  }
}, { immediate: true, deep: true });

function persistDubbingSettings() {
  const epId = seriesStore.activeEpisodeId;
  const sId = seriesStore.currentSeries?.id;
  if (!epId) return;
  seriesStore.updateEpisodeDubbingSettings(epId, {
    enable_dubbing: isEnableDubbing.value,
    auto_ducking: autoDucking.value,
    voice_preset: selectedVoicePreset.value,
    voice_intensity: voiceIntensity.value,
    voice_pacing: voicePacing.value,
  });
  if (sId) seriesStore.saveEpisodeScenes(sId, epId);
}

watch([isEnableDubbing, autoDucking, selectedVoicePreset, voiceIntensity, voicePacing], () => {
  persistDubbingSettings();
});

// Auto-sync main language when active series changes
watch(mainTargetLang, (newMain) => {
  if (newMain) {
    if (seriesStore.dubbingLanguages.length <= 1) {
      seriesStore.setDubbingLanguages([newMain.code]);
    } else if (!seriesStore.dubbingLanguages.includes(newMain.code)) {
      seriesStore.addDubbingLanguage(newMain.code);
    }
    activeVoiceLang.value = newMain.code;
  }
}, { immediate: true });

const isDubbingLoading = ref(false);

function getSceneDialogueList(scene: any, langCode: string) {
  if (!langCode || langCode === mainTargetLang.value?.code) {
    return Array.isArray(scene.dialogue) ? scene.dialogue : [{ character: scene.character || 'Character', line: scene.dialogue || '' }];
  }
  const trans = scene.translations?.[langCode];
  if (trans) {
    if (Array.isArray(trans.dialogue) && trans.dialogue.length > 0) {
      return trans.dialogue;
    }
    if (typeof trans.translated_dialogue === 'string' && trans.translated_dialogue.trim()) {
      const speaker = (Array.isArray(scene.dialogue) && scene.dialogue[0]?.character) || scene.character || 'Character';
      return [{ character: speaker, line: trans.translated_dialogue }];
    }
    if (typeof trans.dialogue === 'string' && trans.dialogue.trim()) {
      const speaker = (Array.isArray(scene.dialogue) && scene.dialogue[0]?.character) || scene.character || 'Character';
      return [{ character: speaker, line: trans.dialogue }];
    }
    if (Array.isArray(trans.captions_data) && trans.captions_data.length > 0) {
      const speaker = (Array.isArray(scene.dialogue) && scene.dialogue[0]?.character) || scene.character || 'Character';
      return [{ character: speaker, line: trans.captions_data.map((c: any) => c.text).join(' ') }];
    }
  }

  const epId = seriesStore.activeEpisodeId;
  const translated = epId ? seriesStore.getLanguageTrackDialogue(epId, langCode, scene.index) : null;
  if (translated) {
    const speaker = scene.dialogue?.[0]?.character || 'Character';
    return [{ character: speaker, line: translated }];
  }
  const tracks = epId ? seriesStore.getLanguageTracks(epId) : [];
  const track = tracks.find(t => t.language_code === langCode);
  const cues = track?.scene_captions?.[scene.index];
  if (cues && cues.length > 0) {
    const speaker = scene.dialogue?.[0]?.character || 'Character';
    return [{ character: speaker, line: cues.map((c: any) => c.text).join(' ') }];
  }
  return Array.isArray(scene.dialogue) ? scene.dialogue : [{ character: scene.character || 'Character', line: scene.dialogue || '' }];
}

async function handleTranslateAndDubLanguage(targetLang: string) {
  const epId = seriesStore.activeEpisodeId;
  const seriesId = seriesStore.currentSeries?.id;
  if (!epId || !seriesId || !targetLang) return;

  isDubbingLoading.value = true;
  try {
    toast.info(t('toast.dubbingStarted'));
    const scenes = seriesStore.activeEpisode?.scenes || [];

    // 1. Translate dialogue to target language if not main language
    if (targetLang !== mainTargetLang.value.code) {
      await http.post('/captions/batch-translate', {
        series_id: seriesId,
        episode_id: epId,
        target_language: targetLang,
        scenes,
      });
    }

    // 2. Generate TTS Audio & Word-Level Captions on the backend (Single Source of Truth)
    await http.post('/captions/batch-dubbing', {
      series_id: seriesId,
      episode_id: epId,
      target_language: targetLang,
      scenes,
    });

    // 3. Reload authoritative episode data & timeline from backend
    await seriesStore.loadEpisodeScript(seriesId, epId);
    seriesStore.syncVoiceoverTrackToTimeline(epId, targetLang);
    seriesStore.syncCaptionTrackToTimeline(epId, targetLang);
    toast.success(t('toast.dubbingSuccess'));
  } catch (err: any) {
    toast.error(t('toast.dubbingFailed'));
  } finally {
    isDubbingLoading.value = false;
  }
}

function handleAddLanguage(code: string) {
  if (!code) return;
  seriesStore.addDubbingLanguage(code);
  activeVoiceLang.value = code;
  seriesStore.setPreviewVoiceLanguage(code);
  selectedLangToAdd.value = '';
  if (isEnableDubbing.value) {
    handleTranslateAndDubLanguage(code);
  }
}

function getRenderedLangs(sceneIndex: number): string[] {
  const epId = seriesStore.activeEpisodeId;
  if (!epId) return [];
  const tracks = seriesStore.getLanguageTracks(epId);
  return tracks
    .filter(t => !!t.scene_voiceovers[sceneIndex])
    .map(t => getLanguageByCode(t.language_code).flag || t.language_code);
}

function getSceneStatus(sceneIndex: number) {
  return pipelineStore.getSceneStatus(sceneIndex);
}

function getSceneVoiceoverUrl(sceneIndex: number): string {
  const epId = seriesStore.activeEpisodeId;
  if (epId) {
    const tracks = seriesStore.getLanguageTracks(epId);
    const track = tracks.find(t => t.language_code === activeVoiceLang.value);
    if (track?.scene_voiceovers?.[sceneIndex]) {
      return track.scene_voiceovers[sceneIndex];
    }
  }
  return getSceneStatus(sceneIndex).voiceover_url || '';
}

function isSceneVoiceoverRendered(sceneIndex: number): boolean {
  return !!getSceneVoiceoverUrl(sceneIndex);
}

function isSceneAudioLocked(sceneIndex: number): boolean {
  return !!(
    getSceneStatus(sceneIndex).voiceover_status === 'running' ||
    (getSceneStatus(sceneIndex) as any).voiceoverStatus === 'running' ||
    pipelineStore.isItemRendering(`Scene #${sceneIndex}`) ||
    pipelineStore.isItemRendering(`Scene ${sceneIndex}`) ||
    pipelineStore.isItemRendering(sceneIndex)
  );
}

async function renderSceneVoiceover(scene: any) {
  if (!scene.dialogue || scene.dialogue.length === 0) {
    toast.warning(t('toast.noDialogueInScene'));
    return;
  }
  try {
    toast.info(t('toast.renderingVoiceoverScene'));
    const firstSpeakerName = scene.dialogue[0]?.character;
    const matchedChar = characters.value.find(c => c.name.toLowerCase() === (firstSpeakerName || '').toLowerCase());
    const voiceToUse = matchedChar?.voice_id || (matchedChar as any)?.voiceId || selectedVoicePreset.value;

    await pipelineStore.renderSceneVoiceover(
      scene.index,
      scene.dialogue,
      voiceToUse,
      voiceIntensity.value,
      voicePacing.value,
      activeVoiceLang.value,  // pass selected language track
    );
    toast.success(t('toast.voiceoverQueued'));
  } catch {
    toast.error(t('toast.voiceoverRenderFailed'));
  }
}

async function renderAllVoiceovers() {
  const langs = isBatchMode.value && selectedBatchLangs.value.length > 0
    ? selectedBatchLangs.value
    : [activeVoiceLang.value];

  for (const lang of langs) {
    try {
      toast.info(t('toast.renderingAllVoiceovers', { lang }));
      await pipelineStore.renderAllVoiceovers(
        selectedVoicePreset.value,
        voiceIntensity.value,
        voicePacing.value,
        lang,
      );
      toast.success(t('toast.b4TtsSynced'));
    } catch {
      toast.error(t('toast.batchVoiceoverFailed'));
    }
  }
}

// async function renderSceneBgm(scene: any) {
//   try {
//     toast.info(t('toast.renderingBgmScene'));
//     await pipelineStore.renderSceneBgm(
//       scene.index,
//       scene.bgm_mood || scene.bgmMood || 'dramatic cinematic suspense',
//       scene.duration_seconds || scene.durationSeconds || 15
//     );
//     toast.success(t('toast.bgmQueued'));
//   } catch {
//     toast.error(t('toast.bgmRenderFailed'));
//   }
// }

function handleRemoveLanguage(lang: TabPaneName){
  if (seriesStore.dubbingLanguages.length === 1) {
    return;
  }
  seriesStore.removeDubbingLanguage(lang as string);
  if (activeVoiceLang.value === lang) {
    activeVoiceLang.value = seriesStore.dubbingLanguages[0];
  }
};
</script>

<template>
  <div class="space-y-6">

    <!-- Character Cast Voice Mapping -->
    <div class="border rounded-2xl p-4 shadow-soft" style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color);">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2" style="color: var(--el-color-primary);">
          <el-icon :size="14"><User /></el-icon>
          <h3 class="text-xs font-bold uppercase tracking-wider">{{ t('workspace.characterVoices') }}</h3>
        </div>
        <span class="text-[10px]" style="color: var(--el-text-color-secondary);">
          {{ characters.length }} {{ t('workspace.assigned') }}
        </span>
      </div>

      <div class="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
        <div
          v-for="char in characters"
          :key="char.id"
          class="flex flex-col items-center gap-2.5 p-2 rounded-xl border transition-colors"
          style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);"
        >
          <el-avatar
            :size="48"
            :src="char.avatar || ''"
            class="shrink-0"
            style="background-color: var(--el-fill-color-dark);"
          >
            <el-icon :size="16"><User /></el-icon>
          </el-avatar>
          <div class="flex flex-col items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-xs font-bold truncate" style="color: var(--el-text-color-primary);">{{ char.name }}</p>
              <p class="text-[10px] truncate" style="color: var(--el-text-color-secondary);">{{ char.role }}</p>
            </div>

            <el-tag size="small" type="success" round effect="plain" class="!text-[9px] !font-bold !rounded-md w-fit">
              🎙 {{ char.voice_id || 'Puck' }}
            </el-tag>
            <el-tag v-if="char.gender" size="small" round effect="plain" class="!text-[9px] !rounded-md w-fit">
              {{ char.gender === 'female' ? `♀ ${t('workspace.female')}` : char.gender === 'male' ? `♂ ${t('workspace.male')}` : t('workspace.neutral') }}
            </el-tag>
          </div>
        </div>

        <div v-if="characters.length === 0" class="col-span-2 p-4 text-center text-xs rounded-xl border border-dashed" style="color: var(--el-text-color-placeholder); border-color: var(--el-border-color);">
          {{ t('workspace.noCharacters') }}
        </div>
      </div>
    </div>

    <!-- Dubbing Engine Card -->
    <div class="space-y-3">
      <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
        {{ t('workspace.dubbingEngine', 'Dubbing Engine') }}
      </h3>

      <div class="p-3.5 rounded-xl border flex items-center justify-between" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
        <div>
          <p class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.aiAutoDubbing', 'AI Auto Dubbing') }}</p>
          <p class="text-[10px]" style="color: var(--el-text-color-secondary);">{{ t('workspace.autoGenerateEpisodeDubbing', 'Auto generate episode dubbing') }}</p>
        </div>
        <el-badge value="" class="item">
          <el-switch v-model="isEnableDubbing" :disabled="true" size="small" />
        </el-badge>
      </div>

      <div v-if="isEnableDubbing" class="p-3.5 rounded-xl border flex items-center justify-between" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
        <div class="flex items-center gap-3">
          <el-icon style="color: var(--el-text-color-secondary);"><Headset /></el-icon>
          <span class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.autoDucking') }}</span>
        </div>
        <el-switch v-model="autoDucking" size="small" />
      </div>
    </div>
    <template v-if="isEnableDubbing">
      <!-- Language tabs -->
      <div class="space-y-3">
        <div class="flex flex-row p-3.5 gap-2 rounded-xl border flex items-center justify-between" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
          <div>
            <p class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.dubbingLanguages', 'Dubbing Languages') }}</p>
            <p class="text-[10px]" style="color: var(--el-text-color-secondary);">{{ t('workspace.episodeDubbingDescription', 'Add languages for episode dubbing') }}</p>
          </div>
          <!-- Add Language Dropdown from Gemini 48+ Catalog -->
          <el-select
            v-model="selectedLangToAdd"
            size="small"
            filterable
            :placeholder="`+ ${t('workspace.languages', 'Languages')}`"
            class="!w-20"
            @change="handleAddLanguage"
          >
            <el-option
              v-for="l in GEMINI_SPEECH_LANGUAGES"
              :key="l.code"
              :value="l.code"
              :label="`${l.flag} ${l.nativeName} (${l.region})`"
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
    </template>

    <el-tabs
      v-model="activeVoiceLang"
      type="card"
      size="small"
      @tab-remove="handleRemoveLanguage"
    >
      <el-tab-pane
        v-for="code in activeTrackCodes"
        :key="code" :closable="code !== mainTargetLang.code"
        :name="code"
      >
        <template #label>
          <span class="custom-tabs-label">
            <CountryFlag :code="getLanguageByCode(code).countryCode" :flag="getLanguageByCode(code).flag" size="small" />
            <span>{{  getLanguageByCode(code).nativeName  }}</span>
          </span>
        </template>
        <div class="flex flex-col gap-3 px-3">
          <!-- Auto-Dub Banner for Non-Main Language Tracks -->
          <div
            v-if="code !== mainTargetLang.code"
            class="p-3 rounded-xl border flex items-center justify-between bg-emerald-500/5 border-emerald-500/20 mb-1"
          >
            <div class="flex flex-col gap-0.5">
              <p class="text-xs font-bold text-emerald-500 flex items-center gap-1">
                🎙 {{ t('workspace.autoDubTo', `Auto-Dub to ${getLanguageByCode(code).nativeName}`) }}
              </p>
              <p class="text-[10px]" style="color: var(--el-text-color-secondary);">
                {{ t('workspace.dubFromMainDesc', `Translate dialogue and generate neural TTS voiceovers for ${getLanguageByCode(code).nativeName}`) }}
              </p>
            </div>
            <el-button
              type="success"
              size="small"
              round
              :loading="isDubbingLoading"
              icon="Microphone"
              @click="handleTranslateAndDubLanguage(code)"
            >
              {{ isDubbingLoading ? t('workspace.generating', 'Generating...') : t('workspace.dubNow', 'Dub Now') }}
            </el-button>
          </div>

          <!-- Voiceover Tracks Per Scene -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
                {{ t('workspace.voiceoverPerScene') }}
              </h3>
              <el-button link type="primary" size="small" icon="MagicStick" @click="renderAllVoiceovers">
                {{ t('workspace.autofill', 'Autofill') }}
              </el-button>
            </div>
          </div>
          <!-- Scene Voiceovers Section -->
          <div>
            <div class="space-y-3">
              <template v-for="scene in scenes"
                :key="`vo_${scene.index}`">
                <div
                  v-if="scene.dialogue && scene.dialogue.length > 0"
                  class="rounded-xl border overflow-hidden"
                  style="border-color: var(--el-border-color-light); background-color: var(--el-fill-color-light);"
                >
                  <!-- Scene Header -->
                  <div class="p-2.5 flex justify-between items-center border-b" style="border-color: var(--el-border-color-lighter);">
                    <span class="text-[10px] font-bold uppercase" style="color: var(--el-color-primary);">
                      {{ t('workspace.sceneAbbr') }} {{ String(scene.index).padStart(2, '0') }} — {{ scene.heading || scene.location }}
                    </span>
                    <!-- <div class="flex items-center gap-1.5 flex-wrap"> -->
                      <!-- Language badges: flags for each lang already rendered -->
                      <!-- <span
                        v-for="flag in getRenderedLangs(scene.index)"
                        :key="flag"
                        class="text-sm" title="Voiceover rendered"
                      >{{ flag }}</span>
                      <el-tag
                        :type="isSceneVoiceoverRendered(scene.index) ? 'success' : getSceneStatus(scene.index).voiceoverStatus === 'running' ? 'warning' : 'info'"
                        size="small"
                        effect="plain"
                      >
                        <el-icon v-if="getSceneStatus(scene.index).voiceoverStatus === 'running'"><Loading /></el-icon>
                        {{ getSceneStatus(scene.index).voiceoverStatus === 'running' ? 'running' : (isSceneVoiceoverRendered(scene.index) ? 'done' : 'idle') }}
                      </el-tag> -->
                    <!-- </div> -->
                  </div>

                  <!-- Dialogue Preview -->
                  <div v-if="getSceneDialogueList(scene, code).length" class="p-2.5 space-y-1">
                    <div
                      v-for="(dlg, dIdx) in getSceneDialogueList(scene, code)"
                      :key="dIdx"
                      class="flex items-start gap-2 text-[10px]"
                    >
                      <span class="font-bold shrink-0" style="color: var(--el-color-primary);">{{ dlg.character }}:</span>
                      <span class="truncate" style="color: var(--el-text-color-secondary);">{{ dlg.line }}</span>
                    </div>
                  </div>

                  <!-- Voiceover action bar: audio preview button & render button -->
                  <div class="flex justify-end items-center gap-2 p-2 bg-[var(--el-bg-color-overlay)]/40 border-t border-[var(--el-border-color-lighter)] rounded-b-xl">
                    <!-- Voiceover Audio Preview Button -->
                    <el-button
                      v-if="getSceneVoiceoverUrl(scene.index)"
                      size="small"
                      round
                      :type="currentlyPlayingId === `vo_${scene.index}` ? 'success' : ''"
                      :plain="currentlyPlayingId !== `vo_${scene.index}`"
                      @click="togglePlayAudio(getSceneVoiceoverUrl(scene.index), `vo_${scene.index}`)"
                    >
                      <el-icon class="mr-1">
                        <VideoPause v-if="currentlyPlayingId === `vo_${scene.index}`" />
                        <VideoPlay v-else />
                      </el-icon>
                      {{ currentlyPlayingId === `vo_${scene.index}` ? t('workspace.pause', 'Pause') : t('workspace.previewVoice', 'Preview Voice') }}
                    </el-button>

                    <!-- Render Button -->
                    <el-button
                      size="small"
                      round
                      icon="MagicStick"
                      plain
                      :loading="isSceneAudioLocked(scene.index)"
                      :disabled="isSceneAudioLocked(scene.index)"
                      @click="renderSceneVoiceover(scene)"
                    >
                      {{ isSceneAudioLocked(scene.index) ? 'Rendering...' : (isSceneVoiceoverRendered(scene.index) ? t('workspace.rerender', 'Re-render') : t('workspace.render', 'Render')) }}
                    </el-button>
                  </div>
                </div>
              </template>

              <div v-if="scenes.length === 0" class="p-4 text-center text-xs rounded-xl border border-dashed" style="color: var(--el-text-color-placeholder); border-color: var(--el-border-color);">
                Load a script to see scene voiceovers.
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Scene BGM Section -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
          {{ t('workspace.bgmPerScene') }}
        </h3>
        <!-- Pipeline B5 sync -->
        <!-- <el-tag
          v-if="b5Step"
          :type="b5Step.status === 'done' ? 'success' : b5Step.status === 'running' ? 'warning' : b5Step.status === 'error' ? 'danger' : 'info'"
          size="small"
          effect="plain"
          round
        >
          B5: {{ b5Step.status }}
        </el-tag> -->
      </div>

      <div class="space-y-2">
        <template v-for="scene in scenes"
          :key="`bgm_${scene.index}`">
          <div v-if="scene.dialogue && scene.dialogue.length > 0"
            class="p-3 rounded-xl border flex items-center gap-3"
            style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);"
          >
            <el-icon style="color: var(--el-text-color-secondary);"><Headset /></el-icon>
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-bold" style="color: var(--el-text-color-primary);">{{ t('workspace.sceneAbbr') }} {{ String(scene.index).padStart(2, '0') }}</p>
              <p class="text-[9px] truncate" style="color: var(--el-text-color-secondary);">{{ scene.bgm_mood || (scene as any).bgmMood || 'No BGM mood set' }}</p>
            </div>
            <div class="flex items-center gap-1.5">
              <!-- Music Preview Button -->
              <el-button
                v-if="scene.bgm_url || (scene as any).bgmUrl || getSceneStatus(scene.index).bgm_url || (getSceneStatus(scene.index) as any).bgmUrl"
                size="small"
                circle
                :type="currentlyPlayingId === `bgm_${scene.index}` ? 'success' : ''"
                :plain="currentlyPlayingId !== `bgm_${scene.index}`"
                :title="currentlyPlayingId === `bgm_${scene.index}` ? 'Pause Music' : 'Preview Music'"
                @click="togglePlayAudio(scene.bgm_url || (scene as any).bgmUrl || getSceneStatus(scene.index).bgm_url || (getSceneStatus(scene.index) as any).bgmUrl, `bgm_${scene.index}`)"
              >
                <el-icon>
                  <VideoPause v-if="currentlyPlayingId === `bgm_${scene.index}`" />
                  <VideoPlay v-else />
                </el-icon>
              </el-button>

              <el-tag
                :type="getSceneStatus(scene.index).bgm_status === 'done' || (getSceneStatus(scene.index) as any).bgmStatus === 'done' || scene.bgm_url || (scene as any).bgmUrl ? 'success' : getSceneStatus(scene.index).bgm_status === 'running' || (getSceneStatus(scene.index) as any).bgmStatus === 'running' ? 'warning' : 'info'"
                size="small"
                effect="plain"
              >
                <el-icon v-if="getSceneStatus(scene.index).bgm_status === 'running' || (getSceneStatus(scene.index) as any).bgmStatus === 'running'"><Loading /></el-icon>
                {{ getSceneStatus(scene.index).bgm_status === 'running' || (getSceneStatus(scene.index) as any).bgmStatus === 'running' ? 'running' : (scene.bgm_url || (scene as any).bgmUrl || getSceneStatus(scene.index).bgm_status === 'done' ? 'done' : 'idle') }}
              </el-tag>
              <!-- <el-button
                size="small"
                round
                icon="MagicStick"
                :loading="getSceneStatus(scene.index).bgmStatus === 'running'"
                @click="renderSceneBgm(scene)"
              >
                {{ scene.bgmUrl || getSceneStatus(scene.index).bgmStatus === 'done' ? t('workspace.rerender', 'Re-render') : t('workspace.renderBgm', 'Render BGM') }}
              </el-button> -->
            </div>
          </div>
        </template>

        <div v-if="scenes.length === 0" class="p-4 text-center text-xs rounded-xl border border-dashed" style="color: var(--el-text-color-placeholder); border-color: var(--el-border-color);">
          Load a script to configure scene BGM.
        </div>
      </div>
    </div>

    <!-- AI Music & Ambience Generator -->
    <!-- <div class="flex flex-col gap-4">
      <h3 class="text-xs font-bold uppercase tracking-wider" style="color: var(--el-text-color-secondary);">
        {{ t('workspace.aiMusicAmbience') }}
      </h3>

      <div class="p-3.5 rounded-xl border flex items-center justify-between" style="background-color: var(--el-fill-color-light); border-color: var(--el-border-color-light);">
        <div class="flex items-center gap-3">
          <el-icon style="color: var(--el-text-color-secondary);"><Headset /></el-icon>
          <span class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.autoDucking') }}</span>
        </div>
        <el-switch v-model="autoDucking" size="small" />
      </div>
    </div> -->
  </div>
</template>

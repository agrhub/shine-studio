<template>
  <Transition name="fade">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      @click.self="close"
    >
      <div
        class="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-neutral-900 border border-neutral-700/60 rounded-2xl shadow-2xl overflow-hidden text-neutral-100"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/90">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <el-icon :size="24"><MagicStick /></el-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold tracking-wide text-white">{{ displayTitle }}</h3>
                <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 capitalize">
                  {{ assetTypeLabel }}
                </span>
              </div>
              <p class="text-xs text-neutral-400 mt-0.5 truncate max-w-xl">
                {{ displaySubtitle }}
              </p>
            </div>
          </div>
          <el-button circle plain bg
            @click="close"
            icon="Close"
            :title="t('common.close', 'Close')"/>
        </div>

        <!-- Storyboard 3-Item Switcher (Start Frame / End Frame / Video) -->
        <div
          v-if="assetType === 'scene_frame'"
          class="px-6 py-3 bg-neutral-950/90 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2.5">
            <span class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              {{ t('workspace.storyboardAsset', 'Storyboard Asset:') }}
            </span>
            <div class="inline-flex rounded-xl bg-neutral-900 p-1 border border-neutral-800 shadow-inner">
              <el-button
                icon="Picture" text round
                :type="activeSceneSubAsset === 'start_frame' ? 'primary' : 'default'"
                @click="switchSceneSubAsset('start_frame')"
                class="px-3.5 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer border-0 bg-transparent"
              >
                <span>{{ t('workspace.startFrame', 'Start Frame') }}</span>
              </el-button>

              <el-button
                icon="PictureFilled" text round
                :type="activeSceneSubAsset === 'end_frame' ? 'primary' : 'default'"
                @click="switchSceneSubAsset('end_frame')"
                :class="activeSceneSubAsset === 'end_frame' ? 'bg-emerald-600 text-white shadow font-semibold' : 'text-neutral-400 hover:text-white'"
              >
                <span>{{ t('workspace.endFrame', 'End Frame') }}</span>
              </el-button>

              <el-button
                icon="VideoCamera" text round
                :type="activeSceneSubAsset === 'video' ? 'primary' : 'default'"
                @click="switchSceneSubAsset('video')"
                :class="activeSceneSubAsset === 'video' ? 'bg-emerald-600 text-white shadow font-semibold' : 'text-neutral-400 hover:text-white'"
              >
                <span>{{ t('workspace.sceneVideo', 'Video Clip') }}</span>
              </el-button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 flex items-center gap-1">
              <span v-if="activeSceneSubAsset === 'start_frame'">🎬 Keyframe 00:00</span>
              <span v-else-if="activeSceneSubAsset === 'end_frame'">🏁 Ending Transition Keyframe</span>
              <span v-else>🎥 Motion Clip ({{ videoDuration }}s)</span>
            </span>
          </div>
        </div>

        <!-- Character Sub-Asset Switcher (Avatar / Wardrobe Variants) -->
        <div
          v-if="(assetType === 'character' || assetType === 'wardrobe' || characterData) && (currentChar?.wardrobe_variants && currentChar?.wardrobe_variants?.length > 0 || currentChar?.avatar)"
          class="px-6 py-3 bg-neutral-950/90 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2.5">
            <span class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              {{ t('workspace.characterAssetItem', 'Character Item:') }}
            </span>
            <div class="inline-flex rounded-xl bg-neutral-900 p-1 border border-neutral-800 shadow-inner flex-wrap gap-1">
              <!-- Avatar button -->
              <el-button
                icon="User" text round
                :type="activeCharSubAsset === 'avatar' ? 'primary' : 'default'"
                @click="switchCharSubAsset('avatar')"
              >
                <span>{{ t('workspace.avatarPortrait', 'Avatar / Face') }}</span>
              </el-button>

              <!-- Wardrobe variant buttons -->
              <el-button
                v-for="wv in (currentChar?.wardrobe_variants || [])"
                :key="wv.variant_id"
                icon="Goods" text round
                :type="activeCharSubAsset === (wv.variant_id) ? 'primary' : 'default'"
                @click="switchCharSubAsset(wv.variant_id)"
              >
                <span>{{ wv.name }}</span>
              </el-button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 flex items-center gap-1">
              <span v-if="activeCharSubAsset === 'avatar'">👤 Facial Identity Anchor</span>
              <span v-else>👔 16:9 Wardrobe Lookbook</span>
            </span>
          </div>
        </div>

        <!-- Body Grid -->
        <div class="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Left Column: Current Preview & Version History -->
          <div class="lg:col-span-6 flex flex-col gap-5">
            <!-- Active Image / Video Preview -->
            <div class="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 flex flex-col items-center">
              <div class="w-full flex items-center justify-between mb-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {{ t('workspace.activeVersion', 'Active Version') }}
                </span>
                <span v-if="activeVersion" class="text-xs text-neutral-500">
                  {{ formatDate(activeVersion.created_at) }}
                </span>
              </div>

              <div class="relative w-full aspect-[4/3] max-h-[340px] rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800/80 flex items-center justify-center">
                <video
                  v-if="activeSceneSubAsset === 'video' && assetType === 'scene_frame' && currentActiveImageUrl"
                  :key="currentActiveImageUrl"
                  :src="currentActiveImageUrl"
                  controls
                  autoplay
                  loop
                  playsinline
                  class="w-full h-full object-contain bg-black"
                />
                <el-image
                  v-else-if="currentActiveImageUrl"
                  :src="currentActiveImageUrl"
                  alt="Asset Preview"
                  class="w-full h-full" fit="scale-down"
                />
                <div v-else class="flex flex-col items-center text-neutral-500 gap-2">
                  <el-icon :size="32">
                    <VideoCamera v-if="assetType === 'scene_frame' && activeSceneSubAsset === 'video'" />
                    <User v-else-if="assetType === 'character' || (currentChar && activeCharSubAsset === 'avatar')" />
                    <Picture v-else />
                  </el-icon>
                  <span class="text-xs">
                    {{ assetType === 'scene_frame' && activeSceneSubAsset === 'video' ? t('workspace.noVideoYet', 'No video clip rendered yet') : (assetType === 'scene_frame' && activeSceneSubAsset === 'end_frame' ? t('workspace.noEndFrameYet', 'No end frame rendered yet') : t('workspace.noRenderYet', 'No render yet')) }}
                  </span>
                </div>
              </div>

              <!-- Active Prompt Inspect Banner -->
              <div v-if="currentActivePrompt" class="w-full mt-3 p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs">
                <div class="flex items-center justify-between text-neutral-400 font-medium mb-1">
                  <span>{{ t('workspace.promptLabel', 'Generation Prompt:') }}</span>
                  <el-button size="small" round text bg icon="CopyDocument"
                    @click="copyText(currentActivePrompt)"
                  >
                    <span>{{ copiedPrompt ? t('common.copied', 'Copied!') : t('common.copy', 'Copy') }}</span>
                  </el-button>
                </div>
                <div class="text-neutral-300 max-h-20 overflow-y-auto text-[11px] leading-relaxed select-text font-mono bg-black/30 p-2 rounded">
                  {{ currentActivePrompt }}
                </div>
              </div>
            </div>

            <!-- Version History Gallery -->
            <div class="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                    {{ t('workspace.versionHistory', 'Version History') }}
                  </span>
                  <span class="px-1.5 py-0.2 text-[11px] rounded-full bg-neutral-800 text-neutral-400">
                    {{ assetVersions.length }}
                  </span>
                </div>
              </div>

              <div v-if="assetVersions.length === 0" class="text-center py-6 text-xs text-neutral-500">
                {{ t('workspace.noVersionsYet', 'No versions created yet. Generate the first version using the custom prompt form on the right.') }}
              </div>

              <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-56 overflow-y-auto pr-1">
                <div
                  v-for="(ver, idx) in assetVersions"
                  :key="ver.id || idx"
                  class="group relative rounded-lg border overflow-hidden transition-all bg-neutral-900 flex flex-col"
                  :class="isVersionActive(ver) ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-neutral-800 hover:border-neutral-700'"
                >
                  <div class="aspect-[1/1] w-full bg-black/40 relative overflow-hidden flex items-center justify-center">
                    <video
                      v-if="assetType === 'scene_frame' && activeSceneSubAsset === 'video' && ver.image_url"
                      :src="ver.image_url"
                      class="w-full h-full object-cover pointer-events-none"
                    />
                    <el-image v-else :src="ver.image_url" alt="Version thumbnail" class="w-full h-full" fit="cover" />
                    
                    <span
                      v-if="isVersionActive(ver)"
                      class="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500 text-black shadow-sm z-10"
                    >
                      {{ t('workspace.active', 'Active') }}
                    </span>

                    <el-button
                      v-else round plain bg
                      class="absolute inset-0 opacity-0 group-hover:opacity-100 z-10"
                      :disabled="isSelectingVersion"
                      @click="handleSelectVersion(ver.id)"
                    >
                      <span>{{ t('workspace.apply', 'Apply') }}</span>
                    </el-button>
                  </div>

                  <div class="absolute bottom-0 left-0 w-full p-2 flex items-center justify-between text-[10px] text-neutral-400 bg-neutral-950/80 z-10">
                    <span>v{{ assetVersions.length - idx }}</span>
                    <el-button
                      v-if="ver.prompt" round circle bg size="small"
                      :title="t('workspace.viewVersionPrompt', 'View generation prompt for this version')"
                      @click="viewVersionPrompt(ver)" icon="ChatLineSquare"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Customization Prompt Form -->
          <div class="lg:col-span-6 flex flex-col gap-4">
            <div class="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 flex flex-col gap-4">
              <div>
                <label class="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-1.5">
                  {{ promptFieldTitle }}
                </label>
                <p class="text-xs text-neutral-400 mb-3">
                  {{ promptFieldDescription }}
                </p>
                <el-input
                  v-model="customPrompt"
                  type="textarea"
                  :rows="4"
                  :placeholder="promptFieldPlaceholder"
                />
              </div>

              <!-- Extra Video Controls if Video Sub-Asset -->
              <div v-if="assetType === 'scene_frame' && activeSceneSubAsset === 'video'" class="p-3.5 rounded-lg bg-neutral-900/90 border border-neutral-800 grid grid-cols-2 gap-3">
                <!-- <div>
                  <label class="block text-[11px] font-medium text-neutral-300 mb-1">
                    {{ t('workspace.cameraMovement', 'Camera Movement') }}
                  </label>
                  <el-select v-model="videoCameraMovement" size="small" class="w-full">
                    <el-option
                      v-for="opt in cameraMovementOptions"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </div>
                <div>
                  <label class="block text-[11px] font-medium text-neutral-300 mb-1">
                    {{ t('workspace.videoDuration', 'Duration (Seconds)') }}
                  </label>
                  <el-select v-model="videoDuration" size="small" class="w-full">
                    <el-option :label="'4s (Fast)'" :value="4" />
                    <el-option :label="'6s (Smooth)'" :value="6" />
                    <el-option :label="'8s (Extended)'" :value="8" />
                    <el-option :label="'10s (Extended)'" :value="10" />
                  </el-select>
                </div> -->
              </div>

              <!-- Reference Continuity Toggle (for images) -->
              <div v-else class="p-3.5 rounded-lg bg-neutral-900/90 border border-neutral-800 flex flex-col gap-2">
                <label class="flex items-center justify-between cursor-pointer">
                  <span class="text-xs font-medium text-neutral-200">
                    {{ t('workspace.useReferenceImage', 'Use current image as reference (Image-to-Image)') }}
                  </span>
                  <el-checkbox v-model="useReferenceImage" />
                </label>
                <p class="text-[11px] text-neutral-400">
                  {{ t('workspace.useReferenceImageHelp', 'AI will preserve identity and core geometry from the active image while applying new instructions.') }}
                </p>
              </div>

              <!-- Action Button -->
              <div class="flex items-center justify-end gap-3 mt-2">
                <el-button round plain bg type="primary"
                  :disabled="isGenerating || !customPrompt.trim()"
                  @click="handleCustomize" icon="MagicStick" :loading="isGenerating"
                >
                  <span v-if="assetType === 'scene_frame' && activeSceneSubAsset === 'video'">
                    {{ isGenerating ? t('workspace.renderingVideo', 'Rendering Video...') : t('workspace.generateVideo', 'Generate Scene Video') }}
                  </span>
                  <span v-else>
                    {{ isGenerating ? t('workspace.generatingVersion', 'Generating new version...') : t('workspace.createNewVersion', 'Generate New Version') }}
                  </span>
                </el-button>
              </div>

              <!-- Error Display -->
              <div v-if="errorMessage" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {{ errorMessage }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useScriptStore } from '@/stores/useScriptStore';
import http from '@/utils/http';
import type { AssetVersion, Scene, Character, CustomizableAsset, ApiResponse } from '@/types/api';

const props = defineProps<{
  modelValue: boolean;
  seriesId: string;
  episodeId?: string;
  assetType: 'character' | 'wardrobe' | 'location' | 'prop' | 'scene_frame';
  assetId: string;
  variantId?: string;
  assetTitle?: string;
  assetSubtitle?: string;
  initialPrompt?: string;
  currentImageUrl?: string;
  versions?: AssetVersion[];
  sceneData?: Scene;
  characterData?: Character;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'updated', payload: { 
    active_image_url: string; 
    asset?: CustomizableAsset | Scene | null; 
    version: AssetVersion; 
    versions?: AssetVersion[]; 
    sub_asset?: string; 
    variant_id?: string;
  }): void;
}>();

const { t } = useI18n();
const scriptStore = useScriptStore();

const customPrompt = ref('');
const useReferenceImage = ref(true);
const isGenerating = ref(false);
const isSelectingVersion = ref(false);
const errorMessage = ref('');
const copiedPrompt = ref(false);

const localVersions = ref<AssetVersion[]>([]);
const activeImageUrl = ref('');
const activePrompt = ref('');

// Storyboard 3-Asset Switcher state
const activeSceneSubAsset = ref<'start_frame' | 'end_frame' | 'video'>('start_frame');
const videoDuration = ref(5);
const videoCameraMovement = ref('dolly_in');
const currentScene = ref<Scene | null>(null);

// Character Sub-Asset Switcher state (Avatar vs. Wardrobes)
const activeCharSubAsset = ref<string>('avatar');
const currentChar = ref<Character | null>(null);

const cameraMovementOptions = [
  { value: 'dolly_in', label: 'Dolly In (Push In)' },
  { value: 'dolly_out', label: 'Dolly Out (Pull Back)' },
  { value: 'pan_left', label: 'Pan Left' },
  { value: 'pan_right', label: 'Pan Right' },
  { value: 'zoom_in', label: 'Zoom In' },
  { value: 'zoom_out', label: 'Zoom Out' },
  { value: 'tilt_up', label: 'Tilt Up' },
  { value: 'tilt_down', label: 'Tilt Down' },
  { value: 'orbit', label: 'Orbit (Arc Shot)' },
  { value: 'static', label: 'Static (Locked Shot)' },
];

function sanitizeVersions(rawVersions: AssetVersion[], activeImg?: string): AssetVersion[] {
  if (!Array.isArray(rawVersions) || rawVersions.length === 0) return [];

  const normalized = rawVersions.map((v, i) => ({
    ...v,
    id: v.id || `ver_${i + 1}_${Date.now()}`,
  }));

  let targetActiveId: string | null = null;
  if (activeImg) {
    const matchByImg = [...normalized].reverse().find((v) => v.image_url === activeImg);
    if (matchByImg) {
      targetActiveId = matchByImg.id;
    }
  }

  if (!targetActiveId) {
    const selectedVers = normalized.filter((v) => v.is_selected);
    if (selectedVers.length > 0) {
      targetActiveId = selectedVers[selectedVers.length - 1].id;
    } else {
      targetActiveId = normalized[normalized.length - 1].id;
    }
  }

  return normalized.map((v) => ({
    ...v,
    is_selected: v.id === targetActiveId,
  }));
}

function cleanDirectiveFromPrompt(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/Clean visual photography, completely free of text, typography, letters, titles, subtitles, words, watermarks, UI elements, overlays, labels, badges, or captions\.?/gi, '')
    .replace(/,?\s*aspect ratio \d+:\d+\.?/gi, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function switchSceneSubAsset(sub: 'start_frame' | 'end_frame' | 'video') {
  activeSceneSubAsset.value = sub;
  errorMessage.value = '';
  const scene = currentScene.value || props.sceneData;

  if (sub === 'start_frame') {
    const rawPrompt = scene?.prompt || scene?.visual_prompt || scene?.action || props.initialPrompt || '';
    const prompt = cleanDirectiveFromPrompt(rawPrompt);
    const img = scene?.storyboard_frame_url || scene?.image_url || props.currentImageUrl || '';
    customPrompt.value = prompt;
    activePrompt.value = prompt;
    activeImageUrl.value = img;
    let vers = Array.isArray(scene?.versions) ? [...scene.versions] : (Array.isArray(props.versions) ? [...props.versions] : []);
    if (vers.length === 0 && img) {
      vers.push({
        id: `v1_start_${props.assetId}`,
        image_url: img,
        prompt,
        created_at: new Date().toISOString(),
        is_selected: true,
      });
    }
    localVersions.value = sanitizeVersions(vers, img);
  } else if (sub === 'end_frame') {
    const rawPrompt = scene?.end_frame_prompt || (scene?.prompt ? `${scene.prompt}, concluding moment of the action` : '') || '';
    const prompt = cleanDirectiveFromPrompt(rawPrompt);
    const img = scene?.storyboard_end_frame_url || '';
    customPrompt.value = prompt;
    activePrompt.value = prompt;
    activeImageUrl.value = img;
    let vers = Array.isArray(scene?.end_frame_versions) ? [...scene.end_frame_versions] : [];
    if (vers.length === 0 && img) {
      vers.push({
        id: `v1_end_${props.assetId}`,
        image_url: img,
        prompt,
        created_at: new Date().toISOString(),
        is_selected: true,
      });
    }
    localVersions.value = sanitizeVersions(vers, img);
  } else if (sub === 'video') {
    const rawPrompt = scene?.action || scene?.camera_movement || scene?.visual_prompt || '';
    const prompt = cleanDirectiveFromPrompt(rawPrompt);
    const vidUrl = scene?.video_url || '';
    customPrompt.value = prompt;
    activePrompt.value = prompt;
    activeImageUrl.value = vidUrl;
    videoDuration.value = Math.min(8, Math.max(4, Number(scene?.duration_seconds) || 5));
    videoCameraMovement.value = scene?.camera_movement || 'dolly_in';
    let vers = Array.isArray(scene?.video_versions) ? [...scene.video_versions] : [];
    if (vers.length === 0 && vidUrl) {
      vers.push({
        id: `v1_video_${props.assetId}`,
        image_url: vidUrl,
        prompt,
        created_at: new Date().toISOString(),
        is_selected: true,
      });
    }
    localVersions.value = sanitizeVersions(vers, vidUrl);
  }
}

function switchCharSubAsset(subId: string) {
  activeCharSubAsset.value = subId;
  errorMessage.value = '';
  const char = currentChar.value || props.characterData;

  if (subId === 'avatar') {
    const rawPrompt = char?.prompt || [char?.name, char?.physical_characteristics || char?.traits].filter(Boolean).join(', ') || props.initialPrompt || '';
    const prompt = cleanDirectiveFromPrompt(rawPrompt);
    const img = char?.avatar || char?.image_url || props.currentImageUrl || '';
    customPrompt.value = prompt;
    activePrompt.value = prompt;
    activeImageUrl.value = img;
    let vers = Array.isArray(char?.versions) ? [...char.versions] : (Array.isArray(props.versions) ? [...props.versions] : []);
    if (vers.length === 0 && img) {
      vers.push({
        id: `v1_avatar_${char?.id || props.assetId}`,
        image_url: img,
        prompt,
        created_at: new Date().toISOString(),
        is_selected: true,
      });
    }
    localVersions.value = sanitizeVersions(vers, img);
  } else {
    // A wardrobe variant
    const wv = char?.wardrobe_variants?.find((v: any) => (v.variant_id || v.id) === subId);
    let rawPrompt = wv?.prompt || '';
    if (!rawPrompt) {
      const wDesc = wv?.clothing_and_accessories || '';
      const cTraits = char?.physical_characteristics || char?.traits || '';
      if (wDesc && cTraits) {
        rawPrompt = `${char?.name}, ${cTraits}, wearing ${wDesc}. Signature wardrobe outfit presentation, highly detailed.`;
      } else if (wDesc) {
        rawPrompt = `${char?.name}, wearing ${wDesc}. Signature wardrobe outfit presentation, highly detailed.`;
      }
    }
    const prompt = cleanDirectiveFromPrompt(rawPrompt);
    const img = wv?.image_url || '';
    customPrompt.value = prompt;
    activePrompt.value = prompt;
    activeImageUrl.value = img;
    let vers = Array.isArray(wv?.versions) ? [...wv.versions] : [];
    if (vers.length === 0 && img) {
      vers.push({
        id: `v1_wardrobe_${subId}`,
        image_url: img,
        prompt,
        created_at: new Date().toISOString(),
        is_selected: true,
      });
    }
    localVersions.value = sanitizeVersions(vers, img);
  }
}

function initOrUpdateState() {
  errorMessage.value = '';

  if (props.assetType === 'scene_frame') {
    currentScene.value = props.sceneData ? { ...props.sceneData } : null;
    const initialSub = (props.variantId as any) || 'start_frame';
    if (['start_frame', 'end_frame', 'video'].includes(initialSub)) {
      switchSceneSubAsset(initialSub);
    } else {
      switchSceneSubAsset('start_frame');
    }
    return;
  }

  if (props.assetType === 'character' || props.assetType === 'wardrobe' || props.characterData) {
    currentChar.value = props.characterData ? { ...props.characterData } : null;
    const initialSub = props.assetType === 'wardrobe' && props.variantId ? props.variantId : (props.variantId || 'avatar');
    switchCharSubAsset(initialSub);
    return;
  }

  // Normal asset (location, prop)
  const resolvedPrompt = cleanDirectiveFromPrompt(props.initialPrompt || props.assetSubtitle || '');
  customPrompt.value = resolvedPrompt;
  activeImageUrl.value = props.currentImageUrl || '';
  activePrompt.value = resolvedPrompt;

  let vers = Array.isArray(props.versions) ? [...props.versions] : [];
  const currentImg = props.currentImageUrl || activeImageUrl.value;
  if (vers.length === 0 && currentImg) {
    vers.push({
      id: `v1_${props.variantId || props.assetId}`,
      image_url: currentImg,
      prompt: resolvedPrompt,
      created_at: new Date().toISOString(),
      is_selected: true,
    });
  }
  localVersions.value = sanitizeVersions(vers, currentImg);
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      initOrUpdateState();
    }
  },
  { immediate: true }
);

watch(
  () => props.sceneData,
  (newScene) => {
    if (newScene && props.assetType === 'scene_frame') {
      currentScene.value = { ...newScene };
      switchSceneSubAsset(activeSceneSubAsset.value);
    }
  },
  { deep: true }
);

watch(
  () => props.characterData,
  (newChar) => {
    if (newChar && (props.assetType === 'character' || props.assetType === 'wardrobe')) {
      currentChar.value = { ...newChar };
      switchCharSubAsset(activeCharSubAsset.value);
    }
  },
  { deep: true }
);

watch(
  () => props.versions,
  (newVers) => {
    if (props.assetType === 'scene_frame' || props.assetType === 'character' || props.assetType === 'wardrobe') return;
    let vers = Array.isArray(newVers) ? [...newVers] : [];
    const currentImg = props.currentImageUrl || activeImageUrl.value;
    if (vers.length === 0 && currentImg) {
      vers.push({
        id: `v1_${props.variantId || props.assetId}`,
        image_url: currentImg,
        prompt: props.initialPrompt || props.assetSubtitle || '',
        created_at: new Date().toISOString(),
        is_selected: true,
      });
    }
    localVersions.value = sanitizeVersions(vers, currentImg);
  }
);

watch(
  () => props.initialPrompt,
  (newPrompt) => {
    if (props.assetType === 'scene_frame' || props.assetType === 'character' || props.assetType === 'wardrobe') return;
    if (newPrompt) {
      if (!customPrompt.value || customPrompt.value === props.assetSubtitle) {
        customPrompt.value = newPrompt;
      }
      activePrompt.value = newPrompt;
    }
  }
);

watch(
  () => props.currentImageUrl,
  (newUrl) => {
    if (props.assetType === 'scene_frame' || props.assetType === 'character' || props.assetType === 'wardrobe') return;
    if (newUrl) {
      activeImageUrl.value = newUrl;
      if (localVersions.value.length === 0) {
        localVersions.value = [
          {
            id: `v1_${props.variantId || props.assetId}`,
            image_url: newUrl,
            prompt: props.initialPrompt || props.assetSubtitle || '',
            created_at: new Date().toISOString(),
            is_selected: true,
          }
        ];
      } else {
        localVersions.value = sanitizeVersions(localVersions.value, newUrl);
      }
    }
  }
);

const currentActiveImageUrl = computed(() => {
  return activeImageUrl.value;
});

const currentActivePrompt = computed(() => {
  return activePrompt.value || customPrompt.value || '';
});

const assetVersions = computed(() => {
  return localVersions.value.slice().reverse();
});

const activeVersionId = computed(() => {
  const selected = localVersions.value.filter((v) => v.is_selected);
  if (selected.length > 0) {
    return selected[selected.length - 1].id;
  }
  if (activeImageUrl.value) {
    const matchByUrl = [...localVersions.value].reverse().find((v) => v.image_url === activeImageUrl.value);
    if (matchByUrl) return matchByUrl.id;
  }
  return localVersions.value.length > 0 ? localVersions.value[localVersions.value.length - 1].id : null;
});

function isVersionActive(ver: AssetVersion) {
  if (!ver || !ver.id) return false;
  return ver.id === activeVersionId.value;
}

const activeVersion = computed(() => {
  return localVersions.value.find((v) => v.id === activeVersionId.value);
});

const isCharacterMode = computed(() => {
  return props.assetType === 'character' || props.assetType === 'wardrobe' || !!currentChar.value;
});

const displayTitle = computed(() => {
  if (props.assetType === 'scene_frame') {
    const s = currentScene.value || props.sceneData;
    const scenePrefix = s?.heading || `Scene ${s?.index || props.assetId}`;
    if (activeSceneSubAsset.value === 'start_frame') return `${scenePrefix} - ${t('workspace.startFrame', 'Start Frame')}`;
    if (activeSceneSubAsset.value === 'end_frame') return `${scenePrefix} - ${t('workspace.endFrame', 'End Frame')}`;
    if (activeSceneSubAsset.value === 'video') return `${scenePrefix} - ${t('workspace.sceneVideo', 'Video Clip')}`;
    return scenePrefix;
  }
  if (isCharacterMode.value) {
    const char = currentChar.value || props.characterData;
    const charName = char?.name || props.assetTitle || 'Character';
    if (activeCharSubAsset.value === 'avatar') {
      return `${charName} - ${t('workspace.avatarPortrait', 'Avatar / Face')}`;
    }
    const wv = char?.wardrobe_variants?.find((v: any) => (v.variant_id || v.id) === activeCharSubAsset.value);
    if (wv) return `${charName} - ${wv.name}`;
    return charName;
  }
  return props.assetTitle || t('workspace.assetCustomizer', 'Asset Customizer');
});

const displaySubtitle = computed(() => {
  if (props.assetType === 'scene_frame') {
    const s = currentScene.value || props.sceneData;
    if (activeSceneSubAsset.value === 'start_frame') {
      return s?.visual_prompt || s?.action || s?.description || props.assetSubtitle || '';
    }
    if (activeSceneSubAsset.value === 'end_frame') {
      return s?.end_frame_prompt || 'End keyframe visual description';
    }
    if (activeSceneSubAsset.value === 'video') {
      return s?.action || s?.camera_movement || 'Motion prompt & camera movement';
    }
  }
  if (isCharacterMode.value) {
    const char = currentChar.value || props.characterData;
    if (activeCharSubAsset.value === 'avatar') {
      return char?.physical_characteristics || char?.traits || props.assetSubtitle || '';
    }
    const wv = char?.wardrobe_variants?.find((v: any) => (v.variant_id || v.id) === activeCharSubAsset.value);
    if (wv) return wv.clothing_and_accessories || '';
  }
  return props.assetSubtitle || '';
});

const assetTypeLabel = computed(() => {
  if (props.assetType === 'scene_frame') {
    if (activeSceneSubAsset.value === 'start_frame') return t('workspace.startFrame', 'Start Frame');
    if (activeSceneSubAsset.value === 'end_frame') return t('workspace.endFrame', 'End Frame');
    if (activeSceneSubAsset.value === 'video') return t('workspace.sceneVideo', 'Video Clip');
    return t('workspace.sceneFrameAsset', 'Scene Frame');
  }
  if (isCharacterMode.value) {
    if (activeCharSubAsset.value === 'avatar') return t('workspace.avatarPortrait', 'Avatar');
    return t('workspace.wardrobeAsset', 'Wardrobe');
  }
  switch (props.assetType) {
    case 'character': return t('workspace.characterAsset', 'Character');
    case 'wardrobe': return t('workspace.wardrobeAsset', 'Wardrobe');
    case 'location': return t('workspace.locationAsset', 'Location');
    case 'prop': return t('workspace.propAsset', 'Prop');
    default: return 'Asset';
  }
});

const promptFieldTitle = computed(() => {
  if (props.assetType === 'scene_frame' && activeSceneSubAsset.value === 'video') {
    return t('workspace.sceneVideo', 'Video Clip') + ' Prompt';
  }
  if (isCharacterMode.value) {
    return activeCharSubAsset.value === 'avatar' ? 'Facial Identity & Portrait Prompt' : 'Wardrobe Outfit & Presentation Prompt';
  }
  return t('workspace.customPromptTitle', 'Custom Prompt');
});

const promptFieldDescription = computed(() => {
  if (props.assetType === 'scene_frame' && activeSceneSubAsset.value === 'video') {
    return 'Describe camera motion, action, and mood for this video clip:';
  }
  if (isCharacterMode.value) {
    return activeCharSubAsset.value === 'avatar'
      ? 'Fine-tune facial characteristics, expressions, eye color, or portrait lighting:'
      : 'Describe the complete wardrobe attire, fabric materials, clothing style, and accessories:';
  }
  return t('workspace.customPromptDesc', 'Enter your desired prompt to adjust appearance, attire, camera angle, or context:');
});

const promptFieldPlaceholder = computed(() => {
  if (props.assetType === 'scene_frame' && activeSceneSubAsset.value === 'video') {
    return 'E.g.: Slow dramatic dolly-in on character face, subtle atmospheric lighting, cinematic 4k...';
  }
  if (isCharacterMode.value) {
    return activeCharSubAsset.value === 'avatar'
      ? 'E.g.: Sharp jawline, piercing dark brown eyes, confident stoic expression, soft rim lighting...'
      : 'E.g.: Fitted charcoal-gray wool trench coat, black cashmere turtleneck sweater, tailored trousers...';
  }
  return t('workspace.customPromptPlaceholder', 'E.g.: Maintain facial features, switch outfit to an elegant silk evening gown, cinematic studio lighting...');
});

function close() {
  emit('update:modelValue', false);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function copyText(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  copiedPrompt.value = true;
  setTimeout(() => {
    copiedPrompt.value = false;
  }, 2000);
}

function viewVersionPrompt(ver: AssetVersion) {
  if (ver.prompt) {
    const cleaned = cleanDirectiveFromPrompt(ver.prompt);
    activePrompt.value = cleaned;
    customPrompt.value = cleaned;
  }
}

async function handleCustomize() {
  if (!customPrompt.value.trim()) return;
  isGenerating.value = true;
  errorMessage.value = '';

  try {
    // 1. Character & Wardrobe Customization
    if (isCharacterMode.value) {
      const isAvatar = activeCharSubAsset.value === 'avatar';
      const targetType = isAvatar ? 'character' : 'wardrobe';
      const targetVariantId = isAvatar ? undefined : activeCharSubAsset.value;
      const targetCharId = currentChar.value?.id || props.assetId;

      const res = await scriptStore.customizeAsset({
        series_id: props.seriesId,
        episode_id: props.episodeId,
        asset_type: targetType,
        asset_id: targetCharId,
        variant_id: targetVariantId,
        custom_prompt: customPrompt.value,
        use_reference_image: useReferenceImage.value,
        reference_image_url: currentActiveImageUrl.value || currentChar.value?.avatar || '',
      });

      if (res?.image_url) {
        activeImageUrl.value = res.image_url;
        activePrompt.value = res.prompt || customPrompt.value;
        const newVer = res.version ? { ...res.version, is_selected: true } : {
          id: `ver_char_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          image_url: res.image_url,
          prompt: res.prompt || customPrompt.value,
          created_at: new Date().toISOString(),
          is_selected: true,
        };
        localVersions.value = [
          ...localVersions.value.map((v) => ({ ...v, is_selected: false })),
          newVer,
        ];
        if (currentChar.value) {
          if (isAvatar) {
            currentChar.value.avatar = res.image_url;
            currentChar.value.image_url = res.image_url;
            //currentChar.value.prompt = res.prompt || customPrompt.value;
            currentChar.value.versions = [...localVersions.value];
          } else {
            const wv = currentChar.value.wardrobe_variants?.find((v) => (v.variant_id) === targetVariantId);
            if (wv) {
              wv.image_url = res.image_url;
              //wv.prompt = res.prompt || customPrompt.value;
              wv.versions = [...localVersions.value];
            }
          }
        }
        emit('updated', {
          active_image_url: res.image_url,
          asset: currentChar.value || res.asset,
          version: newVer,
          versions: localVersions.value,
          sub_asset: isAvatar ? 'avatar' : 'wardrobe',
          variant_id: targetVariantId,
        });
      }
      return;
    }

    // 2. Storyboard Video Customization
    if (props.assetType === 'scene_frame' && activeSceneSubAsset.value === 'video') {
      const s = currentScene.value;
      // const res = await http.post<ApiResponse<{ url: string }>>('/assets/video-generate', {
      //   series_id: props.seriesId,
      //   episode_id: props.episodeId,
      //   scene_id: `scene_${String(props.assetId).padStart(2, '0')}`,
      //   start_frame_url: s?.storyboard_frame_url || s?.image_url,
      //   end_frame_url: s?.storyboard_end_frame_url || undefined,
      //   // duration: videoDuration.value,
      //   action: customPrompt.value,
      //   // camera_movement: videoCameraMovement.value,
      //   prompt: customPrompt.value,
      //   scene_data: s,
      // });

      const res = await scriptStore.customizeVideo({
        series_id: props.seriesId,
        episode_id: props.episodeId,
        scene_id: s?.id,
        start_frame_url: s?.storyboard_frame_url || s?.image_url,
        end_frame_url: s?.storyboard_end_frame_url || undefined,
        // duration: videoDuration.value,
        action: customPrompt.value,
        // camera_movement: videoCameraMovement.value,
        custom_prompt: customPrompt.value,
        scene_data: s,
      });

      if(res?.video_url){
        const videoUrl = res.video_url;
        activeImageUrl.value = videoUrl;
        activePrompt.value = customPrompt.value;
        const newVer: AssetVersion = {
          id: `ver_vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          image_url: videoUrl,
          video_url: videoUrl,
          prompt: customPrompt.value,
          created_at: new Date().toISOString(),
          is_selected: true,
        };
        localVersions.value = [
          ...localVersions.value.map((v) => ({ ...v, is_selected: false })),
          newVer,
        ];
        if (s) {
          s.video_url = videoUrl;
          s.camera_movement = videoCameraMovement.value;
          s.action = customPrompt.value;
          s.video_versions = [...localVersions.value];
        }
        emit('updated', {
          active_image_url: videoUrl,
          asset: s,
          version: newVer,
          versions: localVersions.value,
          sub_asset: 'video',
        });
      }
      return;
    }

    // 3. Storyboard End Frame Customization
    if (props.assetType === 'scene_frame' && activeSceneSubAsset.value === 'end_frame') {
      const startFrame = currentScene.value?.storyboard_frame_url || currentScene.value?.image_url;
      const res = await scriptStore.customizeAsset({
        series_id: props.seriesId,
        episode_id: props.episodeId,
        asset_type: 'scene_frame',
        asset_id: props.assetId,
        variant_id: 'end_frame',
        custom_prompt: customPrompt.value,
        use_reference_image: useReferenceImage.value,
        reference_image_url: currentActiveImageUrl.value || startFrame,
        start_frame_url: startFrame,
      });

      if (res?.image_url) {
        activeImageUrl.value = res.image_url;
        activePrompt.value = res.prompt || customPrompt.value;
        const newVer = res.version ? { ...res.version, is_selected: true } : {
          id: `ver_end_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          image_url: res.image_url,
          prompt: res.prompt || customPrompt.value,
          created_at: new Date().toISOString(),
          is_selected: true,
        };
        localVersions.value = [
          ...localVersions.value.map((v) => ({ ...v, is_selected: false })),
          newVer,
        ];
        if (currentScene.value) {
          currentScene.value.storyboard_end_frame_url = res.image_url;
          //currentScene.value.end_frame_prompt = res.prompt || customPrompt.value;
          currentScene.value.end_frame_versions = [...localVersions.value];
        }
        emit('updated', {
          active_image_url: res.image_url,
          asset: res.asset || currentScene.value,
          version: newVer,
          versions: localVersions.value,
          sub_asset: 'end_frame',
        });
      }
      return;
    }

    // 4. Default: Start Frame or Location/Prop
    const res = await scriptStore.customizeAsset({
      series_id: props.seriesId,
      episode_id: props.episodeId,
      asset_type: props.assetType,
      asset_id: props.assetId,
      variant_id: props.assetType === 'scene_frame' ? 'start_frame' : props.variantId,
      custom_prompt: customPrompt.value,
      use_reference_image: useReferenceImage.value,
      reference_image_url: currentActiveImageUrl.value,
    });

    if (res?.image_url) {
      activeImageUrl.value = res.image_url;
      activePrompt.value = res.prompt || customPrompt.value;
      const newVer = res.version ? { ...res.version, is_selected: true } : {
        id: `ver_start_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        image_url: res.image_url,
        prompt: res.prompt || customPrompt.value,
        created_at: new Date().toISOString(),
        is_selected: true,
      };
      localVersions.value = [
        ...localVersions.value.map((v) => ({ ...v, is_selected: false })),
        newVer,
      ];
      if (currentScene.value && props.assetType === 'scene_frame') {
        currentScene.value.storyboard_frame_url = res.image_url;
        //currentScene.value.prompt = res.prompt || customPrompt.value;
        currentScene.value.versions = [...localVersions.value];
      }
      emit('updated', {
        active_image_url: res.image_url,
        asset: res.asset || currentScene.value,
        version: newVer,
        versions: localVersions.value,
        sub_asset: 'start_frame',
      });
    }
  } catch (err: any) {
    errorMessage.value = err.response?.data?.message || err.message || t('workspace.customizeFailed', 'Failed to customize asset');
  } finally {
    isGenerating.value = false;
  }
}

async function handleSelectVersion(versionId: string) {
  if (!versionId) return;
  isSelectingVersion.value = true;
  errorMessage.value = '';

  try {
    // 1. Character Mode Version Selection
    if (isCharacterMode.value) {
      const isAvatar = activeCharSubAsset.value === 'avatar';
      const targetType = isAvatar ? 'character' : 'wardrobe';
      const targetVariantId = isAvatar ? undefined : activeCharSubAsset.value;
      const targetCharId = currentChar.value?.id || props.assetId;

      const res = await scriptStore.selectAssetVersion({
        series_id: props.seriesId,
        episode_id: props.episodeId,
        asset_type: targetType,
        asset_id: targetCharId,
        variant_id: targetVariantId,
        version_id: versionId,
      });

      if (res?.active_image_url) {
        activeImageUrl.value = res.active_image_url;
        localVersions.value = localVersions.value.map((v) => ({
          ...v,
          is_selected: v.id === versionId,
        }));
        const matched = localVersions.value.find((v) => v.id === versionId);
        if (matched?.prompt) {
          activePrompt.value = matched.prompt;
        }
        if (currentChar.value) {
          if (isAvatar) {
            currentChar.value.avatar = res.active_image_url;
            currentChar.value.image_url = res.active_image_url;
            if (matched?.prompt) currentChar.value.prompt = matched.prompt;
            currentChar.value.versions = [...localVersions.value];
          } else {
            const wv = currentChar.value.wardrobe_variants?.find((v) => (v.variant_id) === targetVariantId);
            if (wv) {
              wv.image_url = res.active_image_url;
              //if (matched?.prompt) wv.prompt = matched.prompt;
              wv.versions = [...localVersions.value];
            }
          }
        }
        emit('updated', {
          active_image_url: res.active_image_url,
          asset: currentChar.value || res.asset,
          version: matched || { id: versionId, image_url: res.active_image_url },
          versions: localVersions.value,
          sub_asset: isAvatar ? 'avatar' : 'wardrobe',
          variant_id: targetVariantId,
        });
      }
      return;
    }

    // 2. Storyboard or Other Assets Version Selection
    const targetVariantId = props.assetType === 'scene_frame' ? activeSceneSubAsset.value : props.variantId;
    const res = await scriptStore.selectAssetVersion({
      series_id: props.seriesId,
      episode_id: props.episodeId,
      asset_type: props.assetType,
      asset_id: props.assetId,
      variant_id: targetVariantId,
      version_id: versionId,
    });

    if (res?.active_image_url) {
      activeImageUrl.value = res.active_image_url;
      localVersions.value = localVersions.value.map((v) => ({
        ...v,
        is_selected: v.id === versionId,
      }));
      const matched = localVersions.value.find((v) => v.id === versionId);
      if (matched?.prompt) {
        activePrompt.value = matched.prompt;
      }
      if (currentScene.value) {
        if (activeSceneSubAsset.value === 'end_frame') {
          currentScene.value.storyboard_end_frame_url = res.active_image_url;
          //if (matched?.prompt) currentScene.value.end_frame_prompt = matched.prompt;
          currentScene.value.end_frame_versions = [...localVersions.value];
        } else if (activeSceneSubAsset.value === 'video') {
          currentScene.value.video_url = res.active_image_url;
          currentScene.value.video_versions = [...localVersions.value];
        } else {
          currentScene.value.storyboard_frame_url = res.active_image_url;
          //if (matched?.prompt) currentScene.value.prompt = matched.prompt;
          currentScene.value.versions = [...localVersions.value];
        }
      }
      emit('updated', {
        active_image_url: res.active_image_url,
        asset: res.asset || currentScene.value,
        version: matched || { id: versionId, image_url: res.active_image_url },
        versions: localVersions.value,
        sub_asset: activeSceneSubAsset.value,
      });
    }
  } catch (err: any) {
    errorMessage.value = err.response?.data?.message || err.message || t('workspace.selectVersionFailed', 'Failed to select version');
  } finally {
    isSelectingVersion.value = false;
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

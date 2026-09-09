<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { toast } from 'vue-sonner';
import { ElMessageBox } from 'element-plus';
import AssetCustomizationDialog from '@/components/workspace/AssetCustomizationDialog.vue';
import type { AssetVersion } from '@/types/api';

const { t } = useI18n();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();

const activeEpisode = computed(() => seriesStore.activeEpisode);
const scenes = computed(() => activeEpisode.value?.scenes || []);

// ─── Video Preview Modal State ──────────────────────────────────────────────
const isPreviewModalOpen = ref(false);
const previewScene = ref<any>(null);

function getSceneStatus(sceneIndex: number) {
  return pipelineStore.getSceneStatus(sceneIndex);
}

function openVideoPreview(scene: any) {
  const vUrl = scene.video_url || getSceneStatus(scene.index).video_url;
  if (!vUrl) return;
  previewScene.value = scene;
  isPreviewModalOpen.value = true;
}

function closeVideoPreview() {
  isPreviewModalOpen.value = false;
  previewScene.value = null;
}

const isSyncingAudio = ref<Record<number, boolean>>({});

function isSceneLocked(scene: any): boolean {
  const idx = scene.index || scene.scene_number || scene.sceneNumber;
  return !!(
    getSceneStatus(idx).bg_status === 'running' ||
    getSceneStatus(idx).video_status === 'running' ||
    isSyncingAudio.value[idx] ||
    pipelineStore.isItemRendering(`Scene #${idx}`) ||
    pipelineStore.isItemRendering(`Scene ${idx}`) ||
    pipelineStore.isItemRendering(idx)
  );
}

// ─── Asset Customizer Modal State (For Scene Frame) ─────────────────────────
const isCustomizerOpen = ref(false);
const customizerAssetType = ref<'character' | 'wardrobe' | 'location' | 'prop' | 'scene_frame'>('scene_frame');
const customizerAssetId = ref('');
const customizerVariantId = ref<string | undefined>(undefined);
const customizerTitle = ref('');
const customizerSubtitle = ref('');
const customizerInitialPrompt = ref('');
const customizerCurrentImageUrl = ref('');
const customizerVersions = ref<any[]>([]);
const customizerSceneData = ref<any>(null);

function openCustomizer(type: 'scene_frame', scene: any, initialSubAsset: 'start_frame' | 'end_frame' | 'video' = 'start_frame') {
  customizerAssetType.value = type;
  customizerAssetId.value = String(scene.id || scene.index || scene.scene_number);
  customizerVariantId.value = initialSubAsset;
  customizerTitle.value = scene.heading || `Scene ${scene.index}`;
  customizerSubtitle.value = scene.frame_visual || scene.action || scene.description || '';
  customizerSceneData.value = scene;
  
  const resolvedPrompt = scene.prompt || scene.visual_prompt || scene.frame_visual || scene.action || scene.description || '';
  customizerInitialPrompt.value = resolvedPrompt;

  const currentImg = scene.storyboard_frame_url || scene.image_url || getSceneStatus(scene.index).storyboard_url || '';
  customizerCurrentImageUrl.value = currentImg;

  let vers = Array.isArray(scene.versions) && scene.versions.length > 0 ? [...scene.versions] : [];
  if (vers.length === 0 && currentImg) {
    vers = [
      {
        id: `v1_scene_${customizerAssetId.value}`,
        image_url: currentImg,
        prompt: resolvedPrompt,
        created_at: new Date().toISOString(),
        is_selected: true,
      }
    ];
  }

  customizerVersions.value = vers;
  isCustomizerOpen.value = true;
}

function handleCustomizerUpdated(payload: { active_image_url: string; asset?: unknown; version: AssetVersion; versions?: AssetVersion[]; sub_asset?: string; variant_id?: string }) {
  toast.success(t('workspace.assetUpdated', 'Asset version updated successfully!'));

  const matched = scenes.value.find((s: any) => String(s.id || s.index || s.scene_number) === customizerAssetId.value);
  if (matched) {
    if (payload.sub_asset === 'end_frame') {
      matched.storyboard_end_frame_url = payload.active_image_url;
      //if (payload.version?.prompt) matched.end_frame_prompt = payload.version.prompt;
      if (Array.isArray(payload.versions)) {
        matched.end_frame_versions = [...payload.versions];
      } else {
        if (!Array.isArray(matched.end_frame_versions)) matched.end_frame_versions = [];
        matched.end_frame_versions = matched.end_frame_versions.map((v: any) => ({ ...v, is_selected: false }));
        if (payload.version) {
          const idx = matched.end_frame_versions.findIndex((v: any) => v.id === payload.version.id);
          if (idx >= 0) matched.end_frame_versions[idx] = { ...payload.version, is_selected: true };
          else matched.end_frame_versions.push({ ...payload.version, is_selected: true });
        }
      }
    } else if (payload.sub_asset === 'video') {
      matched.video_url = payload.active_image_url;
      if (Array.isArray(payload.versions)) {
        matched.video_versions = [...payload.versions];
      } else {
        if (!Array.isArray(matched.video_versions)) matched.video_versions = [];
        matched.video_versions = matched.video_versions.map((v: any) => ({ ...v, is_selected: false }));
        if (payload.version) {
          const idx = matched.video_versions.findIndex((v: any) => v.id === payload.version.id);
          if (idx >= 0) matched.video_versions[idx] = { ...payload.version, is_selected: true };
          else matched.video_versions.push({ ...payload.version, is_selected: true });
        }
      }
      if (seriesStore.activeEpisodeId) {
        seriesStore.updateSceneVideoUrl(seriesStore.activeEpisodeId, matched.index, payload.active_image_url);
      }
    } else {
      matched.storyboard_frame_url = payload.active_image_url;
      matched.image_url = payload.active_image_url;
      //if (payload.version?.prompt) matched.prompt = payload.version.prompt;
      if (Array.isArray(payload.versions)) {
        matched.versions = [...payload.versions];
      } else {
        if (!Array.isArray(matched.versions)) matched.versions = [];
        matched.versions = matched.versions.map((v: any) => ({ ...v, is_selected: false }));
        if (payload.version) {
          const idx = matched.versions.findIndex((v: any) => v.id === payload.version.id);
          if (idx >= 0) matched.versions[idx] = { ...payload.version, is_selected: true };
          else matched.versions.push({ ...payload.version, is_selected: true });
        }
      }
    }
  }

  if (seriesStore.currentSeries?.id) {
    seriesStore.loadWorkspaceData(seriesStore.currentSeries.id);
  }
}

function sendToChatbot(prompt: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('trigger-chatbot-action', { detail: { prompt } }));
  }
}

async function confirmGenerationScope(customMessage?: string): Promise<'missing' | 'all' | 'cancel'> {
  try {
    const action = await ElMessageBox.confirm(
      customMessage || t('workspace.generationConfirmMessage', 'Do you want to render only missing items or re-render all items completely?'),
      t('workspace.generationConfirmTitle', 'Generation Scope'),
      {
        distinguishCancelAndClose: true,
        confirmButtonText: t('workspace.generateMissingOnly', 'Generate Missing Only (Fast)'),
        cancelButtonText: t('workspace.regenerateAll', 'Re-render All (Force)'),
        type: 'info',
        roundButton: true,
      }
    );
    return action === 'confirm' ? 'missing' : 'all';
  } catch (action) {
    if (action === 'cancel') {
      return 'all';
    }
    return 'cancel';
  }
}

async function renderScene(scene: any, agentMode = true) {
  try {
    if (agentMode) {
      sendToChatbot(`Generate storyboard frame image for Scene #${scene.index}`);
      return;
    }
    toast.info(t('toast.renderingSceneIndex'));
    await pipelineStore.renderScene(scene.index, scene);
    toast.success(t('workspace.renderScene') + ' ' + t('common.done', 'Done'));
  } catch {
    toast.error(t('toast.sceneRenderFailed'));
  }
}

async function renderSceneVideo(scene: any, agentMode = true) {
  if (agentMode) {
    sendToChatbot(`Generate Image-to-Video clip for Scene #${scene.index}`);
    return;
  }
  try {
    toast.info(t('toast.renderingVideo', 'Rendering scene video...'));
    await pipelineStore.renderSceneVideo(scene.index, scene);
    toast.success((t('workspace.renderVideo') || 'Render Video') + ' ' + (t('common.done') || 'Done'));
  } catch {
    toast.error(t('toast.videoRenderFailed', 'Failed to render scene video'));
  }
}

async function renderAllScenes(agentMode = true) {
  if (agentMode) {
    const mode = await confirmGenerationScope();
    if (mode === 'cancel') return;
    if (mode === 'all') {
      sendToChatbot('Force re-render storyboard image frames for all scenes');
    } else {
      sendToChatbot('Generate storyboard image frames for all scenes missing storyboard');
    }
    return;
  }
  try {
    toast.info(t('workspace.renderAllScenes'));
    await pipelineStore.renderAllScenes();
    toast.success(t('toast.allScenesQueued'));
  } catch {
    toast.error(t('toast.failedToRenderScenes'));
  }
}

async function renderAllVideos(agentMode = true) {
  if (agentMode) {
    const mode = await confirmGenerationScope();
    if (mode === 'cancel') return;
    if (mode === 'all') {
      sendToChatbot('Force re-render video for all scenes');
    } else {
      sendToChatbot('Generate video for all scenes missing video');
    }
    return;
  }
  try {
    toast.info(t('workspace.renderAllVideos', 'Rendering all videos...'));
    await pipelineStore.renderAllVideos();
    toast.success(t('toast.allScenesQueued'));
  } catch {
    toast.error(t('toast.failedToRenderScenes'));
  }
}

async function handleSyncAudio(scene: any, agentMode = true) {
  const vUrl = scene.video_url || getSceneStatus(scene.index).video_url;
  if (!vUrl) {
    toast.warning(t('workspace.videoRequiredFirst', 'Please render video first before syncing audio & captions.'));
    return;
  }

  isSyncingAudio.value[scene.index] = true;
  try {
    if (agentMode) {
      sendToChatbot(`Generate TTS voiceover and captions sync for Scene #${scene.index}`);
      return;
    }
    toast.info(t('workspace.syncingAudioCues', `Separating audio & extracting captions for Scene ${scene.index}...`));
    const result = await pipelineStore.separateSceneAudio(scene.index, vUrl, scene.dialogue);
    if (result) {
      toast.success(t('workspace.syncAudioSuccess', `Scene ${scene.index}: Voiceover, BGM & Captions synced to timeline!`));
    } else {
      toast.error(t('workspace.syncAudioFailed', 'Failed to sync voiceover & captions.'));
    }
  } catch (err: any) {
    toast.error(`${t('common.error', 'Error')}: ${err.message}`);
  } finally {
    isSyncingAudio.value[scene.index] = false;
  }
}
</script>

<template>
  <div class="p-4 rounded-2xl border shadow-soft space-y-4">
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style="color: var(--el-color-primary);">
          <el-icon :size="14"><VideoCamera /></el-icon> {{ t('workspace.storyboard', 'Storyboard') }} ({{ scenes.length }} {{ t('workspace.scenes', 'Scenes') }})
        </h3>
        <el-button link type="primary" size="small" icon="MagicStick" @click="renderAllScenes(true)">
          {{ t('workspace.autofill', 'Autofill') }}
        </el-button>
      </div>
    </div>

    <!-- Scenes List with Frames -->
    <div v-if="scenes.length > 0" class="space-y-4">
      <el-card
        v-for="(scene, sIdx) in scenes"
        :key="scene.index || sIdx"
        v-loading="isSceneLocked(scene)"
        class="!rounded-xl"
        body-class="!p-[10px] flex flex-row gap-2 overflow-hidden"
      >
        <!-- Left: Thumbnail Box & Render Buttons -->
        <div class="w-28 sm:w-32 shrink-0 flex flex-col gap-2">
          <div
            class="w-full aspect-[3/4] rounded-xl overflow-hidden relative border flex items-center justify-center group select-none cursor-pointer"
            style="border-color: var(--el-border-color);"
          >
            <el-image
              :src="scene.storyboard_frame_url || getSceneStatus(scene.index).storyboard_url || ''"
              :alt="`Scene ${scene.index}`"
              :preview-teleported="true"
              :preview-src-list="[scene.storyboard_frame_url || getSceneStatus(scene.index).storyboard_url || '']"
              class="w-full h-full"
              fit="cover"
            >
              <template #error>
                <div class="flex flex-col items-center justify-center p-2 text-center h-full">
                  <el-icon :size="24"><Picture /></el-icon>
                  <span class="text-[9px] font-medium" style="color: var(--el-text-color-placeholder);">{{ t('workspace.noRenderYet') }}</span>
                </div>
              </template>
            </el-image>

            <div v-if="scene.video_url || getSceneStatus(scene.index).video_url" class="absolute bottom-2 right-2 z-10" @click.stop="openVideoPreview(scene)">
              <el-button type="primary" icon="VideoPlay" size="small" circle></el-button>
            </div>
          </div>

          <!-- Buttons beneath thumbnail -->
          <div class="flex flex-col gap-1.5 w-full">
            <el-button
              size="small"
              round
              :type="scene.storyboard_frame_url || getSceneStatus(scene.index).storyboard_url ? '' : 'primary'"
              :plain="!!(scene.storyboard_frame_url || getSceneStatus(scene.index).storyboard_url)"
              :icon="scene.storyboard_frame_url || getSceneStatus(scene.index).storyboard_url ? 'RefreshLeft' : 'Picture'"
              :loading="isSceneLocked(scene)"
              :disabled="isSceneLocked(scene)"
              class="!w-full !text-[10px] !px-1.5"
              @click="renderScene(scene)"
            >
              {{ scene.storyboard_frame_url || getSceneStatus(scene.index).storyboard_url ? t('workspace.reRender') : t('workspace.renderScene') }}
            </el-button>

            <el-button
              size="small"
              round
              icon="EditPen"
              class="!w-full !text-[10px] !px-1.5 !ml-0"
              :title="t('workspace.customizeSceneTooltip', 'Customize Start Frame, End Frame, and Video Clip with custom prompts & version history')"
              @click="openCustomizer('scene_frame', scene)"
            >
              {{ t('workspace.customizeScene', 'Customize Scene') }}
            </el-button>

            <el-button
              v-if="scene.storyboard_frame_url || getSceneStatus(scene.index).storyboard_url"
              size="small"
              round
              :type="scene.video_url || getSceneStatus(scene.index).video_url ? '' : 'success'"
              :plain="!!(scene.video_url || getSceneStatus(scene.index).video_url)"
              :icon="scene.video_url || getSceneStatus(scene.index).video_url ? 'RefreshLeft' : 'Film'"
              :loading="isSceneLocked(scene)"
              :disabled="isSceneLocked(scene)"
              class="!w-full !text-[10px] !px-1.5 !ml-0"
              @click="renderSceneVideo(scene)"
            >
              {{ scene.video_url || getSceneStatus(scene.index).video_url ? t('workspace.reRenderVideo') : t('workspace.renderVideo') }}
            </el-button>

            <el-button
              v-if="scene.video_url || getSceneStatus(scene.index).video_url"
              size="small"
              round
              icon="Microphone"
              :loading="isSyncingAudio[scene.index]"
              :disabled="isSyncingAudio[scene.index]"
              class="!w-full !text-[10px] !px-1.5 !ml-0"
              @click="handleSyncAudio(scene)"
            >
              {{ t('workspace.syncAudio', 'Sync Audio') }}
            </el-button>
          </div>
        </div>

        <!-- Right: Details -->
        <div class="flex-1 min-w-0 flex flex-col space-y-2 py-0.5">
          <div class="flex justify-between items-start gap-2 mb-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wide leading-snug line-clamp-1" style="color: var(--el-color-primary);">
              {{ scene.heading || `SCENE ${String(scene.index || sIdx + 1).padStart(2, '0')}` }}
            </span>
          </div>

          <div class="flex gap-1.5 flex-wrap mb-2">
            <el-tag v-if="scene.location" size="small" type="info" round class="text-[9px]">{{ scene.location }}</el-tag>
            <el-tag v-if="scene.time_of_day" size="small" type="info" effect="plain" round class="text-[9px]">{{ scene.time_of_day }}</el-tag>
          </div>

          <p class="text-[11px] leading-relaxed line-clamp-2" style="color: var(--el-text-color-regular);">
            {{ scene.action || scene.description }}
          </p>

          <!-- Dialogue Box -->
          <div v-if="scene.dialogue && scene.dialogue.length > 0" class="p-2 rounded-lg space-y-1.5 border" style="background-color: var(--el-fill-color-dark); border-color: var(--el-border-color-lighter);">
            <div v-for="(dlg, dIdx) in scene.dialogue" :key="dIdx" class="space-y-0.5">
              <div class="text-[10px] font-bold" style="color: var(--el-text-color-primary);">{{ dlg.character }}</div>
              <p class="text-[11px] italic leading-snug line-clamp-2 mt-0.5" style="color: var(--el-text-color-primary);">"{{ dlg.line }}"</p>
            </div>
          </div>
        </div>
      </el-card>

      <el-button round type="primary" class="w-full" size="small" icon="MagicStick" @click="renderAllVideos(true)">
        {{ t('workspace.renderAllVideo', 'Render All Video') }}
      </el-button>
    </div>

    <!-- ─── Video Preview Modal ──────────────────────────────────────────────── -->
    <el-dialog
      v-model="isPreviewModalOpen"
      :title="previewScene?.heading || (previewScene ? `Scene ${previewScene.index}` : 'Video Preview')"
      width="440px"
      align-center
      destroy-on-close
      class="rounded-2xl overflow-hidden"
    >
      <div v-if="previewScene" class="flex flex-col items-center gap-3">
        <div class="w-full max-w-[300px] rounded-2xl overflow-hidden bg-black shadow-2xl border relative flex items-center justify-center" style="border-color: var(--el-border-color);">
          <video
            :src="previewScene.video_url || getSceneStatus(previewScene.index).video_url"
            controls
            autoplay
            loop
            playsinline
            class="w-full h-full object-contain"
          />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round size="small" @click="closeVideoPreview">{{ t('common.close', 'Close') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ─── Asset Advanced Customization Dialog (For Scene Frame, End Frame & Video) ── -->
    <AssetCustomizationDialog
      v-model="isCustomizerOpen"
      :series-id="seriesStore.currentSeries?.id || ''"
      :episode-id="(seriesStore.activeEpisode as any)?.id || ''"
      :asset-type="'scene_frame'"
      :asset-id="customizerAssetId"
      :variant-id="customizerVariantId"
      :asset-title="customizerTitle"
      :asset-subtitle="customizerSubtitle"
      :initial-prompt="customizerInitialPrompt"
      :current-image-url="customizerCurrentImageUrl"
      :versions="customizerVersions"
      :scene-data="customizerSceneData"
      @updated="handleCustomizerUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { parseRenderVersionKey } from '@/constants/geminiLanguages';
import CountryFlag from '@/components/common/CountryFlag.vue';

const props = defineProps<{
  modelValue: boolean;
  seriesId: string;
  episodeId: string;
  outputs: Record<string, string>;
  thumbnail?: string | Blob;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'queue-server-render'): void;
}>();

const { t } = useI18n();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();

const selectedLang = ref('');
const isUploading = ref(false);

const activeLang = computed(() => {
  if (selectedLang.value && props.outputs[selectedLang.value]) {
    return selectedLang.value;
  }
  return seriesStore.currentSeries?.language || Object.keys(props.outputs)[0] || 'en-US';
});

const currentVideoUrl = computed(() => {
  return props.outputs[activeLang.value] || Object.values(props.outputs)[0] || '';
});

function selectLanguage(langKey: string) {
  selectedLang.value = langKey;
}

async function handleUpload(uploadAll: boolean) {
  isUploading.value = true;
  try {
    await pipelineStore.uploadRenderVersions(
      props.seriesId,
      props.episodeId,
      props.outputs,
      props.thumbnail,
      uploadAll
    );
  } finally {
    isUploading.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="t('workspace.reviewRenderedVideo')"
    width="560px"
    class="rounded-2xl"
    :close-on-click-modal="true"
  >
    <div class="flex flex-col gap-4">
      <div v-if="currentVideoUrl" class="rounded-xl overflow-hidden border" style="border-color: var(--el-border-color);">
        <video
          :key="currentVideoUrl"
          :src="currentVideoUrl"
          controls
          autoplay
          :poster="typeof thumbnail === 'string' ? thumbnail : ''"
          class="w-full max-h-[360px] bg-black"
          style="aspect-ratio: 4/3; object-fit: contain;"
        />
      </div>
      <div v-else class="text-center py-8 text-sm" style="color: var(--el-text-color-secondary);">
        <el-icon class="is-loading text-2xl mb-2"><Loading /></el-icon>
        <p>{{ t('workspace.waitingForRender') }}</p>
      </div>

      <!-- Footer: Version selector on Left, Actions on Right -->
      <div class="flex items-center justify-between gap-2 pt-2 border-t" style="border-color: var(--el-border-color-light);">
        <!-- Left: Version Selector Popover/Dropdown -->
        <div class="flex items-center gap-1.5">
          <el-dropdown v-if="Object.keys(outputs).length > 1" trigger="click" size="small">
            <el-button size="small" text round bg class="!flex items-center gap-1.5">
              <CountryFlag :code="parseRenderVersionKey(activeLang).voiceObj.countryCode" :flag="parseRenderVersionKey(activeLang).voiceObj.flag" size="small" />
              <span class="max-w-[150px] truncate text-xs font-medium">{{ parseRenderVersionKey(activeLang).label }}</span>
              <el-icon class="text-xs text-muted-foreground"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu class="max-h-[280px] overflow-y-auto">
                <el-dropdown-item
                  v-for="(url, langKey) in outputs"
                  :key="langKey"
                  :class="{ '!text-primary font-semibold': activeLang === String(langKey) }"
                  @click="selectLanguage(String(langKey))"
                >
                  <div class="flex items-center gap-2 py-0.5">
                    <CountryFlag :code="parseRenderVersionKey(String(langKey)).voiceObj.countryCode" :flag="parseRenderVersionKey(String(langKey)).voiceObj.flag" size="small" />
                    <span class="text-xs">{{ parseRenderVersionKey(String(langKey)).label }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
        </el-dropdown>
      </div>

      <!-- Right: Action Buttons -->
      <div class="flex flex-wrap gap-2 justify-end items-center">
        <!-- Upload All Rendered Language Versions -->
        <el-dropdown
          v-if="Object.keys(outputs).length > 1"
          size="small"
          split-button
        >
          <el-button
            type="primary"
            icon="Upload"
            size="small"
            text
            round
            :loading="isUploading"
            @click="handleUpload(true)"
          >
            {{ t('workspace.uploadAllVideos', { count: Object.keys(outputs).length }) }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleUpload(false)">
                {{ `${t('workspace.uploadVideo')} (${parseRenderVersionKey(activeLang).voiceObj.countryCode.toUpperCase()})` }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- Upload Currently Selected / Active Version -->
        <el-button
          v-else-if="currentVideoUrl"
          type="warning"
          icon="Upload"
          size="small"
          text
          round
          bg
          :loading="isUploading"
          @click="handleUpload(false)"
        >
          {{ `${t('workspace.uploadVideo')} (${parseRenderVersionKey(activeLang).voiceObj.countryCode.toUpperCase()})` }}
        </el-button>

        <el-button
          v-if="currentVideoUrl"
          type="success"
          icon="Download"
          size="small"
          text
          round
          bg
          :href="currentVideoUrl"
          :download="`episode-${episodeId}-${activeLang}.mp4`"
        >
          {{ t('workspace.download') }} ({{ parseRenderVersionKey(activeLang).voiceObj.countryCode.toUpperCase() }})
        </el-button>

        <el-button
          type="primary"
          icon="Cpu"
          size="small"
          text
          round
          bg
          @click="emit('queue-server-render')"
        >
          {{ t('workspace.queueServerRender') || "Batch Cloud Render" }}
        </el-button>
      </div>
    </div>
    </div>
  </el-dialog>
</template>

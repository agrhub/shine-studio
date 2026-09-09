<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { Clapperboard, Bot } from 'lucide-vue-next';
import JobStatusPopover from '@/components/workspace/JobStatusPopover.vue';

const props = defineProps<{
  isAiSidebarOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-export'): void;
  (e: 'open-publish'): void;
  (e: 'toggle-ai-sidebar'): void;
}>();

const { t } = useI18n();
const router = useRouter();
const seriesStore = useSeriesStore();
const pipelineStore = usePipelineStore();

const seriesTitle = computed(() => seriesStore.currentSeries?.title || 'Micro-Drama Series');
const currentEpisodeTitle = computed(() => {
  if (seriesStore.activeEpisode) {
    return `EP ${String(seriesStore.activeEpisode.number).padStart(2, '0')}: ${seriesStore.activeEpisode.title.toUpperCase()}`;
  }
  return 'EP TITLE';
});

function goBack() {
  router.push('/dashboard');
}
</script>

<template>
  <el-header class="w-full h-16 border-b flex items-center justify-between px-4 lg:px-6 shrink-0 z-10 relative" style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);">
    <div class="flex items-center gap-4">
      <el-button link circle @click="goBack" class="!p-1" icon="Back" />

      <div class="flex flex-col">
        <div class="flex items-center gap-2">
          <h1 class="font-bold text-sm sm:text-base leading-tight" style="color: var(--el-text-color-primary);">
            {{ seriesTitle }}
          </h1>
          <el-tag size="small" type="primary" effect="plain" round class="font-bold font-mono text-[10px]">
            {{ seriesStore.currentSeries?.ratio || '9:16' }}
          </el-tag>
        </div>
        <div class="text-[11px] flex items-center gap-2" style="color: var(--el-text-color-secondary);">
          <span>{{ currentEpisodeTitle }}</span>
          <el-divider direction="vertical" />
          <span class="font-semibold flex items-center gap-1" style="color: var(--el-color-primary);">
            <el-icon :size="12"><MagicStick /></el-icon>
            {{ t('workspace.aiAssistantActive') }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div v-if="pipelineStore.isRendering" class="hidden md:flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold" style="background-color: var(--el-color-primary-light-9); color: var(--el-color-primary); border: 1px solid var(--el-color-primary-light-7);">
        <el-icon class="is-loading" :size="12"><Loading /></el-icon>
        <span>{{ pipelineStore.currentRenderingMessage || (pipelineStore.currentRenderingScene ? t('workspace.renderingScene', { scene: pipelineStore.currentRenderingScene, percent: pipelineStore.currentRenderingPercent }) : `${t('common.processing')} (${pipelineStore.currentRenderingPercent}%)`) }}</span>
      </div>

      <JobStatusPopover />

      <el-button
        circle
        size="large"
        class="!ml-0"
        plain
        bg
        :icon="Clapperboard"
        :title="t('common.export', 'Export Video')"
        @click="emit('open-export')"
      />

      <el-button
        size="large"
        class="!ml-0"
        plain
        bg
        circle
        :title="t('workspace.publishSeries', 'Publish series')"
        icon="Promotion"
        @click="emit('open-publish')"
      />

      <el-button
        circle
        size="large"
        class="!ml-0"
        plain
        bg
        :icon="Bot"
        :type="isAiSidebarOpen ? 'primary' : 'default'"
        @click="emit('toggle-ai-sidebar')"
        :title="t('workspace.toggleAiSidebar', 'Toggle AI Copilot Sidebar')"
      />
    </div>
  </el-header>
</template>

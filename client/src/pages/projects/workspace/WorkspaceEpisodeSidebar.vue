<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';

const props = defineProps<{
  isCollapsed: boolean;
  isEpisodeLoading: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:isCollapsed', value: boolean): void;
  (e: 'select-episode', ep: any, index: number): void;
}>();

const { t } = useI18n();
const seriesStore = useSeriesStore();

const episodesList = computed(() => seriesStore.episodesList);
const activeEpisodeId = computed(() => seriesStore.activeEpisodeId);

function onSelectEpisode(ep: any, index: number) {
  emit('select-episode', ep, index);
}

function setCollapsed(val: boolean) {
  emit('update:isCollapsed', val);
}
</script>

<template>
  <aside
    class="border-r flex flex-col shrink-0 z-10 transition-all duration-300"
    :class="isCollapsed ? 'w-16' : 'w-72'"
    style="border-color: var(--el-border-color); background-color: var(--el-bg-color-overlay);"
  >
    <!-- Collapsed Mini View -->
    <div v-if="isCollapsed" class="p-2 flex-1 flex flex-col items-center overflow-hidden">
      <el-button
        circle
        plain
        size="large"
        icon="Menu"
        class="mb-3"
        @click="setCollapsed(false)"
        :title="t('workspace.expandSidebar', 'Expand Episode Library')"
      />

      <!-- Mini Episodes List -->
      <div class="flex-1 overflow-y-auto space-y-2.5 w-full flex flex-col items-center custom-scrollbar" style="margin-right: -10px">
        <div
          v-for="(ep, idx) in episodesList"
          :key="ep.id"
          @click="onSelectEpisode(ep, idx)"
          class="w-11 h-14 rounded-sm border transition-all cursor-pointer relative overflow-hidden shrink-0 group flex items-center justify-center"
          :class="activeEpisodeId === ep.id ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-neutral-900 border-emerald-500' : 'border-neutral-700 hover:border-neutral-500'"
          :title="`EP #${ep.number}: ${ep.title}`"
        >
          <img
            :src="(ep as any).thumbnail_url || (ep as any).cover_image || (ep.scenes && ep.scenes[0] && (ep.scenes[0].storyboard_frame_url || ep.scenes[0].video_url)) || '/images/dashboard/episode-thumb-default.jpg'"
            :alt="ep.title"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
          <div
            v-if="activeEpisodeId === ep.id && isEpisodeLoading"
            class="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
          >
            <el-icon class="is-loading text-emerald-400 text-sm"><Loading /></el-icon>
          </div>
          <div class="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-end justify-center pb-0.5">
            <span class="text-[9px] font-black text-white font-mono drop-shadow">#{{ ep.number }}</span>
          </div>
        </div>
      </div>

      <!-- Bottom Mini Load Indicator -->
      <div class="pt-2 border-t w-full flex justify-center" style="border-color: var(--el-border-color-light);">
        <el-tag size="small" round type="info" class="!px-1.5 !text-[9px] font-mono">
          {{ episodesList.length }}
        </el-tag>
      </div>
    </div>

    <!-- Expanded Full View -->
    <div v-else class="p-4 flex-1 flex flex-col overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-[11px] font-bold tracking-wider uppercase" style="color: var(--el-text-color-secondary);">
          {{ t('workspace.episodeLibrary') }}
        </h2>
        <div class="flex items-center gap-1">
          <el-button
            circle
            plain
            icon="Menu"
            size="large"
            @click="setCollapsed(true)"
            :title="t('workspace.collapseSidebar', 'Collapse sidebar')"
          />
        </div>
      </div>

      <!-- Episodes Scroll Area -->
      <div class="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
        <div
          v-for="(ep, idx) in episodesList"
          :key="ep.id"
          @click="onSelectEpisode(ep, idx)"
          class="p-2.5 rounded-2xl border transition-all cursor-pointer flex gap-3 group relative overflow-hidden"
          :style="activeEpisodeId === ep.id
            ? 'border-color: var(--el-color-primary); background-color: var(--el-color-primary-light-9);'
            : 'border-color: var(--el-border-color-light); background-color: var(--el-fill-color-light);'"
        >
          <div class="w-16 h-20 rounded-xl overflow-hidden relative shrink-0 bg-neutral-900">
            <img
              :src="(ep as any).thumbnail_url || (ep as any).cover_image || (ep.scenes && ep.scenes[0] && (ep.scenes[0].storyboard_frame_url || ep.scenes[0].video_url)) || '/images/dashboard/episode-thumb-default.jpg'"
              :alt="ep.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            <div
              v-if="activeEpisodeId === ep.id && isEpisodeLoading"
              class="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
            >
              <el-icon class="is-loading text-emerald-400 text-base"><Loading /></el-icon>
            </div>
            <div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white rounded text-[9px] font-mono">
              #{{ ep.number }}
            </div>
          </div>

          <div class="flex flex-col justify-center py-1 flex-1 min-w-0">
            <h3 class="font-bold text-xs truncate" style="color: var(--el-text-color-primary);">{{ ep.title }}</h3>
            <p class="text-[11px] mt-0.5" style="color: var(--el-text-color-secondary);">{{ ep.duration }} • {{ ep.scenes_count }} {{ t('workspace.scenes') || 'scenes' }}</p>
            <div class="flex items-center gap-1.5 mt-2">
              <el-tag type="primary" size="small" round effect="plain">{{ ep.status }}</el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- Batch Queue Status -->
      <div class="mt-4 pt-4 border-t" style="border-color: var(--el-border-color-light);">
        <div class="flex justify-between text-[10px] font-bold tracking-wide mb-2" style="color: var(--el-text-color-secondary);">
          <span>{{ t('workspace.batchQueue') }} ({{ episodesList.length }}/{{ seriesStore.currentSeries?.total_episodes || 24 }})</span>
          <span style="color: var(--el-color-primary);">{{ Math.round((episodesList.length / (seriesStore.currentSeries?.total_episodes || 24)) * 100) }}%</span>
        </div>
        <el-progress
          :percentage="Math.min(100, Math.round((episodesList.length / (seriesStore.currentSeries?.total_episodes || 24)) * 100))"
          :show-text="false"
          :stroke-width="4"
          color="var(--el-color-primary)"
        />
      </div>

      <div class="mt-4 pt-2 border-t" style="border-color: var(--el-border-color-light);">
        <div class="flex justify-between items-end">
          <span class="text-[10px] font-bold tracking-widest uppercase" style="color: var(--el-text-color-secondary);">{{ t('workspace.seriesLoad') }}</span>
          <span class="text-xs font-semibold" style="color: var(--el-text-color-primary);">{{ t('workspace.seriesLoadCount', { count: episodesList.length, total: seriesStore.currentSeries?.total_episodes || 100 }) }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

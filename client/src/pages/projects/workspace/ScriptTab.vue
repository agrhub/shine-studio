<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { useScriptStore } from '@/stores/useScriptStore';
import { toast } from 'vue-sonner';
import http from '@/utils/http';

const emit = defineEmits<{
  (e: 'open-master-script'): void;
  (e: 'extracted'): void;
}>();

const { t } = useI18n();
const seriesStore = useSeriesStore();
const scriptStore = useScriptStore();

const activeEpisode = computed(() => seriesStore.activeEpisode);

// ─── Screenplay Dynamic State ────────────────────────────────────────────────
const screenplayText = ref('');
const isExtracting = ref(false);

watch(
  () => [activeEpisode.value],
  () => {
    const ep = activeEpisode.value;
    if (ep) {
      screenplayText.value = ep.screenplay || '';
    } else {
      screenplayText.value = '';
    }
  },
  { immediate: true, deep: true }
);

async function handleExtractAssets() {
  if (!screenplayText.value.trim()) {
    toast.warning(t('workspace.screenplayRequired', 'Please enter screenplay content first.'));
    return;
  }
  isExtracting.value = true;
  try {
    const sId = seriesStore.currentSeries?.id;
    const ep = activeEpisode.value;
    const epId = ep?.id;

    toast.info(t('workspace.analyzingScreenplay', 'Analyzing screenplay, extracting assets & generating scenes...'));

    const curSeries = seriesStore.currentSeries as any;
    const sPlan = curSeries?.master_plan;
    const targetDuration = Number(sPlan?.totalDurationSeconds) || Number(sPlan?.episodeDurationSeconds) || Number(curSeries?.episode_duration) || 90;

    const result = await scriptStore.analyzeScreenplay({
      screenplay: screenplayText.value,
      series_id: sId,
      episode_id: epId,
      target_duration_seconds: targetDuration,
    });

    // Sync scenes and script in store
    if (result.scenes && result.scenes.length > 0) {
      const dur = result.scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0) || Number(result.total_duration_seconds) || 60;
      if (ep) {
        ep.scenes = result.scenes;
        ep.scenes_count = result.scenes.length || 0;
        ep.screenplay = screenplayText.value;
        ep.duration_seconds = dur;
        ep.duration = seriesStore.formatTime(dur);
        ep.props = result.props;
        ep.locations = result.locations;
        ep.characters = result.characters;
        seriesStore.episodesList = [...seriesStore.episodesList];
      }
      // seriesStore.activeEpisode = {
      //   ...(seriesStore.activeEpisode || {}),
      //   id: ep?.id || epId || '',
      //   number: ep?.number || ep?.episode_number || 1,
      //   title: ep?.title || '',
      //   episode_number: ep?.episode_number || ep?.number || 1,
      //   scenes_count: `${result.scenes.length} scenes`,
      //   status: ep?.status || 'draft',
      //   screenplay: screenplayText.value,
      //   script: ep?.script,
      //   scenes: result.scenes,
      //   characters: result.characters || [],
      //   locations: result.locations || [],
      //   props: result.props || [],
      //   duration_seconds: dur,
      //   duration: seriesStore.formatTime(dur),
      // };
    }

    // Persist full episode state to database
    // if (sId && epId) {
    //   try {
    //     await http.patch(`/series/${sId}/episodes/${epId}`, {
    //       screenplay: screenplayText.value,
    //       characters: result.characters || [],
    //       locations: result.locations || [],
    //       props: result.props || [],
    //       scenes: result.scenes || [],
    //       duration: result.total_duration_seconds,
    //     });
    //   } catch (dbErr) {
    //     console.warn('[handleExtractAssets] Failed to patch episode:', dbErr);
    //   }
    // }

    if (sId) {
      await seriesStore.loadWorkspaceData(sId);
    }

    const sceneCount = result.scenes?.length || 0;
    const charCount = result.characters?.length || 0;
    toast.success(t('workspace.screenplayAnalysisDone', `Analyzed successfully: ${sceneCount} scenes & ${charCount} characters created!`));
    emit('extracted');
  } catch (err: any) {
    toast.error(t('workspace.assetExtractionFailed', 'Screenplay analysis failed') + `: ${err.message}`);
  } finally {
    isExtracting.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Screenplay Master Editor Card -->
    <div class="p-4 rounded-2xl border shadow-soft space-y-3" style="background-color: var(--el-card-bg-color); border-color: var(--el-border-color);">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2" style="color: var(--el-color-primary);">
          <el-icon :size="16"><Document /></el-icon>
          <span class="text-xs font-bold uppercase tracking-wider">{{ t('workspace.screenplayEditor', 'Screenplay Editor') }}</span>
        </div>
        <el-button
          type="primary"
          round
          size="small"
          icon="MagicStick"
          :loading="isExtracting"
          @click="handleExtractAssets"
        >
          {{ t('workspace.extractAssetsBtn', 'Analysis') }}
        </el-button>
      </div>

      <el-input
        v-model="screenplayText"
        type="textarea"
        :rows="20"
        class="font-mono text-xs leading-relaxed"
        :placeholder="t('workspace.screenplayPlaceholder', 'Paste or write your screenplay here in standard screenplay format (# TITLE, ### EXT./INT., **CHARACTER**, etc.)...')"
      />
    </div>
  </div>
</template>

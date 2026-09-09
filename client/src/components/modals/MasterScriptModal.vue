<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { Document, CopyDocument } from '@element-plus/icons-vue';
import { toast } from 'vue-sonner';

const props = defineProps<{
  modelValue: boolean;
  episodeTitle?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { t } = useI18n();
const seriesStore = useSeriesStore();

const dynamicScriptText = computed(() => {
  const scenes = seriesStore.activeEpisode?.scenes;
  if (scenes && Array.isArray(scenes) && scenes.length > 0) {
    return scenes.map((scene: any, idx: number) => {
      const sceneHeader = `[SCENE ${String(scene.index || (idx + 1)).padStart(2, '0')} - ${scene.heading || scene.location || 'LOCATION'}]`;
      const actionText = scene.action ? `\n${scene.action}\n` : '';
      const dialogues = (scene.dialogue || []).map((d: any) => `${d.character ? d.character.toUpperCase() : 'VOICE'}${d.emotion ? ` (${d.emotion})` : ''}\n${d.line}`).join('\n\n');
      return `${sceneHeader}${actionText}\n${dialogues}`;
    }).join('\n\n═══════════════════════════════════════════════════════\n\n');
  }
  return `[SCENE 01 - INT. HIGH-STAKES MICRO-DRAMA CLIMAX - NIGHT]

EXT. LOCATION - NIGHT
Atmospheric lighting accents dramatic tension.

LEAD
The time for deception is over.

RIVAL
You have no proof.`;
});

function copyScript() {
  navigator.clipboard.writeText(dynamicScriptText.value);
  toast.success(t('toast.copySuccess'));
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    :title="t('workspace.masterPlanScriptBreakdown')"
    width="700px"
    class="!rounded-2xl border !bg-[var(--el-bg-color-page)]"
    align-center
    destroy-on-close
  >
    <template #header>
      <div class="flex items-center justify-between pb-2 border-b" style="border-color: var(--el-border-color);">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white" style="background-color: var(--el-color-primary);">
            <el-icon><Document /></el-icon>
          </div>
          <div>
            <h3 class="text-lg font-bold" style="color: var(--el-text-color-primary);">{{ t('workspace.masterPlanScript') }} — {{ props.episodeTitle || seriesStore.activeEpisode?.title || 'Episode Script' }}</h3>
            <p class="text-xs" style="color: var(--el-text-color-secondary);">{{ t('workspace.aiDirectorBreakdown') }}</p>
          </div>
        </div>

        <el-button size="small" :icon="CopyDocument" @click="copyScript">{{ t('common.copy') }}</el-button>
      </div>
    </template>

    <div class="py-4 space-y-4">
      <div class="p-4 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto border" style="background-color: var(--el-fill-color-light); color: var(--el-text-color-primary); border-color: var(--el-border-color);">
        {{ dynamicScriptText }}
      </div>
    </div>

    <template #footer>
      <div class="flex justify-between items-center">
        <el-tag type="success" effect="plain" round class="font-bold">AI VERIFIED</el-tag>
        <el-button type="primary" round class="!font-bold" @click="emit('update:modelValue', false)">
          {{ t('common.done') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

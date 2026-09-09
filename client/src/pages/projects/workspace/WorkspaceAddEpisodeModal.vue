<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { toast } from 'vue-sonner';

const props = defineProps<{
  modelValue: boolean;
  seriesId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'created', episode: any): void;
}>();

const { t } = useI18n();
const seriesStore = useSeriesStore();

const newEpisodeTitle = ref('');
const newEpisodeSynopsis = ref('');
const isSubmitting = ref(false);

async function handleCreate() {
  if (!newEpisodeTitle.value.trim()) {
    toast.error(t('toast.enterEpisodeTitle', 'Please enter an episode title'));
    return;
  }
  isSubmitting.value = true;
  try {
    const formattedEp = await seriesStore.createEpisode(props.seriesId, {
      title: newEpisodeTitle.value,
      synopsis: newEpisodeSynopsis.value,
    });
    if (formattedEp) {
      newEpisodeTitle.value = '';
      newEpisodeSynopsis.value = '';
      emit('update:modelValue', false);
      emit('created', formattedEp);
      toast.success(t('toast.episodeCreated', 'Episode created successfully!'));
    }
  } catch (err: any) {
    toast.error(err.message || 'Failed to create episode');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="t('workspace.addNewEpisode')"
    width="460px"
    class="rounded-2xl"
  >
    <div class="space-y-4">
      <div>
        <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.episodeTitle') }}</label>
        <el-input v-model="newEpisodeTitle" :placeholder="t('workspace.episodeTitlePlaceholder')" />
      </div>
      <div>
        <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.synopsisHook') }}</label>
        <el-input v-model="newEpisodeSynopsis" type="textarea" :rows="3" :placeholder="t('workspace.synopsisPlaceholder')" />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="isSubmitting" @click="handleCreate">{{ t('workspace.createEpisode') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

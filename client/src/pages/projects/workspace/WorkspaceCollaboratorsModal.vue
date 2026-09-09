<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCollaborationStore } from '@/stores/collaborationStore';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const { t } = useI18n();
const collaborationStore = useCollaborationStore();

const inviteEmail = ref('');
const inviteRole = ref('Editor');
const isSubmitting = ref(false);

async function handleInvite() {
  isSubmitting.value = true;
  try {
    const res = await collaborationStore.inviteMember(inviteEmail.value, inviteRole.value);
    if (res) {
      inviteEmail.value = '';
      emit('update:modelValue', false);
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="t('workspace.inviteTeamMember')"
    width="420px"
    class="rounded-2xl"
  >
    <div class="space-y-4">
      <div>
        <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.colleagueEmail') }}</label>
        <el-input v-model="inviteEmail" :placeholder="t('workspace.emailPlaceholder')" />
      </div>
      <div>
        <label class="text-xs font-semibold block mb-1.5" style="color: var(--el-text-color-secondary);">{{ t('workspace.accessRole') }}</label>
        <el-select v-model="inviteRole" class="w-full">
          <el-option label="Editor (Full Pipeline)" value="Editor" />
          <el-option label="Writer (Script & Dialogue)" value="Writer" />
          <el-option label="Viewer (Review Only)" value="Viewer" />
        </el-select>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="isSubmitting" @click="handleInvite">{{ t('workspace.sendInvite') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

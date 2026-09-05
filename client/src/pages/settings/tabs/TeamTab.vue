<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import http from '@/utils/http';

const { t } = useI18n();

const teamMembers = ref<any[]>([]);
const isInviteModalOpen = ref(false);
const newMemberEmail = ref('');
const newMemberRole = ref('Editor');

async function loadTeamMembers() {
  try {
    const res: any = await http.get('/admin/team-members');
    if (res?.data) teamMembers.value = res.data;
  } catch (err) {
    console.error('Failed to fetch team members', err);
  }
}

async function inviteTeamMember() {
  if (!newMemberEmail.value) return;
  try {
    const res: any = await http.post('/admin/team-members', {
      email: newMemberEmail.value,
      role: newMemberRole.value,
    });
    if (res?.data) {
      teamMembers.value.push(res.data);
      newMemberEmail.value = '';
      isInviteModalOpen.value = false;
      toast.success(t('toast.teamMemberInvited'));
    }
  } catch (err: any) {
    toast.error(err?.response?.data?.message || 'Failed to invite member');
  }
}

async function removeTeamMember(id: string) {
  try {
    await http.delete(`/admin/team-members/${id}`);
    teamMembers.value = teamMembers.value.filter(m => m.id !== id);
    toast.success(t('toast.memberRemoved'));
  } catch (err: any) {
    toast.error(err?.response?.data?.message || 'Failed to remove member');
  }
}

onMounted(() => {
  loadTeamMembers();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between pb-6 border-b border-[var(--el-border-color)]">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">
          {{ t('settings.teamMembers') }}
        </h2>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('settings.teamDesc') }}
        </p>
      </div>
      <el-button type="primary" round size="small" @click="isInviteModalOpen = true">
        <el-icon class="mr-1.5"><Plus /></el-icon> {{ t('settings.inviteMember') }}
      </el-button>
    </div>

    <!-- Team Members Table -->
    <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl overflow-hidden shadow-soft">
      <el-table :data="teamMembers.length ? teamMembers : [
        { id: '1', name: 'Tan Do (You)', email: 'dmtan90@gmail.com', role: 'Owner', avatar: '/images/avatars/avatar-default.jpg' },
        { id: '2', name: 'Creative Assistant', email: 'ai-editor@shine.studio', role: 'Editor', avatar: '/images/avatars/avatar-assistant.jpg' },
      ]" style="width: 100%">
        <el-table-column :label="t('common.member')" min-width="240">
          <template #default="{ row }">
            <div class="flex items-center gap-3">
              <img :src="row.avatar" class="w-8 h-8 rounded-full object-cover" />
              <div>
                <div class="font-bold text-xs text-[var(--el-text-color-primary)]">{{ row.name }}</div>
                <div class="text-[11px] text-[var(--el-text-color-secondary)]">{{ row.email }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="role" :label="t('common.role')" width="140">
          <template #default="{ row }">
            <el-tag size="small" :type="row.role === 'Owner' ? 'primary' : 'info'" round effect="plain">
              {{ row.role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="120" align="right">
          <template #default="{ row }">
            <el-button v-if="row.role !== 'Owner'" type="danger" link size="small" @click="removeTeamMember(row.id)">
              {{ t('common.remove') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Invite Member Modal -->
    <el-dialog v-model="isInviteModalOpen" :title="t('settings.inviteStudioMember')" width="460px" destroy-on-close align-center class="rounded-2xl">
      <div class="space-y-4 py-2">
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('common.emailAddress') }}</label>
          <el-input v-model="newMemberEmail" placeholder="crew@studio.ai" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.workspaceRole') }}</label>
          <el-select v-model="newMemberRole" class="w-full" size="small">
            <el-option :label="t('settings.roleEditorDesc')" value="Editor" />
            <el-option :label="t('settings.roleViewerDesc')" value="Viewer" />
            <el-option :label="t('settings.roleAdminDesc')" value="Admin" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round size="small" @click="isInviteModalOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" round size="small" @click="inviteTeamMember">{{ t('settings.sendInvitation') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { ElMessageBox } from 'element-plus';
import http from '@/utils/http';

const { t } = useI18n();

const isLoading = ref(false);
const userDirectory = ref<any[]>([]);
const totalUsers = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

const searchQuery = ref('');
const tierFilter = ref('');
const roleFilter = ref('');
const statusFilter = ref('');

// Load users with server-side pagination & filtering
async function loadUsers() {
  isLoading.value = true;
  try {
    const params: any = {
      page: currentPage.value,
      limit: pageSize.value,
    };
    if (searchQuery.value.trim()) params.search = searchQuery.value.trim();
    if (tierFilter.value) params.tier = tierFilter.value;
    if (roleFilter.value) params.role = roleFilter.value;
    if (statusFilter.value) params.status = statusFilter.value;

    const res: any = await http.get('/admin/users', { params });
    if (res?.data?.users) {
      userDirectory.value = res.data.users;
      totalUsers.value = res.data.total ?? res.data.users.length;
    } else if (Array.isArray(res?.data)) {
      userDirectory.value = res.data;
      totalUsers.value = res.data.length;
    } else if (Array.isArray(res)) {
      userDirectory.value = res;
      totalUsers.value = res.length;
    }
  } catch (err: any) {
    console.error('Failed to load user directory', err);
    toast.error(t('toast.userDirectoryLoadError'));
  } finally {
    isLoading.value = false;
  }
}

function handleSearch() {
  currentPage.value = 1;
  loadUsers();
}

function handlePageChange(newPage: number) {
  currentPage.value = newPage;
  loadUsers();
}

function handleSizeChange(newSize: number) {
  pageSize.value = newSize;
  currentPage.value = 1;
  loadUsers();
}

// Watch filters to trigger reload
watch([tierFilter, roleFilter, statusFilter], () => {
  currentPage.value = 1;
  loadUsers();
});

// View Details Drawer
const isDrawerOpen = ref(false);
const selectedUser = ref<any>(null);
const isDrawerLoading = ref(false);
const userCreditHistory = ref<any[]>([]);

async function openUserDetails(u: any) {
  selectedUser.value = u;
  isDrawerOpen.value = true;
  isDrawerLoading.value = true;
  try {
    const res: any = await http.get(`/admin/users/${u.id}`);
    if (res?.data) {
      selectedUser.value = res.data;
      userCreditHistory.value = res.data.creditHistory || [];
    }
  } catch (err: any) {
    console.error('Failed to fetch user details', err);
  } finally {
    isDrawerLoading.value = false;
  }
}

// Lock / Unlock Account
async function toggleUserLock(u: any) {
  const isLocked = u.status === 'locked' || u.is_active === false;
  const actionText = isLocked ? t('adminUsers.confirmUnlock') : t('adminUsers.confirmLock');

  try {
    await ElMessageBox.confirm(actionText, isLocked ? t('adminUsers.unlockAccount') : t('adminUsers.lockAccount'), {
      confirmButtonText: isLocked ? t('adminUsers.unlockAccount') : t('adminUsers.lockAccount'),
      cancelButtonText: t('common.cancel'),
      type: isLocked ? 'info' : 'warning',
    });

    const newStatus = isLocked ? 'active' : 'locked';
    await http.patch(`/admin/users/${u.id}/status`, {
      status: newStatus,
      is_active: newStatus === 'active',
    });

    u.status = newStatus;
    u.is_active = newStatus === 'active';
    if (selectedUser.value?.id === u.id) {
      selectedUser.value.status = newStatus;
      selectedUser.value.is_active = newStatus === 'active';
    }

    toast.success(isLocked ? t('toast.userUnlockedSuccess') : t('toast.userLockedSuccess'));
  } catch (err: any) {
    if (err !== 'cancel') {
      toast.error(err?.response?.data?.message || t('toast.userDirectoryLoadError'));
    }
  }
}

// Edit Role Modal State
const isEditRoleModalOpen = ref(false);
const editUserRoleValue = ref('user');
const isUpdatingRole = ref(false);

function openEditUserRole(u: any) {
  selectedUser.value = u;
  editUserRoleValue.value = u.role || 'user';
  isEditRoleModalOpen.value = true;
}

async function saveUserRole() {
  if (!selectedUser.value) return;
  isUpdatingRole.value = true;
  try {
    await http.patch(`/admin/users/${selectedUser.value.id}/role`, {
      role: editUserRoleValue.value,
    });
    selectedUser.value.role = editUserRoleValue.value;
    toast.success(t('toast.userRoleUpdated'));
    isEditRoleModalOpen.value = false;
    loadUsers();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || t('toast.userDirectoryLoadError'));
  } finally {
    isUpdatingRole.value = false;
  }
}

// Top-Up / Adjust Credits Modal State
const isTopupModalOpen = ref(false);
const topupAmount = ref(500);
const topupReason = ref('');
const isUpdatingCredits = ref(false);

function openTopupModal(u: any) {
  selectedUser.value = u;
  topupAmount.value = 500;
  topupReason.value = 'Admin Credit Grant';
  isTopupModalOpen.value = true;
}

function setQuickTopup(amount: number) {
  topupAmount.value = amount;
}

async function saveUserTopup() {
  if (!selectedUser.value) return;
  isUpdatingCredits.value = true;
  try {
    const res: any = await http.post(`/admin/users/${selectedUser.value.id}/topup`, {
      amount: topupAmount.value,
      type: 'add',
      reason: topupReason.value.trim() || 'Admin top-up',
    });

    const newCredits = res?.data?.credits ?? (selectedUser.value.credits + topupAmount.value);
    selectedUser.value.credits = newCredits;
    selectedUser.value.creditBalance = newCredits;

    toast.success(t('toast.userTopupSuccess'));
    isTopupModalOpen.value = false;
    loadUsers();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || t('toast.userDirectoryLoadError'));
  } finally {
    isUpdatingCredits.value = false;
  }
}

// Delete User
async function deleteUser(u: any) {
  try {
    await ElMessageBox.confirm(t('adminUsers.confirmDelete'), t('adminUsers.deleteUser'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'error',
    });

    await http.delete(`/admin/users/${u.id}`);
    toast.success(t('toast.userDeletedSuccess'));
    if (isDrawerOpen.value && selectedUser.value?.id === u.id) {
      isDrawerOpen.value = false;
    }
    loadUsers();
  } catch (err: any) {
    if (err !== 'cancel') {
      toast.error(err?.response?.data?.message || t('toast.userDirectoryLoadError'));
    }
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

onMounted(() => {
  loadUsers();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-[var(--el-border-color)]">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)] flex items-center gap-2">
          <el-icon class="text-amber-500"><Lock /></el-icon>
          {{ t('adminUsers.title') }}
        </h2>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('adminUsers.subtitle') }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <el-tag type="info" size="small" round effect="plain">
          {{ totalUsers }} {{ t('common.users') }}
        </el-tag>
        <el-button size="small" round :loading="isLoading" @click="loadUsers">
          <el-icon class="mr-1.5"><Refresh /></el-icon> {{ t('common.refresh') }}
        </el-button>
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      <el-input
        v-model="searchQuery"
        :placeholder="t('adminUsers.searchPlaceholder')"
        clearable
        size="small"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix>
          <el-icon class="text-gray-400"><Search /></el-icon>
        </template>
      </el-input>

      <el-select v-model="tierFilter" :placeholder="t('adminUsers.filterTier')" clearable size="small">
        <el-option :label="t('adminUsers.allTiers')" value="" />
        <el-option label="Free Tier" value="free" />
        <el-option label="Creator Pro" value="pro" />
        <el-option label="Enterprise" value="enterprise" />
      </el-select>

      <el-select v-model="roleFilter" :placeholder="t('adminUsers.filterRole')" clearable size="small">
        <el-option :label="t('adminUsers.allRoles')" value="" />
        <el-option :label="t('adminUsers.roleAdmin')" value="admin" />
        <el-option :label="t('adminUsers.roleCreator')" value="creator" />
        <el-option :label="t('adminUsers.roleUser')" value="user" />
      </el-select>

      <el-select v-model="statusFilter" :placeholder="t('adminUsers.filterStatus')" clearable size="small">
        <el-option :label="t('adminUsers.allStatus')" value="" />
        <el-option :label="t('adminUsers.statusActive')" value="active" />
        <el-option :label="t('adminUsers.statusLocked')" value="locked" />
      </el-select>
    </div>

    <!-- User Directory Table -->
    <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl overflow-hidden shadow-soft">
      <el-table v-loading="isLoading" :data="userDirectory" style="width: 100%">
        <el-table-column :label="t('adminUsers.userDetails')" min-width="260">
          <template #default="{ row }">
            <div class="flex items-center gap-3 py-1 cursor-pointer" @click="openUserDetails(row)">
              <img
                :src="row.avatarUrl || '/images/avatars/avatar-default.jpg'"
                class="w-9 h-9 rounded-full bg-surface-container object-cover border border-white/10 shrink-0"
              />
              <div class="min-w-0">
                <div class="font-bold text-xs text-[var(--el-text-color-primary)] truncate hover:text-primary transition-colors">
                  {{ row.name }}
                </div>
                <div class="text-[11px] text-[var(--el-text-color-secondary)] truncate">{{ row.email }}</div>
                <div class="text-[10px] text-gray-500 font-mono">ID: {{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('adminUsers.planTier')" width="130">
          <template #default="{ row }">
            <el-tag size="small" type="warning" round effect="plain">
              {{ (row.tier || 'FREE').toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('adminUsers.role')" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="row.role === 'admin' ? 'danger' : row.role === 'creator' ? 'success' : 'info'" round effect="plain">
              {{ row.role === 'admin' ? t('adminUsers.roleAdmin') : row.role === 'creator' ? t('adminUsers.roleCreator') : t('adminUsers.roleUser') }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('adminUsers.credits')" width="140">
          <template #default="{ row }">
            <div class="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-400">
              <el-icon class="text-amber-500 text-[11px]"><Coin /></el-icon>
              <span>{{ (row.creditBalance ?? row.credits ?? 0).toLocaleString() }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('adminUsers.status')" width="110">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.status === 'locked' || row.is_active === false ? 'danger' : 'success'"
              round
              effect="plain"
            >
              {{ row.status === 'locked' || row.is_active === false ? t('adminUsers.statusLocked') : t('adminUsers.statusActive') }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('adminUsers.twoFactor')" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.two_factor_enabled ? 'success' : 'info'" round effect="plain">
              {{ row.two_factor_enabled ? 'ON' : 'OFF' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('adminUsers.actions')" width="230" align="right">
          <template #default="{ row }">
            <div class="flex items-center justify-end gap-1">
              <el-tooltip :content="t('adminUsers.viewDetails')" placement="top">
                <el-button type="info" link size="small" @click="openUserDetails(row)">
                  <el-icon><View /></el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip :content="t('adminUsers.topupCredits')" placement="top">
                <el-button type="warning" link size="small" @click="openTopupModal(row)">
                  <el-icon><Coin /></el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip :content="t('adminUsers.editRole')" placement="top">
                <el-button type="primary" link size="small" @click="openEditUserRole(row)">
                  <el-icon><User /></el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip :content="row.status === 'locked' || row.is_active === false ? t('adminUsers.unlockAccount') : t('adminUsers.lockAccount')" placement="top">
                <el-button
                  :type="row.status === 'locked' || row.is_active === false ? 'success' : 'danger'"
                  link
                  size="small"
                  @click="toggleUserLock(row)"
                >
                  <el-icon v-if="row.status === 'locked' || row.is_active === false"><Unlock /></el-icon>
                  <el-icon v-else><Lock /></el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip :content="t('adminUsers.deleteUser')" placement="top">
                <el-button type="danger" link size="small" @click="deleteUser(row)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="p-4 flex justify-between items-center border-t border-[var(--el-border-color)]">
        <div class="text-xs text-[var(--el-text-color-secondary)]">
          {{ t('settings.totalUsersLabel') }} {{ totalUsers }}
        </div>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="totalUsers"
          layout="sizes, prev, pager, next, jumper"
          size="small"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <!-- User Profile & Activity Drawer -->
    <el-drawer
      v-model="isDrawerOpen"
      :title="t('adminUsers.userDrawerTitle')"
      size="480px"
      direction="rtl"
      destroy-on-close
    >
      <div v-loading="isDrawerLoading" class="space-y-6">
        <div v-if="selectedUser" class="flex items-center gap-4 p-4 rounded-2xl bg-surface-container border border-white/5">
          <img
            :src="selectedUser.avatarUrl || selectedUser.avatar || '/images/avatars/avatar-default.jpg'"
            class="w-14 h-14 rounded-full object-cover border-2 border-primary/20 shrink-0"
          />
          <div class="min-w-0 flex-1">
            <h3 class="font-bold text-base text-[var(--el-text-color-primary)] truncate">{{ selectedUser.name }}</h3>
            <p class="text-xs text-[var(--el-text-color-secondary)] truncate">{{ selectedUser.email }}</p>
            <div class="flex items-center gap-2 mt-2">
              <el-tag size="small" type="warning" round effect="plain">{{ (selectedUser.tier || 'FREE').toUpperCase() }}</el-tag>
              <el-tag size="small" :type="selectedUser.role === 'admin' ? 'danger' : 'info'" round effect="plain">{{ selectedUser.role || 'user' }}</el-tag>
              <el-tag size="small" :type="selectedUser.status === 'locked' ? 'danger' : 'success'" round effect="plain">{{ selectedUser.status || 'active' }}</el-tag>
            </div>
          </div>
        </div>

        <!-- Quick Metrics -->
        <div v-if="selectedUser" class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-surface-container border border-white/5">
            <div class="text-[11px] text-[var(--el-text-color-secondary)] uppercase font-semibold">{{ t('adminUsers.credits') }}</div>
            <div class="text-lg font-mono font-bold text-amber-400 mt-0.5">
              {{ (selectedUser.credits ?? selectedUser.creditBalance ?? 0).toLocaleString() }}
            </div>
          </div>
          <div class="p-3 rounded-xl bg-surface-container border border-white/5">
            <div class="text-[11px] text-[var(--el-text-color-secondary)] uppercase font-semibold">{{ t('adminUsers.twoFactor') }}</div>
            <div class="text-lg font-bold mt-0.5" :class="selectedUser.two_factor_enabled ? 'text-emerald-400' : 'text-gray-400'">
              {{ selectedUser.two_factor_enabled ? 'ENABLED' : 'DISABLED' }}
            </div>
          </div>
          <div class="p-3 rounded-xl bg-surface-container border border-white/5 col-span-2">
            <div class="text-[11px] text-[var(--el-text-color-secondary)] uppercase font-semibold">{{ t('adminUsers.joinedDate') }}</div>
            <div class="text-xs font-mono text-[var(--el-text-color-primary)] mt-0.5">
              {{ formatDate(selectedUser.created_at || selectedUser.createdAt) }}
            </div>
          </div>
        </div>

        <!-- Credit Activity History -->
        <div>
          <h4 class="text-sm font-semibold text-[var(--el-text-color-primary)] flex items-center gap-2 mb-3">
            <el-icon class="text-amber-500"><Coin /></el-icon>
            {{ t('adminUsers.creditHistory') }}
          </h4>

          <div v-if="userCreditHistory.length > 0" class="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            <div
              v-for="tx in userCreditHistory"
              :key="tx.id"
              class="p-2.5 rounded-xl bg-surface-container border border-white/5 flex items-center justify-between text-xs"
            >
              <div>
                <div class="font-semibold text-[var(--el-text-color-primary)]">{{ tx.activity || tx.type || 'Transaction' }}</div>
                <div class="text-[10px] text-[var(--el-text-color-secondary)]">{{ tx.details || formatDate(tx.created_at) }}</div>
              </div>
              <div class="font-mono font-bold text-right" :class="Number(tx.amount) >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                {{ Number(tx.amount) >= 0 ? `+${tx.amount}` : tx.amount }}
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-[var(--el-text-color-secondary)] italic p-4 text-center bg-surface-container/50 rounded-xl border border-white/5">
            {{ t('adminUsers.noCreditHistory') }}
          </div>
        </div>

        <!-- Drawer Action Buttons -->
        <div v-if="selectedUser" class="pt-4 border-t border-white/10 flex flex-wrap gap-2">
          <el-button type="warning" round size="small" @click="openTopupModal(selectedUser)">
            <el-icon class="mr-1"><Coin /></el-icon> {{ t('adminUsers.topupCredits') }}
          </el-button>
          <el-button type="primary" round size="small" @click="openEditUserRole(selectedUser)">
            <el-icon class="mr-1"><User /></el-icon> {{ t('adminUsers.editRole') }}
          </el-button>
          <el-button
            :type="selectedUser.status === 'locked' || selectedUser.is_active === false ? 'success' : 'danger'"
            round
            size="small"
            @click="toggleUserLock(selectedUser)"
          >
            <el-icon class="mr-1"><Lock /></el-icon>
            {{ selectedUser.status === 'locked' || selectedUser.is_active === false ? t('adminUsers.unlockAccount') : t('adminUsers.lockAccount') }}
          </el-button>
        </div>
      </div>
    </el-drawer>

    <!-- Top-Up Credits Modal -->
    <el-dialog
      v-model="isTopupModalOpen"
      :title="t('adminUsers.topupTitle')"
      width="440px"
      destroy-on-close
      align-center
      class="rounded-2xl"
    >
      <div class="space-y-4 py-2">
        <p class="text-xs text-[var(--el-text-color-secondary)]">
          {{ t('adminUsers.topupDesc', { name: selectedUser?.name || selectedUser?.email }) }}
        </p>

        <!-- Quick Chips -->
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('adminUsers.quickAdd') }}</label>
          <div class="flex flex-wrap gap-2">
            <el-button
              v-for="amt in [100, 500, 1000, 5000, 10000]"
              :key="amt"
              size="small"
              round
              :type="topupAmount === amt ? 'warning' : 'info'"
              effect="plain"
              @click="setQuickTopup(amt)"
            >
              +{{ amt.toLocaleString() }}
            </el-button>
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('adminUsers.customAmount') }}</label>
          <el-input-number v-model="topupAmount" :min="1" :step="100" class="!w-full" size="small" />
        </div>

        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('adminUsers.reason') }}</label>
          <el-input v-model="topupReason" :placeholder="t('adminUsers.topupReasonPlaceholder')" size="small" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round size="small" @click="isTopupModalOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="warning" round size="small" :loading="isUpdatingCredits" @click="saveUserTopup">
            {{ t('adminUsers.saveCredits') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Edit User Role Modal -->
    <el-dialog
      v-model="isEditRoleModalOpen"
      :title="t('adminUsers.editRoleTitle')"
      width="440px"
      destroy-on-close
      align-center
      class="rounded-2xl"
    >
      <div class="space-y-4 py-2">
        <p class="text-xs text-[var(--el-text-color-secondary)]">
          {{ t('adminUsers.editRoleDesc', { name: selectedUser?.name || selectedUser?.email }) }}
        </p>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('adminUsers.role') }}</label>
          <el-select v-model="editUserRoleValue" class="w-full" size="small">
            <el-option :label="t('adminUsers.roleAdminDesc')" value="admin" />
            <el-option :label="t('adminUsers.roleCreatorDesc')" value="creator" />
            <el-option :label="t('adminUsers.roleUserDesc')" value="user" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round size="small" @click="isEditRoleModalOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" round size="small" :loading="isUpdatingRole" @click="saveUserRole">
            {{ t('adminUsers.saveRole') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

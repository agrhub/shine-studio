<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { ElMessageBox } from 'element-plus';
import http from '@/utils/http';

const props = defineProps<{
  config: any;
}>();

const emit = defineEmits<{
  (e: 'save'): void;
}>();

const { t } = useI18n();
const isSaving = ref(false);

const uniqueFlowAccounts = computed(() => {
  const list = props.config?.flowAccounts || [];
  const map = new Map<string, any>();
  for (const acc of list) {
    const emailKey = (acc.email || '').trim().toLowerCase();
    if (!emailKey) continue;
    const existing = map.get(emailKey);
    const accTime = new Date(acc.last_synced_at || acc.lastSyncedAt || 0).getTime();
    const existingTime = existing ? new Date(existing.last_synced_at || existing.lastSyncedAt || 0).getTime() : 0;
    if (!existing || accTime >= existingTime) {
      map.set(emailKey, acc);
    }
  }
  return Array.from(map.values());
});

function formatLastSynced(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  } catch {
    return dateStr;
  }
}

function handleSave() {
  isSaving.value = true;
  emit('save');
  setTimeout(() => {
    isSaving.value = false;
  }, 600);
}

// Flow Cookie Add Dialog State
const isAddFlowModalOpen = ref(false);
const newFlowEmail = ref('');
const newFlowCookie = ref('');
const isSubmittingFlow = ref(false);

// Flow Token Update Dialog State
const isUpdateFlowModalOpen = ref(false);
const updatingFlowAccount = ref<any>(null);
const updateFlowCookie = ref('');
const isUpdatingFlow = ref(false);

function openUpdateFlowTokenModal(acc: any) {
  updatingFlowAccount.value = acc;
  updateFlowCookie.value = '';
  isUpdateFlowModalOpen.value = true;
}

function extractFlowCookieToken(rawInput: string): string {
  if (!rawInput) return '';
  let str = String(rawInput).trim();
  str = str.replace(/^(Set-Cookie|Cookie):\s*/i, '');

  const priorityKeys = [
    '__Secure-next-auth.session-token',
    '__Host-next-auth.session-token',
    'next-auth.session-token',
    '__Secure-1PSID',
    '__Secure-3PSID',
    'sessionToken',
    'session_token',
    'session-token',
    'token',
    'session',
  ];

  for (const key of priorityKeys) {
    const escapedKey = key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const match = str.match(new RegExp(`(?:^|[;\\s,])${escapedKey}=([^;\\r\\n,]+)`, 'i'));
    if (match && match[1]) {
      try { return decodeURIComponent(match[1].trim()); } catch { return match[1].trim(); }
    }
  }

  const firstPairMatch = str.match(/^([a-zA-Z0-9_\-\.]+)=([^;\\r\\n,]+)/);
  if (firstPairMatch && firstPairMatch[2]) {
    try { return decodeURIComponent(firstPairMatch[2].trim()); } catch { return firstPairMatch[2].trim(); }
  }

  if (str.includes(';')) {
    const parts = str.split(';').map(p => p.trim());
    for (const part of parts) {
      if (part && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)=?/i.test(part)) {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
          const val = part.substring(eqIdx + 1).trim();
          try { return decodeURIComponent(val); } catch { return val; }
        }
        try { return decodeURIComponent(part); } catch { return part; }
      }
    }
  }

  return str;
}

async function handleUpdateFlowToken() {
  const cookie = extractFlowCookieToken(updateFlowCookie.value);
  if (!cookie || !updatingFlowAccount.value) {
    toast.warning(t('toast.enterFlowCredentials', 'Please enter a valid session cookie or token'));
    toast.error(t('toast.enterFlowCredentials', 'Please enter a valid session cookie or token'));
    return;
  }
  isUpdatingFlow.value = true;
  try {
    const res: any = await http.put(`/admin/flow-accounts/${updatingFlowAccount.value.id}`, {
      email: updatingFlowAccount.value.email,
      cookie,
    });
    updateFlowCookie.value = '';
    isUpdateFlowModalOpen.value = false;
    toast.success(t('toast.flowTokenUpdated', 'Flow account token refreshed successfully!'));
    if (updatingFlowAccount.value) {
      updatingFlowAccount.value.status = 'ACTIVE';
      updatingFlowAccount.value.lastSyncedAt = new Date().toISOString();
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Update failed';
    toast.error(msg);
  } finally {
    isUpdatingFlow.value = false;
  }
}

async function handleAddFlowAccount() {
  const cookie = extractFlowCookieToken(newFlowCookie.value);
  const email = newFlowEmail.value.trim();
  if (!email || !cookie) {
    toast.error(t('toast.enterFlowCredentials', 'Please enter both email and session token/cookie'));
    return;
  }
  isSubmittingFlow.value = true;
  try {
    const res: any = await http.post('/admin/flow-accounts', {
      email,
      cookie
    });
    const accData = res?.data || res?.account || res;
    if (!props.config.flowAccounts) props.config.flowAccounts = [];
    const newEntry = {
      id: accData?.id || `flow_${email.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      email,
      credits: accData?.credits_remaining !== undefined ? accData.credits_remaining : (accData?.credits || 100),
      status: accData?.status || 'ACTIVE',
      lastSyncedAt: new Date().toISOString(),
    };

    const existingIdx = props.config.flowAccounts.findIndex(
      (a: any) => (a.email || '').trim().toLowerCase() === email.toLowerCase() || a.id === newEntry.id
    );

    if (existingIdx !== -1) {
      props.config.flowAccounts[existingIdx] = newEntry;
    } else {
      props.config.flowAccounts.push(newEntry);
    }

    newFlowEmail.value = '';
    newFlowCookie.value = '';
    isAddFlowModalOpen.value = false;
    toast.success(t('toast.flowAccountAdded', 'Flow Google Account added successfully!'));
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Failed to add flow account';
    toast.error(msg);
  } finally {
    isSubmittingFlow.value = false;
  }
}

async function removeFlowAccount(id: string, email?: string) {
  try {
    await http.delete(`/admin/flow-accounts/${id}`);
    if (props.config.flowAccounts) {
      props.config.flowAccounts = props.config.flowAccounts.filter(
        (a: any) => a.id !== id && (!email || (a.email || '').trim().toLowerCase() !== email.toLowerCase())
      );
    }
    toast.success(t('toast.flowAccountRemoved', 'Flow account removed from pool'));
  } catch (err: any) {
    const msg = err?.response?.data?.message || 'Failed to delete flow account';
    toast.error(msg);
  }
}

const refreshingAccountId = ref<string | null>(null);
const isSyncingAllFlow = ref(false);

async function handleRefreshAccount(acc: any) {
  if (!acc || !acc.id) return;
  refreshingAccountId.value = acc.id;
  try {
    const res: any = await http.post(`/admin/flow-accounts/${acc.id}/refresh`);
    const data = res?.data || res?.account || res;
    const nowIso = new Date().toISOString();
    acc.last_synced_at = data?.last_synced_at || nowIso;
    acc.lastSyncedAt = acc.last_synced_at;
    if (res?.success || res?.code === 200) {
      toast.success(t('toast.flowTokenRefreshed', `Token for ${acc.email} refreshed successfully!`));
      acc.status = data?.status || 'ACTIVE';
      if (data?.credits_remaining !== undefined) acc.credits = data.credits_remaining;
      else if (data?.credits !== undefined) acc.credits = data.credits;
    } else {
      acc.status = 'UNAUTHORIZED';
      toast.error(res?.message || t('toast.flowTokenExpired', 'Session expired. Please update token.'));
    }
  } catch (err: any) {
    acc.status = 'UNAUTHORIZED';
    acc.last_synced_at = new Date().toISOString();
    acc.lastSyncedAt = acc.last_synced_at;
    const msg = err?.response?.data?.message || err?.message || 'Refresh failed';
    toast.error(msg);
  } finally {
    refreshingAccountId.value = null;
  }
}

async function handleSyncAllFlowAccounts() {
  isSyncingAllFlow.value = true;
  try {
    const res: any = await http.post('/admin/flow-accounts/sync');
    const list = res?.accounts || res?.data || [];
    if (list.length > 0 && props.config.flowAccounts) {
      const nowIso = new Date().toISOString();
      list.forEach((updated: any) => {
        const found = props.config.flowAccounts.find(
          (a: any) => a.id === updated.id || a.email?.toLowerCase() === updated.email?.toLowerCase()
        );
        if (found) {
          found.credits = updated.credits_remaining ?? updated.credits ?? found.credits;
          found.status = updated.status ?? found.status;
          found.last_synced_at = updated.last_synced_at || nowIso;
          found.lastSyncedAt = found.last_synced_at;
        }
      });
    }
    toast.success(t('toast.flowPoolSynced', 'All Flow accounts synced!'));
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Sync failed';
    toast.error(msg);
  } finally {
    isSyncingAllFlow.value = false;
  }
}

// ─── Antigravity Multi-Account OAuth Pool ──────────────────────────────────────────
const antigravityAccounts = ref<any[]>([]);
const isLoadingAntigravity = ref(false);
const isSyncingAllAntigravity = ref(false);
const refreshingAntigravityId = ref<string | null>(null);
const isTestingAntigravity = ref(false);

async function fetchAntigravityAccounts() {
  isLoadingAntigravity.value = true;
  try {
    const res: any = await http.get('/admin/antigravity-accounts');
    antigravityAccounts.value = res?.accounts || res?.data || [];
  } catch (err: any) {
    console.warn('[ApiModelsTab] Failed to fetch Antigravity accounts:', err);
  } finally {
    isLoadingAntigravity.value = false;
  }
}

function handleConnectAntigravity() {
  const width = 550;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  const popup = window.open(
    '/api/antigravity-accounts/oauth/authorize',
    'antigravity_oauth',
    `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`
  );

  if (!popup) {
    toast.error(t('toast.popupBlocked', 'Popup blocked. Please allow popups for this site.'));
    return;
  }

  const handleOAuthMessage = (event: MessageEvent) => {
    if (event.data?.type === 'ANTIGRAVITY_AUTH_SUCCESS') {
      window.removeEventListener('message', handleOAuthMessage);
      toast.success(t('toast.antigravityConnected', 'Antigravity account connected successfully!'));
      fetchAntigravityAccounts();
    } else if (event.data?.type === 'ANTIGRAVITY_AUTH_ERROR') {
      window.removeEventListener('message', handleOAuthMessage);
      toast.error(event.data.error || t('toast.antigravityAuthFailed', 'Antigravity authorization failed'));
    }
  };

  window.addEventListener('message', handleOAuthMessage);
}

async function handleRefreshAntigravity(acc: any) {
  if (!acc?.id) return;
  refreshingAntigravityId.value = acc.id;
  try {
    await http.post(`/admin/antigravity-accounts/${acc.id}/refresh`);
    toast.success(t('toast.antigravityTokenRefreshed', 'Antigravity account refreshed successfully!'));
    fetchAntigravityAccounts();
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Refresh failed');
  } finally {
    refreshingAntigravityId.value = null;
  }
}

async function handleSyncAllAntigravity() {
  isSyncingAllAntigravity.value = true;
  try {
    await http.post('/admin/antigravity-accounts/sync-all');
    toast.success(t('toast.antigravitySyncAllSuccess', 'All Antigravity accounts synchronized successfully!'));
    fetchAntigravityAccounts();
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Sync failed');
  } finally {
    isSyncingAllAntigravity.value = false;
  }
}

async function removeAntigravityAccount(id: string) {
  try {
    await http.delete(`/admin/antigravity-accounts/${id}`);
    antigravityAccounts.value = antigravityAccounts.value.filter((a) => a.id !== id);
    toast.success(t('toast.antigravityAccountRemoved', 'Antigravity account removed from pool'));
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Failed to delete account');
  }
}

async function handleTestAntigravity() {
  isTestingAntigravity.value = true;
  try {
    const res: any = await http.post('/admin/antigravity-accounts/test-generate', {
      prompt: 'Generate a short 1-sentence confirmation that the Antigravity multi-account pool is live and operational.',
    });
    if (res?.success && res?.text) {
      toast.success(t('toast.antigravityTestSuccess', 'Antigravity test successful! Response: ') + res.text.slice(0, 100));
    } else {
      toast.info('Antigravity responded: ' + JSON.stringify(res));
    }
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Antigravity test failed');
  } finally {
    isTestingAntigravity.value = false;
  }
}

const syncingQuotasAccountId = ref<string | null>(null);

async function promptEditProjectId(acc: any) {
  try {
    const { value } = await ElMessageBox.prompt(
      t('settings.editProjectIdPrompt', 'Enter Google Cloud Project ID (e.g. gcp-project-405602, or aicode-consumers):'),
      t('settings.editProjectId', 'Edit Project ID'),
      {
        confirmButtonText: t('common.save', 'Save'),
        cancelButtonText: t('common.cancel', 'Cancel'),
        inputValue: acc.project_id || 'aicode-consumers',
        inputPattern: /^[a-zA-Z0-9_.-]+$/,
        inputErrorMessage: 'Invalid project ID format (letters, numbers, hyphens, dots, underscores only)',
      }
    );
    if (value !== undefined) {
      await http.patch(`/admin/antigravity-accounts/${acc.id}/project`, { projectId: value.trim() });
      acc.project_id = value.trim();
      toast.success(t('toast.projectIdUpdated', 'Project ID updated successfully!'));
    }
  } catch (err: any) {
    if (err !== 'cancel') {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to update project ID');
    }
  }
}

async function handleSyncQuotas(acc: any) {
  syncingQuotasAccountId.value = acc.id;
  try {
    const res: any = await http.post(`/admin/antigravity-accounts/${acc.id}/sync-quotas`);
    const count = res?.models?.length || 0;
    toast.success(t('toast.antigravityQuotasSynced', `Synced ${count} models and quotas!`));
    fetchAntigravityAccounts();
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Failed to sync quotas');
  } finally {
    syncingQuotasAccountId.value = null;
  }
}

// ─── Antigravity Model Quota Dialog State & Handlers ─────────────────────────────
const isQuotaDialogOpen = ref(false);
const selectedQuotaAccount = ref<any>(null);
const isSyncingDialogQuotas = ref(false);

function openQuotaDialog(acc: any) {
  selectedQuotaAccount.value = acc;
  isQuotaDialogOpen.value = true;
  if (!acc.available_models || acc.available_models.length === 0) {
    syncDialogQuotas();
  }
}

async function syncDialogQuotas() {
  if (!selectedQuotaAccount.value?.id) return;
  isSyncingDialogQuotas.value = true;
  try {
    const res: any = await http.post(`/admin/antigravity-accounts/${selectedQuotaAccount.value.id}/sync-quotas`);
    const models = res?.models || [];
    selectedQuotaAccount.value.available_models = models;
    selectedQuotaAccount.value.last_synced_at = new Date().toISOString();

    // Update in local accounts list
    const found = antigravityAccounts.value.find((a) => a.id === selectedQuotaAccount.value.id);
    if (found) {
      found.available_models = models;
      found.last_synced_at = selectedQuotaAccount.value.last_synced_at;
    }
    toast.success(t('toast.antigravityQuotasSynced', `Synced ${models.length} models and quotas!`));
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Failed to sync quotas');
  } finally {
    isSyncingDialogQuotas.value = false;
  }
}

function getQuotaBarColor(pct: number = 100): string {
  if (pct > 50) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
  if (pct >= 20) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
  return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
}

function getQuotaTextColor(pct: number = 100): string {
  if (pct > 50) return 'text-emerald-400';
  if (pct >= 20) return 'text-amber-400';
  return 'text-rose-400';
}

function formatResetTime(timeStr?: string): string {
  if (!timeStr) return 'Daily (00:00 UTC)';
  try {
    const d = new Date(timeStr);
    return isNaN(d.getTime()) ? timeStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timeStr;
  }
}

function getAverageQuota(acc: any): number {
  const models = acc?.available_models;
  if (!models || models.length === 0) return 100;
  const total = models.reduce((sum: number, m: any) => sum + (m.percentage ?? 100), 0);
  return Math.round(total / models.length);
}

// Track broken avatar URLs for seamless graceful fallback
const brokenAvatars = ref<Record<string, boolean>>({});
function handleAvatarError(key?: string) {
  if (key) brokenAvatars.value[key] = true;
}

onMounted(() => {
  fetchAntigravityAccounts();
});

function handleCaptchaMethodChange(val: string) {
  if (val === 'yescaptcha' && !props.config.captcha.baseUrl) {
    props.config.captcha.baseUrl = 'https://api.yescaptcha.com';
  } else if (val === 'capsolver' && !props.config.captcha.baseUrl) {
    props.config.captcha.baseUrl = 'https://api.capsolver.com';
  } else if (val === 'ezcaptcha' && !props.config.captcha.baseUrl) {
    props.config.captcha.baseUrl = 'https://api.ez-captcha.com';
  } else if (val === 'capmonster' && !props.config.captcha.baseUrl) {
    props.config.captcha.baseUrl = 'https://api.capmonster.cloud';
  } else if (val === '2captcha' && !props.config.captcha.baseUrl) {
    props.config.captcha.baseUrl = 'https://2captcha.com';
  }
}
</script>

<template>
  <div class="space-y-10">
    <div class="flex items-center justify-between pb-5 border-b border-[var(--el-border-color)]">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)] flex items-center gap-2">
          <el-icon class="text-emerald-500"><Cpu /></el-icon>
          {{ t('settings.apiModelsConfigTitle') }}
        </h2>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('settings.apiModelsConfigDesc') }}
        </p>
      </div>
      <el-button type="primary" round size="small" :loading="isSaving" @click="handleSave">
        {{ t('settings.saveAiInfrastructure') }}
      </el-button>
    </div>

    <!-- Gemini AI Models Selector -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="pb-3 border-b border-[var(--el-border-color)] flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-base">
            <el-icon><Cpu /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.geminiModels') }}</h3>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.multiModalPipelineDesc') }}</p>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.modelTextGen') }}</label>
          <el-select v-model="config.gemini.textModel" filterable allow-create default-first-option class="w-full" size="small">
            <el-option label="gemini-3.8-flash (Recommended)" value="gemini-3.8-flash" />
            <el-option label="gemini-3.7-flash (Thinking & Agentic)" value="gemini-3.7-flash" />
            <el-option label="gemini-3.5-flash (Balanced SOTA)" value="gemini-3.5-flash" />
            <el-option label="gemini-3.5-flash-lite (Cost-Efficient)" value="gemini-3.5-flash-lite" />
            <el-option label="gemini-3.1-flash-lite (High Speed)" value="gemini-3.1-flash-lite" />
            <el-option label="gemini-3.1-pro-preview (Deep Reasoning)" value="gemini-3.1-pro-preview" />
            <el-option label="gemini-2.5-flash" value="gemini-2.5-flash" />
            <el-option label="gemini-2.5-pro" value="gemini-2.5-pro" />
            <el-option label="gemini-2.5-flash-lite" value="gemini-2.5-flash-lite" />
          </el-select>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.modelImageGen') }}</label>
          <el-select v-model="config.gemini.imageModel" filterable allow-create default-first-option class="w-full" size="small">
            <el-option label="gemini-3.1-flash-image (Nano Banana 2 - Recommended)" value="gemini-3.1-flash-image" />
            <el-option label="gemini-3.1-flash-lite-image (Nano Banana 2 Lite)" value="gemini-3.1-flash-lite-image" />
            <el-option label="gemini-3-pro-image (Nano Banana Pro 4K)" value="gemini-3-pro-image" />
            <el-option label="gemini-2.5-flash-image (Nano Banana)" value="gemini-2.5-flash-image" />
            <el-option label="imagen-3.0-generate-002 (Imagen 3 Stable)" value="imagen-3.0-generate-002" />
          </el-select>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.modelVideoGen') }}</label>
          <el-select v-model="config.gemini.videoModel" filterable allow-create default-first-option class="w-full" size="small">
            <el-option label="veo-3.1-generate-001 (Veo 3.1 - Recommended)" value="veo-3.1-generate-001" />
            <el-option label="veo-3.1-generate-preview (Veo 3.1 Preview with Audio)" value="veo-3.1-generate-preview" />
            <el-option label="veo-3.1-fast-generate-preview (Veo 3.1 Fast Low-Latency)" value="veo-3.1-fast-generate-preview" />
            <el-option label="veo-3.1-lite-generate-preview (Veo 3.1 Lite)" value="veo-3.1-lite-generate-preview" />
            <el-option label="veo-3.0-generate-001 (Veo 3.0 Stable)" value="veo-3.0-generate-001" />
            <el-option label="veo-3.0-fast-generate-001 (Veo 3.0 Fast)" value="veo-3.0-fast-generate-001" />
            <el-option label="gemini-omni-1.1-flash (Gemini Omni Video Gen)" value="gemini-omni-1.1-flash" />
            <el-option label="veo-2.0-generate-001 (Veo 2.0 Legacy)" value="veo-2.0-generate-001" />
          </el-select>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.modelVoiceDub') }}</label>
          <el-select v-model="config.gemini.audioModel" filterable allow-create default-first-option class="w-full" size="small">
            <el-option label="gemini-3.1-flash-tts-preview (Recommended - Expressive TTS)" value="gemini-3.1-flash-tts-preview" />
            <el-option label="gemini-3.1-flash-live-preview (Realtime Audio-to-Audio)" value="gemini-3.1-flash-live-preview" />
            <el-option label="gemini-2.5-pro-preview-tts (High-Fidelity Audio)" value="gemini-2.5-pro-preview-tts" />
            <el-option label="gemini-2.5-flash-preview-tts (Fast TTS)" value="gemini-2.5-flash-preview-tts" />
          </el-select>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.modelBgm') }}</label>
          <el-select v-model="config.gemini.musicModel" filterable allow-create default-first-option class="w-full" size="small">
            <el-option label="lyria-3-clip-preview (Recommended - Loops & BGM)" value="lyria-3-clip-preview" />
            <el-option label="lyria-3-pro-preview (Lyria 3 Pro Full Song)" value="lyria-3-pro-preview" />
            <el-option label="lyria-realtime-exp (Lyria Realtime Streaming)" value="lyria-realtime-exp" />
          </el-select>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.modelOrchestrator') }}</label>
          <el-select v-model="config.gemini.agentModel" filterable allow-create default-first-option class="w-full" size="small">
            <el-option label="gemini-3.8-flash (Recommended - Latest Flagship)" value="gemini-3.8-flash" />
            <el-option label="gemini-3.7-flash (High-Speed Agentic CoT)" value="gemini-3.7-flash" />
            <el-option label="gemini-3.1-pro-preview (Deep Strategic Reasoning)" value="gemini-3.1-pro-preview" />
            <el-option label="gemini-3.5-flash (Fast Orchestrator)" value="gemini-3.5-flash" />
            <el-option label="antigravity-preview-05-2026 (Autonomous Agent)" value="antigravity-preview-05-2026" />
            <el-option label="deep-research-preview-04-2026 (Deep Research Agent)" value="deep-research-preview-04-2026" />
          </el-select>
        </div>
      </div>
    </div>

    <!-- Antigravity Multi-Account OAuth Pool -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--el-border-color)]">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center text-base">
            <el-icon><Lightning /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.antigravityAccounts') }}</h3>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.antigravityAccountPoolDesc') }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <el-button size="small" round :loading="isTestingAntigravity" @click="handleTestAntigravity">
            <el-icon class="mr-1 text-xs"><VideoPlay /></el-icon> {{ t('settings.testGenerateBtn') }}
          </el-button>
          <el-button size="small" round :loading="isSyncingAllAntigravity" @click="handleSyncAllAntigravity">
            <el-icon class="mr-1 text-xs"><Refresh /></el-icon> {{ t('settings.syncPool', 'Sync Pool') }}
          </el-button>
          <el-button type="primary" size="small" round @click="handleConnectAntigravity">
            <el-icon class="mr-1 text-xs"><Plus /></el-icon> {{ t('settings.connectGoogleBtn') }}
          </el-button>
        </div>
      </div>

      <el-table
        :data="antigravityAccounts"
        style="width: 100%"
        class="rounded-xl overflow-hidden"
        :empty-text="t('settings.noAntigravityAccounts')"
        v-loading="isLoadingAntigravity"
      >
        <el-table-column prop="email" :label="t('common.account', 'Account')" min-width="240">
          <template #default="{ row }">
            <div class="flex items-center gap-2.5">
              <img
                v-if="row.avatar && !brokenAvatars[row.id || row.email]"
                :src="row.avatar"
                referrerpolicy="no-referrer"
                loading="lazy"
                alt="avatar"
                class="w-7 h-7 rounded-full border border-[var(--el-border-color)] object-cover flex-shrink-0"
                @error="handleAvatarError(row.id || row.email)"
              />
              <div
                v-else
                class="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold uppercase flex-shrink-0"
              >
                {{ (row.name || row.email || 'A').slice(0, 2) }}
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-[var(--el-text-color-primary)] text-xs truncate">
                  {{ row.name || row.email }}
                </div>
                <div class="text-[10px] text-[var(--el-text-color-secondary)] truncate">
                  {{ row.email }}
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="project_id" :label="t('settings.projectId', 'Project ID')" min-width="200">
          <template #default="{ row }">
            <div class="flex items-center gap-1.5">
              <el-tag size="small" effect="plain" type="info" class="font-mono text-[11px]">
                {{ row.project_id || 'aicode-consumers' }}
              </el-tag>
              <el-button
                type="primary"
                link
                size="small"
                class="!p-0.5 text-xs text-[var(--el-text-color-secondary)] hover:text-primary"
                :title="t('settings.editProjectId', 'Edit Project ID')"
                @click="promptEditProjectId(row)"
              >
                <el-icon><Edit /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="tier" :label="t('settings.tier', 'Tier')" width="90">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="row.tier === 'paid' ? 'warning' : 'info'"
              round
              effect="light"
            >
              {{ (row.tier || 'free').toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('settings.modelQuotas', 'Model Quotas')" min-width="160">
          <template #default="{ row }">
            <el-button
              size="small"
              round
              class="!px-2.5 !py-1 text-xs border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 flex items-center gap-1.5"
              @click="openQuotaDialog(row)"
            >
              <el-icon class="text-xs text-indigo-400"><Odometer /></el-icon>
              <span>{{ row.available_models?.length ? `${row.available_models.length} Models` : t('settings.viewQuotas', 'View Quotas') }}</span>
              <el-tag
                size="small"
                :type="getAverageQuota(row) > 50 ? 'success' : 'warning'"
                effect="plain"
                class="ml-1 !h-4 !px-1 text-[10px] font-mono"
              >
                {{ getAverageQuota(row) }}%
              </el-tag>
            </el-button>
          </template>
        </el-table-column>

        <el-table-column prop="request_count" :label="t('settings.requests', 'Requests')" width="90">
          <template #default="{ row }">
            <span class="font-semibold text-indigo-400 text-xs">{{ row.request_count || 0 }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="status" :label="t('common.status', 'Status')" width="110">
          <template #default="{ row }">
            <el-tooltip v-if="row.error_message" :content="row.error_message" placement="top">
              <el-tag size="small" :type="row.status === 'ACTIVE' ? 'success' : 'danger'" round effect="plain">
                {{ row.status }}
              </el-tag>
            </el-tooltip>
            <el-tag v-else size="small" :type="row.status === 'ACTIVE' ? 'success' : 'danger'" round effect="plain">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('settings.lastSync', 'Last Sync')" width="160">
          <template #default="{ row }">
            <span class="text-xs text-[var(--el-text-color-secondary)]">
              {{ formatLastSynced(row.last_synced_at || row.last_used_at || row.updated_at) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column :label="t('common.actions', 'Actions')" width="230" align="right">
          <template #default="{ row }">
            <div class="flex items-center justify-end gap-1">
              <el-button
                type="primary"
                link
                size="small"
                :title="t('settings.viewQuotas', 'View Quotas')"
                @click="openQuotaDialog(row)"
              >
                <el-icon class="text-xs mr-0.5"><Odometer /></el-icon> {{ t('settings.modelQuotas', 'Quotas') }}
              </el-button>
              <el-button
                type="primary"
                link
                size="small"
                :loading="refreshingAntigravityId === row.id"
                :title="t('settings.refreshToken', 'Refresh')"
                @click="handleRefreshAntigravity(row)"
              >
                <el-icon class="text-xs mr-0.5"><Refresh /></el-icon> {{ t('settings.refreshToken', 'Refresh') }}
              </el-button>
              <el-button
                type="danger"
                link
                size="small"
                @click="removeAntigravityAccount(row.id)"
              >
                <el-icon class="text-xs"><Delete /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Flow / Veo Accounts Pool -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--el-border-color)]">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-[#1a1b23] text-primary border border-[#2d2e3a] flex items-center justify-center text-base">
            <el-icon><Files /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.flowAccounts') }}</h3>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.flowAccountSessionPool') }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <el-button size="small" round :loading="isSyncingAllFlow" @click="handleSyncAllFlowAccounts">
            <el-icon class="mr-1 text-xs"><Refresh /></el-icon> {{ t('settings.syncPool', 'Sync Pool') }}
          </el-button>
          <el-button type="primary" size="small" round @click="isAddFlowModalOpen = true">
            <el-icon class="mr-1 text-xs"><Plus /></el-icon> {{ t('settings.addAccountBtn') }}
          </el-button>
        </div>
      </div>

      <el-table
        :data="uniqueFlowAccounts"
        style="width: 100%"
        class="rounded-xl overflow-hidden"
        :empty-text="t('settings.noFlowAccounts')"
      >
        <el-table-column :label="t('common.account', 'Account')" min-width="240">
          <template #default="{ row }">
            <div class="flex items-center gap-2.5">
              <img
                v-if="row.avatar && !brokenAvatars[row.id || row.email]"
                :src="row.avatar"
                referrerpolicy="no-referrer"
                loading="lazy"
                alt="avatar"
                class="w-7 h-7 rounded-full border border-[var(--el-border-color)] object-cover flex-shrink-0"
                @error="handleAvatarError(row.id || row.email)"
              />
              <div
                v-else
                class="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold uppercase flex-shrink-0"
              >
                {{ (row.name || row.email || 'F').slice(0, 2) }}
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-[var(--el-text-color-primary)] text-xs truncate">
                  {{ row.name || row.email.split('@')[0] }}
                </div>
                <div class="text-[10px] text-[var(--el-text-color-secondary)] truncate">
                  {{ row.email }}
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="credits" :label="t('settings.creditsLabel', 'Credits')" width="110">
          <template #default="{ row }">
            <span class="font-bold text-primary text-xs">{{ row.credits ?? 0 }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="status" :label="t('common.status', 'Status')" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'ACTIVE' ? 'success' : 'danger'" round effect="plain">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('settings.lastSync', 'Last Sync')" width="180">
          <template #default="{ row }">
            <span class="text-xs text-[var(--el-text-color-secondary)]">
              {{ formatLastSynced(row.last_synced_at || row.lastSyncedAt) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column :label="t('common.actions', 'Actions')" width="230" align="right">
          <template #default="{ row }">
            <div class="flex items-center justify-end gap-1">
              <el-button
                type="primary"
                link
                size="small"
                :loading="refreshingAccountId === row.id"
                :title="t('settings.refreshToken', 'Refresh Token')"
                @click="handleRefreshAccount(row)"
              >
                <el-icon class="text-xs mr-0.5"><Refresh /></el-icon> {{ t('settings.refreshToken', 'Refresh') }}
              </el-button>
              <el-button
                type="primary"
                link
                size="small"
                :title="t('settings.updateToken', 'Update Token')"
                @click="openUpdateFlowTokenModal(row)"
              >
                <el-icon class="text-xs mr-0.5"><Key /></el-icon> {{ t('settings.updateToken', 'Update') }}
              </el-button>
              <el-button
                type="danger"
                link
                size="small"
                @click="removeFlowAccount(row.id, row.email)"
              >
                <el-icon class="text-xs"><Delete /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- CAPTCHA Solver Service -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--el-border-color)]">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-[var(--el-fill-color)] text-[var(--el-color-primary)] flex items-center justify-center text-base">
            <el-icon><Lock /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.captchaSolverService') }}</h3>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.captchaSolverDesc') }}</p>
          </div>
        </div>
        <el-tag size="small" type="primary" effect="plain" round>
          <el-icon class="mr-1 text-xs"><Service /></el-icon> {{ t('settings.autoBypassFlow') }}
        </el-tag>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.solverProviderMethod') }}</label>
          <el-select v-model="config.captcha.method" class="w-full" @change="handleCaptchaMethodChange" size="small">
            <el-option label="CapSolver (Recommended)" value="capsolver" />
            <el-option label="YesCaptcha" value="yescaptcha" />
            <el-option label="EzCaptcha" value="ezcaptcha" />
            <el-option label="CapMonster" value="capmonster" />
            <el-option label="2Captcha" value="2captcha" />
            <el-option label="Remote Browser" value="remote_browser" />
            <el-option label="Local Playwright Browser (Free)" value="browser" />
            <el-option label="Local Stealth Browser" value="personal" />
          </el-select>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.solverApiKey') }}</label>
          <el-input v-model="config.captcha.apiKey" type="password" show-password :placeholder="t('settings.enterCaptchaKey')" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.solverBaseUrl') }}</label>
          <el-input v-model="config.captcha.baseUrl" placeholder="https://api.yescaptcha.com" size="small"/>
        </div>
      </div>
    </div>

    <!-- Credit Deduction Rates Configuration -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="pb-3 border-b border-[var(--el-border-color)] flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-base">
            <el-icon><Coin /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.creditRates') }}</h3>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.costConfigDesc') }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskMasterPlan') }}</label>
          <el-input-number v-model="config.creditRates.scriptGeneration" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskCharacterLora') }}</label>
          <el-input-number v-model="config.creditRates.characterAnchors" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskSceneBackground') }}</label>
          <el-input-number v-model="config.creditRates.sceneImage" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskVideoGen') }}</label>
          <el-input-number v-model="config.creditRates.videoGeneration" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskVoiceover') }}</label>
          <el-input-number v-model="config.creditRates.voiceoverTts" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskBgmAudio') }}</label>
          <el-input-number v-model="config.creditRates.bgmMusic" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskVideoRender') }}</label>
          <el-input-number v-model="config.creditRates.videoRender" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskCliffhanger') }}</label>
          <el-input-number v-model="config.creditRates.cliffhangerHook" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
        <div>
          <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.taskSubtitleTrans') }}</label>
          <el-input-number v-model="config.creditRates.subtitleTranslate" :min="1" :max="1000" class="w-full" size="small"/>
        </div>
      </div>
    </div>

    <!-- Parallel AI Task & Stock Media Engines -->
    <div class="space-y-6">
      <!-- Parallel AI Search & Task MCP -->
      <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-[var(--el-border-color)]">
          <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)] flex items-center gap-2">
            <el-icon class="text-amber-500"><Lightning /></el-icon>
            {{ t('settings.parallelEngineTitle') }}
          </h3>
        </div>
        <div class="text-xs grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.parallelApiKey') }}</label>
            <el-input v-model="config.parallel.apiKey" type="password" show-password placeholder="Enter Parallel API Key (PARALLEL_API_KEY)" size="small"/>
          </div>
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.parallelMcpEndpoint') }}</label>
            <el-input v-model="config.parallel.endpoint" placeholder="https://search.parallel.ai/mcp" size="small"/>
          </div>
        </div>
      </div>

      <!-- Stock Audio, Media & Grafana Integrations -->
      <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-[var(--el-border-color)]">
          <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)] flex items-center gap-2">
            <el-icon class="text-cyan-500"><Headset /></el-icon>
            {{ t('settings.stockMediaTitle') }}
          </h3>
        </div>
        <div class="text-xs grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.freesoundApiKey') }}</label>
            <el-input v-model="config.freesound.apiKey" type="password" show-password placeholder="Enter Freesound API Key" size="small"/>
          </div>
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.pixabayApiKey') }}</label>
            <el-input v-model="config.pixabay.apiKey" type="password" show-password placeholder="Enter Pixabay API Key (PIXABAY_API_KEY)" size="small"/>
          </div>
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.pexelsApiKey') }}</label>
            <el-input v-model="config.pexels.apiKey" type="password" show-password placeholder="Enter Pexels API Key" size="small"/>
          </div>
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.grafanaCloudUrl') }}</label>
            <el-input v-model="config.grafana.url" placeholder="https://bronzeholly2284.grafana.net" size="small"/>
          </div>
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.grafanaApiToken') }}</label>
            <el-input v-model="config.grafana.apiKey" type="password" show-password placeholder="Enter Grafana API Token" size="small"/>
          </div>
          <div>
            <label class="text-[var(--el-text-color-secondary)] block mb-1 font-semibold">{{ t('settings.grafanaMcpEndpoint') }}</label>
            <el-input v-model="config.grafana.mcpEndpoint" placeholder="https://mcp.grafana.com/mcp" size="small"/>
          </div>
        </div>
      </div>
    </div>

    <!-- Email Server Config -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--el-border-color)]">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-base">
            <el-icon><Message /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.emailServer') }}</h3>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.smtpTitle') }}</p>
          </div>
        </div>
        <el-switch v-model="config.email.enabled" size="small"/>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.smtpHost') }}</label>
          <el-input v-model="config.email.smtpHost" placeholder="smtp.sendgrid.net" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.smtpPort') }}</label>
          <el-input v-model.number="config.email.smtpPort" placeholder="587" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.senderName') }}</label>
          <el-input v-model="config.email.senderName" placeholder="Shine Studio AI" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.senderEmail') }}</label>
          <el-input v-model="config.email.senderEmail" placeholder="notifications@shine-studio.ai" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.smtpPassKey') }}</label>
          <el-input v-model="config.email.password" type="password" show-password placeholder="••••••••••••" size="small"/>
        </div>
        <div class="flex items-center gap-3 pt-6">
          <el-switch v-model="config.email.ssl" size="small"/>
          <span class="text-xs font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.useSslTls') }}</span>
        </div>
      </div>
    </div>

    <!-- Modals for Flow Accounts -->
    <el-dialog v-model="isAddFlowModalOpen" :title="t('settings.addFlowAccountTitle')" width="480px" destroy-on-close align-center class="rounded-2xl">
      <div class="space-y-4 py-2">
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.flowEmail') }}</label>
          <el-input v-model="newFlowEmail" placeholder="user@gmail.com" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.flowCookieToken') }}</label>
          <el-input v-model="newFlowCookie" type="textarea" :rows="3" :placeholder="t('settings.flowCookiePlaceholder')" size="small"/>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round size="small" @click="isAddFlowModalOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" round size="small" :loading="isSubmittingFlow" @click="handleAddFlowAccount">{{ t('settings.addAccountBtn') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="isUpdateFlowModalOpen" :title="t('settings.updateFlowAccountTitle')" width="480px" destroy-on-close align-center class="rounded-2xl">
      <div class="space-y-4 py-2">
        <p class="text-xs text-[var(--el-text-color-secondary)]">
          <span class="mr-1">{{ t('common.account') }}:</span><strong class="text-[var(--el-text-color-primary)]">{{ updatingFlowAccount?.email }}</strong>
        </p>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.flowCookieToken') }}</label>
          <el-input v-model="updateFlowCookie" type="textarea" :rows="4" :placeholder="t('settings.updateFlowCookiePlaceholder')" size="small"/>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button round size="small" @click="isUpdateFlowModalOpen = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" round size="small" :loading="isUpdatingFlow" @click="handleUpdateFlowToken">{{ t('settings.updateToken') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Antigravity Model Quotas Dialog -->
    <el-dialog
      v-model="isQuotaDialogOpen"
      :title="t('settings.quotaDialogTitle', 'Antigravity Model Quotas')"
      width="680px"
      destroy-on-close
      align-center
      class="rounded-2xl"
    >
      <div v-if="selectedQuotaAccount" class="space-y-5 py-2">
        <!-- Account Summary Banner -->
        <div class="flex items-center justify-between p-3.5 bg-white/[0.03] border border-white/10 rounded-xl">
          <div class="flex items-center gap-3">
            <img
              v-if="selectedQuotaAccount.avatar && !brokenAvatars[selectedQuotaAccount.id || selectedQuotaAccount.email]"
              :src="selectedQuotaAccount.avatar"
              referrerpolicy="no-referrer"
              class="w-10 h-10 rounded-full border border-indigo-500/30 object-cover flex-shrink-0"
              @error="handleAvatarError(selectedQuotaAccount.id || selectedQuotaAccount.email)"
            />
            <div
              v-else
              class="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold uppercase flex-shrink-0"
            >
              {{ (selectedQuotaAccount.name || selectedQuotaAccount.email || 'A').slice(0, 2) }}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="text-sm font-semibold text-[var(--el-text-color-primary)]">
                  {{ selectedQuotaAccount.name || selectedQuotaAccount.email }}
                </h4>
                <el-tag
                  size="small"
                  :type="selectedQuotaAccount.tier === 'paid' ? 'warning' : 'info'"
                  round
                  effect="light"
                  class="text-[10px]"
                >
                  {{ (selectedQuotaAccount.tier || 'FREE').toUpperCase() }}
                </el-tag>
              </div>
              <div class="flex items-center gap-2 text-xs text-[var(--el-text-color-secondary)] mt-0.5 font-mono">
                <span>{{ selectedQuotaAccount.email }}</span>
                <span>•</span>
                <span class="text-indigo-400">{{ selectedQuotaAccount.project_id || 'aicode-consumers' }}</span>
              </div>
            </div>
          </div>
          <el-button
            size="small"
            round
            type="primary"
            :loading="isSyncingDialogQuotas"
            @click="syncDialogQuotas"
          >
            <el-icon class="mr-1 text-xs"><Refresh /></el-icon>
            {{ t('settings.syncNow', 'Sync Now') }}
          </el-button>
        </div>

        <!-- Quota Overview Health & Models Grid -->
        <div class="flex items-center justify-between px-1">
          <span class="text-xs font-semibold text-[var(--el-text-color-secondary)] flex items-center gap-1.5">
            <el-icon class="text-emerald-400"><Check /></el-icon>
            {{ t('settings.allModelsOnline', 'All Models Operational') }}
            <span class="text-white/40">({{ selectedQuotaAccount.available_models?.length || 0 }} models)</span>
          </span>
          <span class="text-[11px] text-[var(--el-text-color-secondary)]">
            {{ t('settings.quotaResetInfo', 'Quotas reset daily based on Google Cloud schedule.') }}
          </span>
        </div>

        <!-- Models List / Cards -->
        <div
          v-if="selectedQuotaAccount.available_models && selectedQuotaAccount.available_models.length > 0"
          class="space-y-3 max-h-[380px] overflow-y-auto pr-1"
        >
          <div
            v-for="model in selectedQuotaAccount.available_models"
            :key="model.id"
            class="p-3.5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-indigo-500/30 rounded-xl transition-all"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs">
                  <el-icon><Lightning /></el-icon>
                </div>
                <div>
                  <span class="font-semibold text-xs text-[var(--el-text-color-primary)]">
                    {{ model.displayName || model.id }}
                  </span>
                  <span v-if="model.category" class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                    {{ model.category }}
                  </span>
                  <div class="text-[10px] font-mono text-[var(--el-text-color-secondary)]">
                    {{ model.id }}
                  </div>
                </div>
              </div>
              <div class="text-right">
                <span :class="['text-xs font-bold font-mono tracking-wider', getQuotaTextColor(model.percentage ?? 100)]">
                  {{ model.percentage ?? 100 }}%
                </span>
                <div v-if="model.resetTime" class="text-[9px] text-[var(--el-text-color-secondary)]">
                  {{ t('settings.resetsAt', 'Resets at') }} {{ formatResetTime(model.resetTime) }}
                </div>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-700"
                :style="{ width: `${model.percentage ?? 100}%` }"
                :class="getQuotaBarColor(model.percentage ?? 100)"
              ></div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-10 space-y-3 bg-white/[0.01] border border-dashed border-white/10 rounded-xl">
          <el-icon class="text-3xl text-indigo-400 opacity-60"><Odometer /></el-icon>
          <p class="text-xs text-[var(--el-text-color-secondary)]">
            {{ t('settings.noModelsAvailable', 'No models synchronized yet.') }}
          </p>
          <el-button size="small" type="primary" round :loading="isSyncingDialogQuotas" @click="syncDialogQuotas">
            {{ t('settings.syncNow', 'Sync Now') }}
          </el-button>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between pt-2">
          <span class="text-[11px] text-[var(--el-text-color-secondary)]">
            {{ t('settings.lastSync', 'Last Sync') }}: {{ formatLastSynced(selectedQuotaAccount?.last_synced_at) }}
          </span>
          <el-button round size="small" @click="isQuotaDialogOpen = false">
            {{ t('common.close', 'Close') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

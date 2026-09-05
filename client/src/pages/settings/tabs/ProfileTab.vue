<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'vue-sonner';
import http from '@/utils/http';
import { PlatformAccount } from '@/types';

const { t } = useI18n();
const authStore = useAuthStore();

// ─── Profile State ────────────────────────────────────────────────────────────
const fullName = ref('');
const emailAddress = ref('');
const avatarUrl = ref('');
const avatarInputRef = ref<HTMLInputElement | null>(null);
const is2FAEnabled = ref(false);
const isSaving = ref(false);

// ─── 2FA Dialog & OTP State ───────────────────────────────────────────────────
const show2FADialog = ref(false);
const otpCode = ref('');
const isVerifyingOtp = ref(false);
const isSendingOtp = ref(false);
const resendCountdown = ref(0);
let countdownTimer: any = null;
const target2FAState = ref(false);
const maskedEmail = ref('');

function startCountdown() {
  resendCountdown.value = 60;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (resendCountdown.value > 0) {
      resendCountdown.value--;
    } else {
      clearInterval(countdownTimer);
    }
  }, 1000);
}

async function handleToggle2FA(nextVal: any) {
  is2FAEnabled.value = !nextVal;
  target2FAState.value = !!nextVal;
  otpCode.value = '';
  show2FADialog.value = true;
  await send2FAOtp();
}

async function send2FAOtp() {
  isSendingOtp.value = true;
  try {
    const res: any = await http.post('/auth/2fa/send-otp', { enable: target2FAState.value });
    maskedEmail.value = res?.data?.masked_email || emailAddress.value;
    toast.success(t('toast.otpSentEmail'));
    startCountdown();
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Failed to send OTP code');
  } finally {
    isSendingOtp.value = false;
  }
}

async function handleVerify2FA() {
  if (!otpCode.value || otpCode.value.trim().length !== 6) {
    toast.error(t('toast.enterValidOtp'));
    return;
  }
  isVerifyingOtp.value = true;
  try {
    const res: any = await http.post('/auth/2fa/verify', {
      otp: otpCode.value.trim(),
      enable: target2FAState.value,
    });
    is2FAEnabled.value = !!res?.data?.two_factor_enabled;
    if (authStore.user) {
      authStore.user.two_factor_enabled = is2FAEnabled.value;
      localStorage.setItem('shine_user', JSON.stringify(authStore.user));
    }
    toast.success(is2FAEnabled.value ? t('toast.twoFactorEnabled') : t('toast.twoFactorDisabled'));
    show2FADialog.value = false;
  } catch (err: any) {
    toast.error(err?.response?.data?.error || err?.message || 'Verification failed');
  } finally {
    isVerifyingOtp.value = false;
  }
}

// ─── Password Change State ───────────────────────────────────────────────────
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const isUpdatingPassword = ref(false);

// ─── API Key & Rotation ───────────────────────────────────────────────────────
const apiKey = ref('');
const apiKeyHidden = ref(true);
const daysRotated = ref(12);

// ─── Multi-Channel Platform Connect ──────────────────────────────────────────

const connectedChannels = ref<PlatformAccount[]>([]);
const enabledPlatforms = ref({
  youtube: true,
  tiktok: true,
  facebook: true,
});
const isConnectingProvider = ref<string | null>(null);

const platformDefinitions = [
  {
    id: 'youtube',
    name: 'YouTube Shorts',
    icon: 'VideoPlay',
    color: 'text-red-500 bg-red-500/10',
    description: 'Auto-publish 9:16 vertical shorts directly to your YouTube channel.',
  },
  {
    id: 'tiktok',
    name: 'TikTok for Creators',
    icon: 'Film',
    color: 'text-cyan-400 bg-cyan-500/10',
    description: 'Direct publishing to TikTok feeds with hashtags and scheduled drops.',
  },
  {
    id: 'facebook',
    name: 'Meta Reels & Pages',
    icon: 'Share',
    color: 'text-blue-500 bg-blue-600/10',
    description: 'Publish high-engagement reels across Facebook pages and Instagram.',
  },
];

function getChannelsForProvider(provider: string) {
  return connectedChannels.value.filter((c) => c.provider === provider);
}

function connectPlatformPopup(provider: string) {
  isConnectingProvider.value = provider;
  const token = localStorage.getItem('shine_token') || '';
  const popup = window.open(
    `/api/auth/oauth/connect/${provider}?token=${encodeURIComponent(token)}`,
    'ConnectOAuthWindow',
    'width=540,height=650,status=no,toolbar=no,menubar=no,location=no'
  );

  const checkClosed = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(checkClosed);
      isConnectingProvider.value = null;
    }
  }, 500);
}

async function handleDisconnectChannel(channelId: string) {
  try {
    const res: any = await http.delete(`/auth/oauth/disconnect/${channelId}`);
    if (res?.data?.connected_channels) {
      connectedChannels.value = res.data.connected_channels;
    } else {
      connectedChannels.value = connectedChannels.value.filter((c) => c.id !== channelId && c.channel_id !== channelId);
    }
    if (authStore.user) {
      authStore.user.connected_channels = connectedChannels.value;
      localStorage.setItem('shine_user', JSON.stringify(authStore.user));
    }
    toast.success(t('settings.channelDisconnected') || 'Channel disconnected successfully');
  } catch (err: any) {
    toast.error(err?.response?.data?.message || 'Failed to disconnect channel');
  }
}

function handleOAuthMessage(event: MessageEvent) {
  if (event.data?.type === 'PLATFORM_CONNECT_SUCCESS') {
    if (event.data.channels) {
      connectedChannels.value = event.data.channels;
    } else if (event.data.channel) {
      connectedChannels.value.push(event.data.channel);
    }
    if (authStore.user) {
      authStore.user.connected_channels = connectedChannels.value;
      localStorage.setItem('shine_user', JSON.stringify(authStore.user));
    }
    toast.success(
      t('settings.channelConnectedSuccess') ||
      `Successfully linked ${event.data.channel?.channelName || event.data.provider}!`
    );
    isConnectingProvider.value = null;
  }
}

// ─── Avatar Upload & Management ──────────────────────────────────────────────
const isUploadingAvatar = ref(false);

function triggerAvatarUpload() {
  avatarInputRef.value?.click();
}

async function handleAvatarFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    toast.error(t('toast.uploadImageFile'));
    return;
  }

  isUploadingAvatar.value = true;
  const reader = new FileReader();
  reader.onload = async (loadEvt) => {
    const base64 = loadEvt.target?.result as string;
    avatarUrl.value = base64;

    try {
      const res: any = await http.post('/auth/avatar', { image: base64 });
      if (res?.data?.avatar) {
        avatarUrl.value = res.data.avatar;
      }
      if (authStore.user) {
        authStore.user.avatar = avatarUrl.value;
        localStorage.setItem('shine_user', JSON.stringify(authStore.user));
      }
      toast.success(t('settings.avatarUpdated'));
    } catch (err: any) {
      console.warn('Avatar upload fallback, will save with Save Changes:', err);
      toast.success(t('settings.avatarUpdated'));
    } finally {
      isUploadingAvatar.value = false;
      target.value = '';
    }
  };
  reader.onerror = () => {
    isUploadingAvatar.value = false;
    target.value = '';
    toast.error(t('toast.imageFileReadError'));
  };
  reader.readAsDataURL(file);
}

async function removeAvatar() {
  avatarUrl.value = '';
  try {
    await http.patch('/auth/profile', { avatar: '' });
    if (authStore.user) {
      authStore.user.avatar = '';
      localStorage.setItem('shine_user', JSON.stringify(authStore.user));
    }
    toast.success(t('settings.savedSuccess'));
  } catch {
    // fallback
  }
}

function copyApiKey() {
  navigator.clipboard.writeText(apiKey.value);
  toast.success(t('settings.copied'));
}

function rotateApiKey() {
  apiKey.value = `sh_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
  daysRotated.value = 0;
  toast.success(t('settings.keyRotated'));
}

async function handlePasswordChange() {
  if (!newPassword.value) {
    toast.error(t('toast.enterNewPassword'));
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.error(t('toast.passwordsDoNotMatch'));
    return;
  }
  isUpdatingPassword.value = true;
  try {
    await http.post('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    toast.success(t('settings.passwordUpdated'));
  } catch (err: any) {
    toast.error(err?.response?.data?.error || 'Failed to change password');
  } finally {
    isUpdatingPassword.value = false;
  }
}

async function handleSaveChanges() {
  isSaving.value = true;
  try {
    const res: any = await http.patch('/auth/profile', {
      name: fullName.value,
      email: emailAddress.value,
      avatar: avatarUrl.value,
      api_key: apiKey.value,
      api_key_rotated_at: new Date(Date.now() - daysRotated.value * 86400000).toISOString(),
      two_factor_enabled: is2FAEnabled.value,
      connected_channels: connectedChannels.value,
    });
    if (res?.data?.user) {
      authStore.user = { ...authStore.user, ...res.data.user };
      localStorage.setItem('shine_user', JSON.stringify(authStore.user));
    }
    toast.success(t('settings.savedSuccess'));
  } catch (err: any) {
    toast.error(err?.response?.data?.error || 'Failed to update profile');
  } finally {
    isSaving.value = false;
  }
}

async function loadProfile() {
  try {
    const [profileRes, platformRes]: any = await Promise.all([
      http.get('/auth/profile'),
      http.get('/auth/enabled-platforms').catch(() => ({ data: { youtube: true, tiktok: true, facebook: true } })),
    ]);

    if (platformRes?.data) {
      enabledPlatforms.value = platformRes.data;
    }

    if (profileRes?.data?.user) {
      const u = profileRes.data.user;
      authStore.user = { ...authStore.user, ...u };
      fullName.value = u.name || '';
      emailAddress.value = u.email || '';
      avatarUrl.value = u.avatar || '';
      if (u.api_key) apiKey.value = u.api_key;
      if (u.two_factor_enabled !== undefined) is2FAEnabled.value = !!u.two_factor_enabled;
      if (u.connected_channels && Array.isArray(u.connected_channels)) {
        connectedChannels.value = u.connected_channels;
      }
      if (u.api_key_rotated_at) {
        const diffMs = Date.now() - new Date(u.api_key_rotated_at).getTime();
        daysRotated.value = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
    }
  } catch (err) {
    console.warn('Failed to load profile:', err);
    if (authStore.user) {
      fullName.value = authStore.user.name || '';
      emailAddress.value = authStore.user.email || '';
      avatarUrl.value = authStore.user.avatar || '';
    }
  }
}

onMounted(() => {
  loadProfile();
  window.addEventListener('message', handleOAuthMessage);
});

onUnmounted(() => {
  window.removeEventListener('message', handleOAuthMessage);
});
</script>

<template>
  <div class="space-y-10">
    <!-- Profile Header -->
    <div class="flex items-center justify-between pb-6 border-b border-[var(--el-border-color)]">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">
          {{ t('settings.profileSettings') }}
        </h2>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('settings.profileDesc') }}
        </p>
      </div>
      <el-button type="primary" round :loading="isSaving" @click="handleSaveChanges">
        {{ t('common.saveChanges') }}
      </el-button>
    </div>

    <!-- Personal Info Section -->
    <section class="space-y-6">
      <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.personalInfo') }}</h3>

      <div class="flex items-center gap-6 p-4 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft">
        <div class="relative group">
          <img
            :src="avatarUrl || '/images/avatars/avatar-default.jpg'"
            alt="Avatar"
            class="w-20 h-20 rounded-full object-cover ring-2 ring-[var(--el-border-color)] group-hover:opacity-80 transition"
          />
          <button
            @click="triggerAvatarUpload"
            class="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition text-xs font-semibold"
          >
            {{ t('settings.change') }}
          </button>
          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleAvatarFileChange"
          />
        </div>
        <div class="space-y-1.5">
          <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ fullName || 'Creator' }}</h4>
          <p class="text-xs text-[var(--el-text-color-secondary)]">{{ t('settings.avatarHint') }}</p>
          <div class="flex gap-2 pt-1">
            <el-button size="small" round :loading="isUploadingAvatar" @click="triggerAvatarUpload">
              {{ t('settings.uploadNew') }}
            </el-button>
            <el-button size="small" type="danger" text round @click="removeAvatar">
              {{ t('settings.remove') }}
            </el-button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.fullName') }}</label>
          <el-input v-model="fullName" :placeholder="t('common.yourName')" size="small" />
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.emailAddress') }}</label>
          <el-input v-model="emailAddress" placeholder="creator@shine.ai" size="small" />
        </div>
      </div>
    </section>

    <!-- Multi-Channel Connected Platforms -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">
            {{ t('settings.connectedPlatforms') || 'Connected Platform Channels' }}
          </h3>
          <p class="text-xs text-[var(--el-text-color-secondary)] mt-0.5">
            {{ t('settings.connectedPlatformsDesc') || 'Link multiple YouTube, TikTok, and Meta accounts to distribute your generated series.' }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <template v-for="platform in platformDefinitions" :key="platform.id">
          <div
            v-if="enabledPlatforms[platform.id as keyof typeof enabledPlatforms] !== false"
            class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl flex flex-col justify-between shadow-soft space-y-4"
          >
            <!-- Platform Header -->
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-lg', platform.color]">
                  <el-icon :size="20"><component :is="platform.icon" /></el-icon>
                </div>
                <div>
                  <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ platform.name }}</h4>
                  <p class="text-[11px] text-[var(--el-text-color-secondary)]">
                    {{ getChannelsForProvider(platform.id).length }} {{ t('settings.channelsLinked') || 'channel(s) linked' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Connected Channels List -->
            <div class="space-y-2.5 min-h-[90px] flex flex-col justify-center">
              <div
                v-if="getChannelsForProvider(platform.id).length === 0"
                class="text-center py-4 bg-[var(--el-bg-color-page)] rounded-xl border border-dashed border-[var(--el-border-color)]"
              >
                <p class="text-xs text-[var(--el-text-color-secondary)]">{{ t('settings.noChannelsConnected') }}</p>
              </div>

              <div
                v-for="ch in getChannelsForProvider(platform.id)"
                :key="ch.id"
                class="flex items-center justify-between p-2.5 bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl"
              >
                <div class="flex items-center gap-2.5 overflow-hidden">
                  <img
                    :src="ch.channel_avatar || '/images/avatars/avatar-default.jpg'"
                    alt="Channel"
                    class="w-7 h-7 rounded-full object-cover flex-shrink-0"
                  />
                  <div class="min-w-0">
                    <p class="text-xs font-bold text-[var(--el-text-color-primary)] truncate">{{ ch.channel_name }}</p>
                    <p class="text-[10px] text-emerald-500 font-medium truncate">{{ ch.handle || '@connected' }}</p>
                  </div>
                </div>

                <el-button
                  size="small"
                  type="danger"
                  text
                  circle
                  :title="t('settings.disconnectChannel')"
                  icon="Link"
                  @click="handleDisconnectChannel(ch.id)"
                >
                </el-button>
              </div>
            </div>

            <!-- Connect Button -->
            <el-button
              round
              size="small"
              type="primary"
              class="w-full"
			  icon="Plus"
              :loading="isConnectingProvider === platform.id"
              @click="connectPlatformPopup(platform.id)"
            >
              {{ getChannelsForProvider(platform.id).length > 0 ? (t('settings.addAnotherChannel') || 'Add Channel') : (t('settings.connectChannel') || 'Connect Channel') }}
            </el-button>
          </div>
        </template>
      </div>
    </section>

    <!-- Password & Security -->
    <section class="space-y-4">
      <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.passwordSecurity') }}</h3>

      <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.currentPassword') }}</label>
            <el-input v-model="currentPassword" type="password" show-password placeholder="••••••••" size="small" />
          </div>
          <div>
            <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.newPassword') }}</label>
            <el-input v-model="newPassword" type="password" show-password :placeholder="t('settings.newPassword')" size="small" />
          </div>
          <div>
            <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1.5">{{ t('settings.confirmPassword') }}</label>
            <el-input v-model="confirmPassword" type="password" show-password :placeholder="t('settings.confirmPassword')" size="small" />
          </div>
        </div>
        <div class="flex justify-end">
          <el-button type="primary" round size="small" :loading="isUpdatingPassword" @click="handlePasswordChange">
            {{ t('settings.updatePassword') }}
          </el-button>
        </div>
      </div>

      <!-- 2FA Box -->
      <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-base">
            <el-icon><Lock /></el-icon>
          </div>
          <div>
            <h4 class="font-bold text-xs text-[var(--el-text-color-primary)]">{{ t('settings.twoFactor') }}</h4>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">
              {{ t('settings.twoFactorDesc') }}
            </p>
          </div>
        </div>
        <el-switch
          :model-value="is2FAEnabled"
          size="small"
          @change="handleToggle2FA"
        />
      </div>
    </section>

    <!-- 2FA OTP Verification Dialog -->
    <el-dialog
      v-model="show2FADialog"
      :title="target2FAState ? t('dialog.enable2FATitle') : t('dialog.disable2FATitle')"
      width="440px"
      align-center
      class="rounded-3xl"
    >
      <div class="space-y-5 py-2">
        <div class="flex items-center gap-3 p-3.5 bg-primary/5 border border-primary/20 rounded-2xl">
          <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <el-icon class="text-sm"><Message /></el-icon>
          </div>
          <div class="text-xs text-[var(--el-text-color-secondary)]">
            {{ t('dialog.otpSentTo') }} <strong class="text-[var(--el-text-color-primary)]">{{ maskedEmail }}</strong>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold text-[var(--el-text-color-primary)] block">
            {{ t('dialog.enter6DigitCode') }}
          </label>
          <el-input
            v-model="otpCode"
            maxlength="6"
            placeholder="• • • • • •"
            class="text-center tracking-widest text-lg font-mono"
            size="large"
            @keyup.enter="handleVerify2FA"
          />
        </div>

        <div class="flex items-center justify-between text-xs text-[var(--el-text-color-secondary)]">
          <span>{{ t('dialog.didntReceiveCode') }}</span>
          <el-button
            type="primary"
            text
            size="small"
            :disabled="resendCountdown > 0 || isSendingOtp"
            :loading="isSendingOtp"
            @click="send2FAOtp"
          >
            {{ resendCountdown > 0 ? `${t('dialog.resendIn')} ${resendCountdown}s` : t('dialog.resendOtp') }}
          </el-button>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2 pt-2">
          <el-button round size="small" @click="show2FADialog = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button
            type="primary"
            round
            size="small"
            :loading="isVerifyingOtp"
            :disabled="otpCode.length !== 6"
            @click="handleVerify2FA"
          >
            {{ t('dialog.verifyAndConfirm') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Developer API Key -->
    <section class="space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.developerApiKey') }}</h3>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-0.5">
          {{ t('settings.apiKeyDesc') }}
        </p>
      </div>

      <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
        <div class="flex items-center gap-3">
          <div class="relative flex-1">
            <input
              :type="apiKeyHidden ? 'password' : 'text'"
              :value="apiKey"
              readonly
              class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--el-text-color-primary)] focus:outline-none select-all"
            />
          </div>
          <el-button size="small" round @click="apiKeyHidden = !apiKeyHidden">
            {{ apiKeyHidden ? t('settings.reveal') : t('settings.hide') }}
          </el-button>
          <el-button size="small" type="primary" round @click="copyApiKey">
            {{ t('settings.copy') }}
          </el-button>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-[var(--el-border-color)]/40 text-xs">
          <span class="text-[var(--el-text-color-secondary)]">
            {{ t('settings.rotatedAgo', { days: daysRotated }) }}
          </span>
          <el-button size="small" type="danger" text round @click="rotateApiKey">
            {{ t('settings.rotateKey') }}
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

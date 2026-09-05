<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import http from '@/utils/http';

const { t } = useI18n();

const isSaving = ref(false);
const isLoading = ref(true);

const platformConfig = ref({
  publishing: {
    youtube: {
      enabled: true,
      clientId: '',
      clientSecret: '',
      redirectUri: 'https://shine.studio/oauth/callback',
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    },
    tiktok: {
      enabled: true,
      clientKey: '',
      clientSecret: '',
      redirectUri: 'https://shine.studio/oauth/callback',
      scopes: ['video.upload', 'user.info.basic'],
    },
    facebook: {
      enabled: true,
      appId: '',
      appSecret: '',
      redirectUri: 'https://shine.studio/oauth/callback',
      scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    },
  },
  sso: {
    google: {
      enabled: true,
      clientId: '',
      clientSecret: '',
    },
    facebook: {
      enabled: false,
      appId: '',
      appSecret: '',
    },
    github: {
      enabled: true,
      clientId: '',
      clientSecret: '',
    },
  },
});

async function loadConfig() {
  isLoading.value = true;
  try {
    const res: any = await http.get('/admin/platforms');
    if (res?.data) {
      platformConfig.value = {
        publishing: { ...platformConfig.value.publishing, ...(res.data.publishing || {}) },
        sso: { ...platformConfig.value.sso, ...(res.data.sso || {}) },
      };
    }
  } catch (err: any) {
    toast.error(t('toast.userDirectoryLoadError'));
  } finally {
    isLoading.value = false;
  }
}

async function handleSave() {
  isSaving.value = true;
  try {
    await http.patch('/admin/platforms', platformConfig.value);
    toast.success(t('settings.savedSuccess') || 'Platform settings saved successfully');
  } catch (err: any) {
    toast.error(err?.response?.data?.message || 'Failed to save settings');
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  loadConfig();
});
</script>

<template>
  <div class="space-y-10">
    <!-- Header -->
    <div class="flex items-center justify-between pb-6 border-b border-[var(--el-border-color)]">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">
          {{ t('settings.platformIntegrations') || 'Platform Integrations & SSO' }}
        </h2>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('settings.platformIntegrationsDesc') || 'Configure developer API credentials for multi-channel video distribution and Single Sign-On authentication.' }}
        </p>
      </div>
      <el-button type="primary" round :loading="isSaving" @click="handleSave">
        {{ t('common.saveChanges') }}
      </el-button>
    </div>

    <!-- Section 1: Video Publishing Platforms -->
    <section class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">
            {{ t('settings.videoPublishingPlatforms') || 'Video Publishing Platforms' }}
          </h3>
          <p class="text-xs text-[var(--el-text-color-secondary)] mt-0.5">
            {{ t('settings.videoPublishingDesc') || 'Enable platforms to allow studio creators to link multiple distribution channels.' }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <!-- YouTube Shorts -->
        <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center text-lg">
                <el-icon :size="20"><VideoPlay /></el-icon>
              </div>
              <div>
                <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ t('settings.youtubeShorts') }}</h4>
                <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.googleCloudOAuth') }}</p>
              </div>
            </div>
            <el-switch v-model="platformConfig.publishing.youtube.enabled" size="small" />
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientId') }}
              </label>
              <input
                v-model="platformConfig.publishing.youtube.clientId"
                type="text"
                placeholder="Google OAuth Client ID"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientSecret') }}
              </label>
              <input
                v-model="platformConfig.publishing.youtube.clientSecret"
                type="password"
                placeholder="••••••••••••••••"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.redirectUri') }}
              </label>
              <input
                v-model="platformConfig.publishing.youtube.redirectUri"
                type="text"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-secondary)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- TikTok API -->
        <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-lg">
                <el-icon :size="20"><Film /></el-icon>
              </div>
              <div>
                <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ t('settings.tiktokForCreators') }}</h4>
                <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.tiktokOpenApi') }}</p>
              </div>
            </div>
            <el-switch v-model="platformConfig.publishing.tiktok.enabled" size="small" />
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientKey') }}
              </label>
              <input
                v-model="platformConfig.publishing.tiktok.clientKey"
                type="text"
                placeholder="TikTok App Client Key"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientSecret') }}
              </label>
              <input
                v-model="platformConfig.publishing.tiktok.clientSecret"
                type="password"
                placeholder="••••••••••••••••"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.redirectUri') }}
              </label>
              <input
                v-model="platformConfig.publishing.tiktok.redirectUri"
                type="text"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-secondary)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Meta Reels / Facebook -->
        <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-500 flex items-center justify-center text-lg">
                <el-icon :size="20"><Share /></el-icon>
              </div>
              <div>
                <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ t('platforms.metaReels') }}</h4>
                <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('platforms.facebookGraphApi') }}</p>
              </div>
            </div>
            <el-switch v-model="platformConfig.publishing.facebook.enabled" size="small" />
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.appId') }}
              </label>
              <input
                v-model="platformConfig.publishing.facebook.appId"
                type="text"
                placeholder="Meta Graph App ID"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.appSecret') }}
              </label>
              <input
                v-model="platformConfig.publishing.facebook.appSecret"
                type="password"
                placeholder="••••••••••••••••"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.redirectUri') }}
              </label>
              <input
                v-model="platformConfig.publishing.facebook.redirectUri"
                type="text"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-secondary)] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 2: Single Sign-On (SSO) Providers -->
    <section class="space-y-6">
      <div>
        <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">
          {{ t('settings.ssoProviders') || 'Single Sign-On (SSO) Providers' }}
        </h3>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-0.5">
          {{ t('settings.ssoProvidersDesc') || 'Control which social login buttons appear on the studio Sign In and Sign Up screens.' }}
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <!-- Google SSO -->
        <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center text-lg">
                <el-icon :size="20"><Platform /></el-icon>
              </div>
              <div>
                <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ t('settings.googleSSO') }}</h4>
                <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('platforms.signInGoogle') }}</p>
              </div>
            </div>
            <el-switch v-model="platformConfig.sso.google.enabled" size="small" />
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientId') }}
              </label>
              <input
                v-model="platformConfig.sso.google.clientId"
                type="text"
                :placeholder="t('settings.googleClientIdPlaceholder')"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientSecret') }}
              </label>
              <input
                v-model="platformConfig.sso.google.clientSecret"
                type="password"
                placeholder="••••••••••••••••"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <!-- GitHub SSO -->
        <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-[var(--el-fill-color-light)] text-[var(--el-color-primary)] flex items-center justify-center text-lg border border-[var(--el-border-color)]">
                <el-icon :size="20"><Connection /></el-icon>
              </div>
              <div>
                <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ t('settings.githubSSO') }}</h4>
                <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('platforms.signInGithub') }}</p>
              </div>
            </div>
            <el-switch v-model="platformConfig.sso.github.enabled" size="small" />
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientId') }}
              </label>
              <input
                v-model="platformConfig.sso.github.clientId"
                type="text"
                :placeholder="t('settings.githubClientIdPlaceholder')"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.clientSecret') }}
              </label>
              <input
                v-model="platformConfig.sso.github.clientSecret"
                type="password"
                placeholder="••••••••••••••••"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <!-- Facebook SSO -->
        <div class="p-5 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-500 flex items-center justify-center text-lg">
                <el-icon :size="20"><Share /></el-icon>
              </div>
              <div>
                <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ t('settings.facebookSSO') }}</h4>
                <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('platforms.signInFacebook') }}</p>
              </div>
            </div>
            <el-switch v-model="platformConfig.sso.facebook.enabled" size="small" />
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.appId') }}
              </label>
              <input
                v-model="platformConfig.sso.facebook.appId"
                type="text"
                :placeholder="t('settings.facebookAppIdPlaceholder')"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--el-text-color-secondary)] mb-1">
                {{ t('common.appSecret') }}
              </label>
              <input
                v-model="platformConfig.sso.facebook.appSecret"
                type="password"
                placeholder="••••••••••••••••"
                class="w-full bg-[var(--el-bg-color-page)] border border-[var(--el-border-color)] rounded-xl px-3 py-2 text-xs text-[var(--el-text-color-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

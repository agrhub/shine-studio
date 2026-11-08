<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Bot } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChatStore } from '@/stores/chatStore';
import LanguageSelect from '@/components/shared/LanguageSelect.vue';
// The wizard is large and only needed when opened: load it on demand.
const SeriesWizardModal = defineAsyncComponent(() => import('@/components/modals/SeriesWizardModal.vue'));
import ShineAssistantSidebar from '@/components/assistant/ShineAssistantSidebar.vue';
import JobStatusPopover from '@/components/workspace/JobStatusPopover.vue';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { Sunny, Moon, User, Lock, SwitchButton, Fold, Expand, Plus, Right, Bell, Cpu } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();
const pipelineStore = usePipelineStore();
const { isDark } = storeToRefs(authStore);
const { isSidebarOpen } = storeToRefs(chatStore);

const isWizardOpen = ref(false);
const searchQuery = ref('');
const isCollapsed = ref(localStorage.getItem('shine_sidebar_collapsed') === 'true');

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value;
  localStorage.setItem('shine_sidebar_collapsed', String(isCollapsed.value));
}

function toggleTheme() {
  authStore.toggleDark();
  authStore.updatePreferences({ theme: isDark.value ? 'dark' : 'light' });
}

function goToProfile() {
  router.push('/settings');
}

function goToChangePassword() {
  router.push('/auth/forgot-password');
}

function handleLogout() {
  authStore.logout();
  router.push('/auth/login');
}

const navItems = computed(() => [
  { label: t('nav.series') || 'Projects', icon: 'Files', href: '/dashboard' },
  { label: t('editor.assetLibrary') || 'Assets', icon: 'Folder', href: '/assets' },
  { label: t('nav.analytics') || 'Analytics', icon: 'TrendCharts', href: '/analytics' },
  { label: t('settings.title') || 'Settings', icon: 'Setting', href: '/settings' },
]);

function isNavActive(itemHref: string) {
  if (itemHref === '/dashboard') {
    return route.path === '/dashboard' || route.path.startsWith('/projects');
  }
  return route.path.startsWith(itemHref);
}

function handleWizardCreated(id: string) {
  router.push(`/project/${id}`);
}
</script>

<template>
  <div id="app-layout" class="bg-[var(--el-bg-color-page)] text-[var(--el-text-color-primary)] font-sans antialiased min-h-screen flex overflow-hidden selection:bg-[var(--el-color-primary)] selection:text-[var(--el-text-color-primary)] w-full">
    <!-- Left Sidebar -->
    <aside
      class="bg-[var(--el-bg-color)] border-r border-[var(--el-border-color)] flex flex-col relative z-20 shrink-0 h-screen justify-between transition-all duration-300 ease-in-out select-none"
      :class="isCollapsed ? 'w-[76px]' : 'w-[280px] lg:w-[300px]'"
    >
      <div>
        <!-- Logo & Studio Tag & Collapse Toggle -->
        <div class="pt-8 pb-7" :class="isCollapsed ? 'px-3 flex flex-col items-center' : 'px-8'">
          <div v-if="!isCollapsed" class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-3">
              <span class="text-[11px] font-medium tracking-[0.25em] uppercase text-[var(--el-text-color-secondary)]">{{ t('common.studio') }}</span>
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--el-color-primary)] ring-4 ring-[var(--el-color-primary)]/20"></span>
            </div>
            <!-- Collapse Button (Expanded) -->
            <el-button
              @click="toggleSidebar"
              icon="Menu"
              :title="t('common.collapse')"
              size="large" circle text bg
            />
          </div>

          <div v-if="!isCollapsed">
            <router-link to="/dashboard" class="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
              <img src="/logo.png" alt="Shine Logo" class="h-8 w-auto object-contain shrink-0" />
              <span class="text-3xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">{{ t('common.brandName') }}.</span>
            </router-link>
          </div>

          <!-- Collapsed Header -->
          <div v-else class="flex flex-col items-center gap-3">
            <el-button
              @click="toggleSidebar"
              :title="t('common.expand')"
              icon="Menu" circle text bg size="large"
            >
            </el-button>
            <router-link to="/dashboard" class="flex items-center justify-center hover:opacity-90 transition-opacity" title="Shine Studio">
              <img src="/logo.png" alt="Shine Logo" class="h-9 w-9 object-contain rounded-lg" />
            </router-link>
          </div>
        </div>

        <!-- Navigation items -->
        <nav :class="isCollapsed ? 'px-2 space-y-2' : 'px-5 space-y-1.5'">
          <template v-for="item in navItems" :key="item.href">
            <!-- Collapsed with Tooltip -->
            <el-tooltip
              v-if="isCollapsed"
              :content="item.label"
              placement="right"
              :show-after="100"
            >
              <router-link
                :to="item.href"
                class="flex items-center justify-center w-12 h-12 mx-auto rounded-2xl transition-all relative font-medium text-sm"
                :class="isNavActive(item.href)
                  ? 'bg-[var(--el-card-bg-color)] shadow-sm border border-[var(--el-border-color)] text-[var(--el-color-primary)]'
                  : 'text-[var(--el-text-color-secondary)] hover:bg-[var(--el-card-bg-color)]/60 hover:text-[var(--el-text-color-primary)]'"
              >
                <span
                  v-if="isNavActive(item.href)"
                  class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--el-color-primary)] rounded-r-full"
                ></span>
                <el-icon :size="20" :class="isNavActive(item.href) ? 'text-[var(--el-color-primary)]' : 'text-[var(--el-text-color-secondary)]'">
                  <component :is="item.icon" />
                </el-icon>
              </router-link>
            </el-tooltip>

            <!-- Expanded Nav Link -->
            <router-link
              v-else
              :to="item.href"
              class="flex items-center gap-4 px-4 py-3 rounded-2xl transition-all relative font-medium text-sm"
              :class="isNavActive(item.href)
                ? 'bg-[var(--el-card-bg-color)] shadow-sm border border-[var(--el-border-color)] text-[var(--el-text-color-primary)]'
                : 'text-[var(--el-text-color-secondary)] hover:bg-[var(--el-card-bg-color)]/60 hover:text-[var(--el-text-color-primary)]'"
            >
              <span
                v-if="isNavActive(item.href)"
                class="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 bg-[var(--el-color-primary)] rounded-r-full"
              ></span>
              <el-icon :size="18" :class="isNavActive(item.href) ? 'text-[var(--el-text-color-regular)]' : 'text-[var(--el-text-color-secondary)]'">
                <component :is="item.icon" />
              </el-icon>
              <span>{{ item.label }}</span>
            </router-link>
          </template>
        </nav>
      </div>

      <!-- Footer: Launch New Series -->
      <div :class="isCollapsed ? 'p-3 flex justify-center' : 'p-6'">
        <!-- Collapsed New Series Icon Button -->
        <el-tooltip
          v-if="isCollapsed"
          :content="t('dashboard.newSeriesBtn')"
          placement="right"
          :show-after="100"
        >
          <button
            id="launch-new-series-btn-collapsed"
            @click="isWizardOpen = true"
            class="w-12 h-12 rounded-2xl bg-[var(--el-color-primary)] hover:bg-[var(--el-color-primary-light-3)] text-white flex items-center justify-center shadow-md transition-transform active:scale-95 cursor-pointer"
          >
            <el-icon :size="20"><Plus /></el-icon>
          </button>
        </el-tooltip>

        <!-- Expanded Full Button -->
        <el-button
          v-else
          id="launch-new-series-btn"
          type="primary"
          round
          size="large"
          class="!w-full !h-12 !font-semibold !rounded-2xl"
          @click="isWizardOpen = true"
        >
          <span>{{ t('dashboard.newSeriesBtn') }}</span>
          <el-icon class="-rotate-45 text-sm ml-2"><Right /></el-icon>
        </el-button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col h-screen overflow-hidden relative min-w-0">
      <!-- Top Header -->
      <header class="h-20 px-8 lg:px-10 flex items-center justify-between shrink-0 border-b border-[var(--el-border-color)]/40 bg-[var(--el-bg-color-page)]/80 backdrop-blur-sm z-10">
        <div class="relative w-full max-w-[360px]">
        </div>

        <div class="flex items-center gap-3">
          <LanguageSelect />

          <!-- Theme Toggle Button -->
          <button
            @click="toggleTheme"
            class="w-10 h-10 rounded-full bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] flex items-center justify-center text-[var(--el-text-color-regular)] hover:text-[var(--el-text-color-primary)] transition-colors shadow-soft hover:shadow cursor-pointer"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          >
            <el-icon :size="16"><Sunny v-if="!isDark" /><Moon v-else /></el-icon>
          </button>

          <!-- Global Pipeline Task & Background Job Monitor -->
          <JobStatusPopover />

          <!-- Shine Assistant Right Sidebar Toggle Button -->
          <button
            @click="chatStore.toggleSidebar"
            class="h-10 px-3.5 rounded-full border flex items-center gap-2 transition-all shadow-soft cursor-pointer text-xs font-semibold select-none"
            :class="isSidebarOpen
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10'
              : 'bg-[var(--el-card-bg-color)] border-[var(--el-border-color)] text-[var(--el-text-color-regular)] hover:text-[var(--el-text-color-primary)] hover:border-emerald-500/30'"
            title="Toggle Dedicated Shine Assistant"
          >
            <el-icon :size="15" class="text-emerald-400"><Bot /></el-icon>
            <span class="hidden sm:inline">Assistant</span>
            <span class="w-2 h-2 rounded-full bg-emerald-500" :class="isSidebarOpen ? 'animate-pulse' : 'opacity-60'"></span>
          </button>

          <!-- Profile avatar with Popover Menu -->
          <el-popover
            placement="bottom-end"
            :width="220"
            trigger="click"
            popper-class="!p-0 !rounded-2xl !border-[var(--el-border-color)] !bg-[var(--el-card-bg-color)] shadow-lg"
          >
            <template #reference>
              <div class="relative cursor-pointer select-none">
                <img
                  :src="authStore.user?.avatar || '/images/avatars/avatar-default.jpg'"
                  alt="avatar"
                  class="w-10 h-10 rounded-full object-cover ring-1 ring-[var(--el-border-color)] shadow-soft hover:ring-[var(--el-color-primary)] transition-all"
                />
              </div>
            </template>

            <div class="p-4 border-b border-[var(--el-border-color)] flex items-center gap-3">
              <img
                :src="authStore.user?.avatar || '/images/avatars/avatar-default.jpg'"
                alt="avatar"
                class="w-10 h-10 rounded-full object-cover ring-1 ring-[var(--el-border-color)]"
              />
              <div class="min-w-0">
                <p class="text-sm font-semibold text-[var(--el-text-color-primary)] truncate">{{ authStore.user?.name || 'Creator' }}</p>
                <p class="text-xs text-[var(--el-text-color-secondary)] truncate">{{ authStore.user?.email || 'creator@shine.studio' }}</p>
              </div>
            </div>

            <div class="p-2 space-y-1">
              <button
                @click="goToProfile"
                class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-xl text-[var(--el-text-color-regular)] hover:text-[var(--el-text-color-primary)] hover:bg-[var(--el-bg-color)] transition-colors cursor-pointer text-left"
              >
                <el-icon :size="16"><User /></el-icon>
                <span>{{ t('common.profile') }}</span>
              </button>

              <button
                @click="goToChangePassword"
                class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-xl text-[var(--el-text-color-regular)] hover:text-[var(--el-text-color-primary)] hover:bg-[var(--el-bg-color)] transition-colors cursor-pointer text-left"
              >
                <el-icon :size="16"><Lock /></el-icon>
                <span>{{ t('auth.changePassword') }}</span>
              </button>

              <div class="my-1 border-t border-[var(--el-border-color)]"></div>

              <button
                @click="handleLogout"
                class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-xl text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer text-left font-medium"
              >
                <el-icon :size="16"><SwitchButton /></el-icon>
                <span>{{ t('auth.logout') }}</span>
              </button>
            </div>
          </el-popover>
        </div>
      </header>

      <!-- Main View Container -->
      <div class="flex-1 overflow-y-auto flex flex-col min-h-0">
        <router-view />
      </div>
    </main>

    <!-- Dedicated Right Sidebar Chatbot -->
    <ShineAssistantSidebar />

    <!-- Series Wizard Modal -->
    <SeriesWizardModal v-model="isWizardOpen" @created="handleWizardCreated" />
  </div>
</template>

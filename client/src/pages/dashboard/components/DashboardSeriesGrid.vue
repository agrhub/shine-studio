<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { type Series } from '@/types/api';
import { toast } from 'vue-sonner';

const { t } = useI18n();
const router = useRouter();
const seriesStore = useSeriesStore();
const authStore = useAuthStore();

const emit = defineEmits<{
  (e: 'openWizard'): void;
}>();

// Search, Filter & Pagination states for Projects section
const projectSearchQuery = ref('');
const projectStatusFilter = ref('ALL'); // 'ALL' | 'ACTIVE' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
const currentPage = ref(1);
const pageSize = ref(8);
const loading = ref(false);

// Active series items (loaded from real backend API, with clean fallback images)
const fallbackImages = [
  '/images/dashboard/poster-1.jpg',
  '/images/dashboard/poster-2.jpg',
  '/images/dashboard/poster-3.jpg',
  '/images/dashboard/poster-4.jpg',
  '/images/dashboard/poster-5.jpg',
];

const allSeriesList = computed(() => {
  if (Array.isArray(seriesStore.seriesList) && seriesStore.seriesList.length > 0) {
    return seriesStore.seriesList.map((s: Series, idx: number) => {
      const totalEps = s.episode_count || 1;
      const pubEps = typeof s.published_episode_count === 'number' ? s.published_episode_count : 0;
      return {
        id: s.id,
        title: s.title,
        genre: s.genre || 'Drama',
        episode_count: totalEps,
        published_episode_count: pubEps,
        status: s.status || 'DRAFT',
        subtitle: `${t('dashboard.statEpisodes')}: ${totalEps} · ${s.genre || 'Drama'}`,
        tag: s.status === 'PUBLISHED' ? t('series.published') : s.status === 'ACTIVE' ? t('series.active') : s.status === 'ARCHIVED' ? 'Archived' : t('series.draft'),
        tagClass: s.status === 'ACTIVE'
          ? 'bg-[var(--el-color-primary)] text-[var(--el-color-primary-foreground,#002112)]'
          : s.status === 'ARCHIVED'
          ? 'bg-neutral-500/20 text-neutral-400 border border-neutral-500/30'
          : 'bg-[var(--el-bg-color)] text-[var(--el-text-color-primary)]',
        image: s.cover_image || fallbackImages[idx % fallbackImages.length],
      };
    });
  }
  return [];
});

const filteredSeriesList = computed(() => {
  return allSeriesList.value.filter(s => {
    const matchesSearch = !projectSearchQuery.value ||
      s.title.toLowerCase().includes(projectSearchQuery.value.toLowerCase()) ||
      s.genre.toLowerCase().includes(projectSearchQuery.value.toLowerCase());
    const matchesStatus = projectStatusFilter.value === 'ALL' || s.status === projectStatusFilter.value;
    return matchesSearch && matchesStatus;
  });
});

const paginatedSeries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSeriesList.value.slice(start, start + pageSize.value);
});

const totalFilteredCount = computed(() => filteredSeriesList.value.length);

function handleFilterChange(filter: string) {
  projectStatusFilter.value = filter;
  currentPage.value = 1;
}

function handleSearchInput() {
  currentPage.value = 1;
}

// ─── Series Actions (Rename, Archive, S3-Purge Delete) ────────────────────────
async function handleRenameSeries(series: any) {
  try {
    loading.value = true;
    const { value } = await ElMessageBox.prompt(
      'Enter new title for this micro-drama series:',
      'Rename Series',
      {
        inputValue: series.title,
        confirmButtonText: 'Save',
        cancelButtonText: 'Cancel',
        inputValidator: (val) => (!val || !val.trim() ? 'Title cannot be empty' : true),
      }
    );
    if (value && value.trim()) {
      await seriesStore.renameSeries(series.id, value.trim());
      await seriesStore.fetchSeriesList({ userId: authStore.user?.id });
      toast.success(t('toast.seriesRenamed'));
    }
  } catch {
    // cancelled
  }
  loading.value = false;
}

async function handleArchiveSeries(series: any) {
  try {
    loading.value = true;
    await ElMessageBox.confirm(
      `Are you sure you want to archive "${series.title}"? It can be restored at any time.`,
      'Archive Series',
      {
        confirmButtonText: 'Archive',
        cancelButtonText: 'Cancel',
        type: 'info',
      }
    );
    await seriesStore.archiveSeries(series.id);
    await seriesStore.fetchSeriesList({ userId: authStore.user?.id });
    toast.success(t('toast.seriesArchived'));
  } catch {
    // cancelled
  }
  loading.value = false;
}

async function handleUnarchiveSeries(series: any) {
  try {
    loading.value = true;
    await seriesStore.unarchiveSeries(series.id);
    await seriesStore.fetchSeriesList({ userId: authStore.user?.id });
    toast.success(t('toast.seriesUnarchived'));
  } catch {
    // cancelled
  }
  loading.value = false;
}

async function handleDeleteSeries(series: any) {
  try {
    loading.value = true;
    await ElMessageBox.confirm(
      `Are you sure you want to permanently delete "${series.title}"? All associated media files and generated assets on cloud S3 storage will be completely purged. This action cannot be undone.`,
      'Delete Series Permanently',
      {
        confirmButtonText: 'Delete Permanently',
        cancelButtonText: 'Cancel',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    );
    await seriesStore.deleteSeries(series.id);
    await seriesStore.fetchSeriesList({ userId: authStore.user?.id });
    toast.success(t('toast.seriesDeleted'));
  } catch {
    // cancelled
  }
  loading.value = false;
}

function handleSeriesAction(command: string, series: any) {
  if (command === 'rename') {
    handleRenameSeries(series);
  } else if (command === 'archive') {
    handleArchiveSeries(series);
  } else if (command === 'unarchive') {
    handleUnarchiveSeries(series);
  } else if (command === 'delete') {
    handleDeleteSeries(series);
  }
}
</script>

<template>
  <!-- Row 3: Projects Roster (Search, Filter, Paging) -->
  <section class="space-y-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h3 class="text-xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">{{ t('nav.series') }}</h3>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-0.5">{{ t('dashboard.subtitle') }}</p>
      </div>

      <!-- Filter tabs & Search Bar -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- Status Filter Tabs -->
        <div class="inline-flex p-1 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft text-xs font-medium">
          <button
            v-for="tab in [
              { key: 'ALL', label: t('dashboard.filterAll') },
              { key: 'ACTIVE', label: t('dashboard.filterActive') },
              { key: 'DRAFT', label: t('dashboard.filterDraft') },
              { key: 'PUBLISHED', label: t('dashboard.filterPublished') },
              { key: 'ARCHIVED', label: 'Archived' }
            ]"
            :key="tab.key"
            @click="handleFilterChange(tab.key)"
            :class="[
              'px-3.5 py-1.5 rounded-xl transition-all cursor-pointer',
              projectStatusFilter === tab.key
                ? 'bg-[var(--el-color-primary)] text-[var(--el-color-primary-foreground,#002112)] font-semibold shadow-xs'
                : 'text-[var(--el-text-color-secondary)] hover:text-[var(--el-text-color-primary)]'
            ]"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative w-48 sm:w-60">
          <el-input
            v-model="projectSearchQuery"
            @input="handleSearchInput"
            type="text"
            :placeholder="t('dashboard.searchPlaceholder')"
            class="w-full bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl p-1 placeholder:text-[var(--el-text-color-secondary)] outline-none focus:border-[var(--el-color-primary)] transition-colors shadow-soft"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </div>
    </div>

    <!-- Loading State Skeleton -->
    <div v-if="seriesStore.isLoading || loading" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5">
      <!-- Add New Drama skeleton -->
      <div class="rounded-[24px] border-2 border-dashed border-[var(--el-border-color)] bg-[var(--el-card-bg-color)]/40 p-6 flex flex-col items-center justify-center text-center min-h-[300px] shadow-soft animate-pulse">
        <div class="w-14 h-14 rounded-2xl bg-[var(--el-fill-color)] mb-4"></div>
        <div class="h-4 bg-[var(--el-fill-color-dark)] rounded w-28 mb-2"></div>
        <div class="h-3 bg-[var(--el-fill-color)] rounded w-36"></div>
      </div>
      <!-- Shimmer cards -->
      <div
        v-for="n in 4"
        :key="n"
        class="rounded-[24px] overflow-hidden border border-[var(--el-border-color)] shadow-soft bg-[var(--el-card-bg-color)] p-0 animate-pulse flex flex-col justify-between min-h-[300px]"
      >
        <div>
          <div class="aspect-[1/1] bg-[var(--el-fill-color)] relative">
            <div class="absolute top-3.5 left-3.5 w-16 h-5 rounded-full bg-[var(--el-fill-color-darker)]"></div>
          </div>
          <div class="p-5 space-y-2.5">
            <div class="h-4 bg-[var(--el-fill-color-dark)] rounded w-3/4"></div>
            <div class="h-3 bg-[var(--el-fill-color)] rounded w-1/2"></div>
          </div>
        </div>
        <div class="px-5 pb-5 pt-3 border-t border-[var(--el-border-color)]/40 flex items-center justify-between">
          <div class="h-3 bg-[var(--el-fill-color)] rounded w-20"></div>
          <div class="h-3 bg-[var(--el-fill-color)] rounded w-16"></div>
        </div>
      </div>
    </div>

    <!-- Projects Grid -->
    <div v-else-if="paginatedSeries.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5">
      <!-- Add New Series Quick Card -->
      <div
        class="rounded-[24px] border-2 border-dashed border-[var(--el-border-color)] hover:border-[var(--el-color-primary)] bg-[var(--el-card-bg-color)]/50 hover:bg-[var(--el-card-bg-color)] transition-all cursor-pointer p-6 flex flex-col items-center justify-center text-center group min-h-[300px] shadow-soft hover:shadow-md hover:-translate-y-1 duration-300"
        @click="emit('openWizard')"
      >
        <div class="w-14 h-14 rounded-2xl bg-[var(--el-color-primary)]/15 text-[var(--el-text-color-primary)] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <el-icon class="text-xl"><Plus /></el-icon>
        </div>
        <h4 class="font-semibold text-base text-[var(--el-text-color-primary)] mb-1">{{ t('dashboard.startNewDrama') }}</h4>
        <p class="text-xs text-[var(--el-text-color-secondary)]">{{ t('dashboard.startNewDramaDesc') }}</p>
      </div>

      <!-- Project Cards -->
      <div
        v-for="series in paginatedSeries"
        :key="series.id"
        class="group rounded-[24px] overflow-hidden border border-[var(--el-border-color)] hover:border-[var(--el-color-primary-light-5)] shadow-soft bg-[var(--el-card-bg-color)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between relative"
        @click="router.push(`/project/${series.id}`)"
      >
        <div>
          <div class="aspect-[1/1] overflow-hidden relative bg-[var(--el-bg-color)]">
            <el-image :src="series.image" 
              :alt="series.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              :preview-src-list="[series.image]">
              <template #error>
                <img src="/images/dashboard/poster-1.jpg" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </template>
            </el-image>
            <el-tag class="absolute top-3.5 left-3.5 !border-none font-bold" type="primary" size="small" round>{{ series.tag }}</el-tag>
            <!-- 3-Dots Action Menu -->
            <div class="absolute top-3.5 right-3.5 z-20" @click.stop>
              <el-dropdown trigger="click" @command="(cmd: string) => handleSeriesAction(cmd, series)">
                <el-button type="primary" size="small" text bg circle icon="More"></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="rename">
                      <el-icon class="mr-2 text-xs"><Edit /></el-icon> {{ t('common.edit') }}
                    </el-dropdown-item>
                    <el-dropdown-item :command="series.status === 'ARCHIVED' ? 'unarchive' : 'archive'">
                      <el-icon class="mr-2 text-xs"><Folder /></el-icon> {{ series.status === 'ARCHIVED' ? 'Unarchive' : t('series.archived') }}
                    </el-dropdown-item>
                    <el-dropdown-item divided command="delete" class="!text-red-500 font-semibold">
                      <el-icon class="mr-2 text-xs"><Delete /></el-icon> {{ t('common.delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
          <div class="p-5">
            <h4 class="font-semibold text-base text-[var(--el-text-color-primary)] group-hover:text-[var(--el-color-primary)] transition-colors line-clamp-1">{{ series.title }}</h4>
            <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">{{ series.subtitle }}</p>
          </div>
        </div>
        <div class="px-5 pb-5 pt-0 flex items-center justify-between text-xs text-[var(--el-text-color-secondary)] border-t border-[var(--el-border-color)]/40 mt-auto pt-3">
          <div class="flex items-center gap-1.5 font-medium">
            <span
              class="inline-block w-2 h-2 rounded-full"
              :class="series.published_episode_count > 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-neutral-400/60'"
            ></span>
            <span>{{ series.published_episode_count }}/{{ series.episode_count }} {{ t('dashboard.statPublished') }}</span>
          </div>
          <span class="font-semibold text-[var(--el-color-primary)] group-hover:underline flex items-center gap-1">
            {{ t('dashboard.openStudioBtn') }} <el-icon class="text-[10px]"><Right /></el-icon>
          </span>
        </div>
      </div>
    </div>

    <!-- Empty Filter/Search State -->
    <div
      v-else
      class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-3xl p-12 text-center shadow-soft"
    >
      <div class="w-14 h-14 rounded-full bg-[var(--el-bg-color)] flex items-center justify-center text-[var(--el-text-color-secondary)] mx-auto mb-4 text-xl">
        <el-icon :size="24"><FolderOpened /></el-icon>
      </div>
      <h4 class="font-semibold text-lg text-[var(--el-text-color-primary)] mb-1">{{ t('dashboard.noSeries') }}</h4>
      <p class="text-xs text-[var(--el-text-color-secondary)] mb-5">{{ t('dashboard.noSeriesDesc') }}</p>
      <el-button
        type="primary"
        round size="large"
        @click="emit('openWizard')"
        icon="Plus"
      >
        {{ t('dashboard.newSeriesBtn') }}
      </el-button>
    </div>

    <!-- Pagination -->
    <div v-if="totalFilteredCount > pageSize" class="flex justify-center pt-2">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalFilteredCount"
        layout="prev, pager, next"
        background
        class="!text-[var(--el-text-color-primary)]"
      />
    </div>
  </section>
</template>

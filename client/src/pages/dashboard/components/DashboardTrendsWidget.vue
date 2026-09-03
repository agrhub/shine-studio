<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import CountryFlag from '@/components/common/CountryFlag.vue';
import { WORLD_COUNTRIES, findCountry, getDefaultCountryForLocale } from '@/constants/countries';
import http from '@/utils/http';
import { useTrendStore } from '@/stores/useTrendStore';

const { t, locale } = useI18n();

const emit = defineEmits<{
  (e: 'selectTrend', topic: any): void;
}>();

// Hot Trend Widget state
const trendStore = useTrendStore();
const selectedTrendCountry = ref<string>(getDefaultCountryForLocale(locale.value).name);
const selectedCountryObj = computed(() => findCountry(selectedTrendCountry.value));
const viralTopics = ref<any[]>([]);
const isFetchingTrends = ref<boolean>(false);
const trendsError = ref<string>('');

const popularCountries = computed(() => {
  const current = selectedCountryObj.value;
  const list = WORLD_COUNTRIES.filter((c) => c.isPopular);
  if (current && !list.some(c => c.code === current.code)) {
    return [current, ...list];
  }
  // Put active country first in chips
  if (current) {
    return [current, ...list.filter(c => c.code !== current.code)];
  }
  return list;
});
const allCountries = WORLD_COUNTRIES;

async function fetchViralTrends(countryName?: string, pageNumber: number = 1) {
  if (countryName && typeof countryName === 'string') {
    selectedTrendCountry.value = countryName;
  }
  isFetchingTrends.value = true;
  trendsError.value = '';
  try {
    const res = await trendStore.fetchViralTopics({
      country: selectedTrendCountry.value,
      language: locale.value,
      page: pageNumber,
      pageSize: 8,
    });
    if (res && Array.isArray(res)) {
      viralTopics.value = res;
    }
  } catch (e: any) {
    trendsError.value = e?.message || 'Failed to load trends';
  } finally {
    isFetchingTrends.value = false;
  }
}

function handlePageChange(newPage: number) {
  fetchViralTrends(selectedTrendCountry.value, newPage);
}

function handleCreateFromTrend(topic: any) {
  const topicCopy = { ...topic, country: selectedTrendCountry.value };
  emit('selectTrend', topicCopy);
}

watch(locale, (newLocale) => {
  const targetCountry = getDefaultCountryForLocale(newLocale).name;
  selectedTrendCountry.value = targetCountry;
  fetchViralTrends(targetCountry, 1);
});

onMounted(() => {
  fetchViralTrends(undefined, 1);
});
</script>

<template>
  <!-- Row 3.5: Viral Hot Trends & Topics Widget -->
  <section class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-3xl p-6 sm:p-8 shadow-soft">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-orange-500/10 text-orange-500">
            <el-icon :size="16"><TrendCharts /></el-icon>
          </span>
          <h3 class="font-semibold text-lg tracking-tight text-[var(--el-text-color-primary)]">
            {{ t('trends.hotTrendsTitle') }}
          </h3>
          <el-tag size="small" type="danger" effect="plain" round class="text-[10px] font-bold tracking-wider uppercase">
            {{ t('trends.trendingNow') }}
          </el-tag>
        </div>
        <p class="text-xs text-[var(--el-text-color-secondary)]">
          {{ t('trends.hotTrendsSubtitle') }}
        </p>
      </div>

      <!-- Country Filter & Actions -->
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Popular country chips -->
        <div class="hidden sm:flex items-center gap-1.5">
          <el-button
            v-for="c in popularCountries.slice(0, 4)"
            :key="c.code"
            :type="selectedTrendCountry === c.name ? 'primary' : ''"
            round plain size="small" class="!ml-0"
            @click="fetchViralTrends(c.name)"
          >
            <CountryFlag :code="c.code" :flag="c.flag" size="small" />
            <span class="!ml-1">{{ c.nativeName || c.name }}</span>
          </el-button>
        </div>

        <!-- All Countries Select with CountryFlag -->
        <el-select
          v-model="selectedTrendCountry"
          @change="fetchViralTrends"
          filterable round
          class="!w-[200px]"
        >
          <template #prefix>
            <CountryFlag :code="selectedCountryObj?.code" size="small" class="mr-1 shrink-0" />
          </template>
          <el-option
            v-for="c in allCountries"
            :key="c.code"
            :label="c.name"
            :value="c.name"
          >
            <div class="flex items-center gap-2 py-0.5">
              <CountryFlag :code="c.code" size="small" />
              <span class="font-medium text-xs">{{ c.name }}</span>
              <span v-if="c.nativeName && c.nativeName !== c.name" class="text-[11px] text-[var(--el-text-color-secondary)]">({{ c.nativeName }})</span>
            </div>
          </el-option>
        </el-select>

        <!-- Refresh Button -->
        <el-button
          :loading="isFetchingTrends"
          @click="fetchViralTrends()"
          circle
          icon="Refresh"
        />
      </div>
    </div>

    <!-- Loading State Skeleton -->
    <div v-if="isFetchingTrends" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      <div
        v-for="n in 3"
        :key="n"
        class="rounded-2xl border border-[var(--el-border-color)] bg-[var(--el-bg-color)]/50 p-5 animate-pulse flex flex-col justify-between min-h-[200px]"
      >
        <div class="space-y-2.5">
          <div class="h-4 bg-[var(--el-fill-color)] rounded w-1/3"></div>
          <div class="h-5 bg-[var(--el-fill-color-dark)] rounded w-3/4"></div>
          <div class="h-3 bg-[var(--el-fill-color)] rounded w-full"></div>
          <div class="h-3 bg-[var(--el-fill-color)] rounded w-2/3"></div>
        </div>
        <div class="h-9 bg-[var(--el-fill-color)] rounded-xl mt-4"></div>
      </div>
    </div>

    <!-- Loaded Viral Topics Grid -->
    <div v-else-if="viralTopics.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      <div
        v-for="topic in viralTopics"
        :key="topic.topic || topic.title"
        @click="handleCreateFromTrend(topic)"
        class="group rounded-2xl border border-[var(--el-border-color)] hover:border-[var(--el-color-primary)] bg-[var(--el-bg-color)]/40 hover:bg-[var(--el-card-bg-color)] p-5 shadow-soft hover:shadow-md transition-all flex flex-col justify-between relative"
      >
        <div>
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <el-tag size="small" type="primary" effect="plain" round class="text-[10px] font-bold">
                {{ topic.genre || topic.category || topic.trope || 'Drama' }}
              </el-tag>
              <el-tag v-if="topic.hook_type || topic.hashtag_velocity" size="small" type="warning" effect="plain" round class="text-[10px] font-bold">
                {{ topic.hook_type || topic.hashtag_velocity }}
              </el-tag>
            </div>
            <el-tag round type="danger" effect="plain" size="small">
              <el-icon><TrendCharts /></el-icon>
              <span>{{ topic.engagement_score || 88 }}%</span>
            </el-tag>
          </div>

          <h4 class="font-semibold text-sm text-[var(--el-text-color-primary)] group-hover:text-[var(--el-color-primary)] transition-colors mb-1.5 line-clamp-1">
            {{ topic.topic || topic.title }}
          </h4>
          <p class="text-xs leading-relaxed text-[var(--el-text-color-secondary)] line-clamp-3 mb-4">
            {{ topic.description || topic.competitor_hook || topic.trope }}
          </p>
        </div>

        <div class="pt-3.5 border-t border-[var(--el-border-color)]/60 flex items-center justify-between gap-3">
          <div class="text-[11px] text-[var(--el-text-color-secondary)] flex items-center gap-1">
            <span>{{ topic.target_episodes || 24 }} {{ t('dashboard.statEpisodes') }}</span>
            <span>·</span>
            <span>{{ topic.duration_seconds || 60 }}s</span>
          </div>
          <el-button
            type="primary"
            size="small"
            round
            @click="handleCreateFromTrend(topic)"
            class="!font-bold shadow-xs hover:scale-105 transition-transform"
          >
            <el-icon class="mr-1"><MagicStick /></el-icon>
            <span>{{ t('wizard.createSeries') }}</span>
          </el-button>
        </div>
      </div>
    </div>

    <!-- Pagination Controls -->
    <div v-if="trendStore.total > trendStore.pageSize" class="mt-6 flex items-center justify-between gap-4 border-t border-[var(--el-border-color)]/40 pt-4">
      <div class="text-xs text-[var(--el-text-color-secondary)]">
        {{ t('common.showing') }} {{ ((trendStore.page - 1) * trendStore.pageSize) + 1 }} - {{ Math.min(trendStore.page * trendStore.pageSize, trendStore.total) }} {{ t('common.of') }} {{ trendStore.total }} {{ t('trends.hotTrendsTitle') }}
      </div>
      <el-pagination
        v-model:current-page="trendStore.page"
        :page-size="trendStore.pageSize"
        :total="trendStore.total"
        layout="prev, pager, next"
        background
        size="small"
        @current-change="handlePageChange"
      />
    </div>

    <!-- Empty / Error state -->
    <div
      v-else-if="!isFetchingTrends && viralTopics.length === 0"
      class="py-8 text-center text-xs text-[var(--el-text-color-secondary)]"
    >
      <p class="mb-3">{{ trendsError || t('wizard.noTrendsMsg') }}</p>
      <el-button type="primary" round size="small" @click="fetchViralTrends(undefined, 1)">
        {{ t('common.refresh') }}
      </el-button>
    </div>
  </section>
</template>

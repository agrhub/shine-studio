<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ApexCharts from 'apexcharts';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'vue-sonner';
import http from '@/utils/http';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import EpisodeAudienceFeedback from '@/components/analytics/EpisodeAudienceFeedback.vue';

const { t } = useI18n();
const seriesStore = useSeriesStore();
const authStore = useAuthStore();
const { isDark } = storeToRefs(authStore);

const selectedSeriesId = ref<string>('');
const selectedTimeframe = ref<string>('30d');
const isLoading = ref<boolean>(false);

const retentionChartEl = ref<HTMLElement | null>(null);
const demoChartEl = ref<HTMLElement | null>(null);

let retentionChartInstance: ApexCharts | null = null;
let demoChartInstance: ApexCharts | null = null;

const timeframes = computed(() => [
  { id: '7d', label: t('analytics.last7Days') },
  { id: '30d', label: t('analytics.last30Days') },
  { id: '90d', label: t('analytics.last90Days') },
]);

const seriesOptions = computed(() => {
  if (Array.isArray(seriesStore.seriesList) && seriesStore.seriesList.length > 0) {
    return seriesStore.seriesList.map(s => ({
      id: s.id,
      title: s.title,
    }));
  }
  return [];
});

const stats = ref({
  avgRetention: '0.0%',
  retentionChange: '0.0%',
  watchTime: '0',
  watchTimeChange: '0.0%',
  completionRate: '0.0%',
  completionChange: '0.0%',
  peakConcurrent: '0',
  peakChange: '0.0%',
});

const chartData = ref({
  categories: ['0:00', '0:15', '0:30', '0:45', '1:00', '1:15', '1:30', '1:45', '2:00', '2:15', '2:30', '2:45', '3:00', '3:15', '3:30'],
  currentSeries: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  benchmark: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const demographics = ref({
  series: [0, 0, 0],
  labels: ['18-24', '25-34', '35+'],
  topRegion: 'N/A',
  coreAge: 'N/A',
  coreGroup: 'None',
});

const rawHeatmap = ref<any[]>([]);

const heatmapPoints = computed(() => {
  return rawHeatmap.value.map(item => ({
    time: item.time,
    title: t(`analytics.${item.titleKey}`) || item.titleKey,
    desc: t(`analytics.${item.descKey}`) || item.descKey,
    badgeClass: item.badgeClass,
    icon: item.icon,
  }));
});

function renderRetentionChart() {
  if (!retentionChartEl.value) return;
  if (retentionChartInstance) {
    retentionChartInstance.destroy();
    retentionChartInstance = null;
  }

  const dark = isDark.value;
  const mint = '#3ecf8e';
  const axisColor = dark ? '#888888' : '#707572';
  const borderColor = dark ? 'rgba(255,255,255,0.08)' : '#e6e8e7';

  const retentionOptions: ApexCharts.ApexOptions = {
    series: [
      { name: t('analytics.currentSeries'), data: chartData.value.currentSeries },
      { name: t('analytics.globalBenchmark'), data: chartData.value.benchmark },
    ],
    chart: {
      height: 340,
      type: 'area',
      toolbar: { show: false },
      fontFamily: 'Outfit, sans-serif',
      background: 'transparent',
    },
    colors: [mint, dark ? 'rgba(255,255,255,0.25)' : 'rgba(23, 23, 23, 0.2)'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.02,
        stops: [0, 90, 100],
      },
    },
    stroke: { curve: 'smooth', width: 3 },
    dataLabels: { enabled: false },
    xaxis: {
      categories: chartData.value.categories,
      labels: { style: { colors: axisColor, fontSize: '11px', fontFamily: 'Outfit' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: axisColor, fontSize: '11px', fontFamily: 'Outfit' },
        formatter: (v: number) => `${v}%`,
      },
      min: 0,
      max: 100,
    },
    grid: {
      borderColor: borderColor,
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
    },
    legend: { show: false },
    theme: { mode: dark ? 'dark' : 'light' },
    tooltip: {
      theme: dark ? 'dark' : 'light',
      x: { show: true },
    },
  };

  retentionChartInstance = new ApexCharts(retentionChartEl.value, retentionOptions);
  retentionChartInstance.render();
}

function renderDemoChart() {
  if (!demoChartEl.value) return;
  if (demoChartInstance) {
    demoChartInstance.destroy();
    demoChartInstance = null;
  }

  const dark = isDark.value;
  const mint = '#3ecf8e';

  const demoOptions: ApexCharts.ApexOptions = {
    series: demographics.value.series,
    chart: {
      type: 'donut',
      height: 250,
      fontFamily: 'Outfit, sans-serif',
      background: 'transparent',
    },
    labels: demographics.value.labels,
    colors: [mint, '#4ade80', '#22c55e'],
    stroke: { width: 0 },
    legend: {
      show: true,
      position: 'bottom',
      horizontalAlign: 'center',
      fontSize: '12px',
      labels: { colors: dark ? '#ffffff' : '#171717' },
      markers: { size: 6, shape: 'circle' },
    },
    plotOptions: {
      pie: {
        donut: {
          size: '75%',
          labels: {
            show: true,
            name: { color: dark ? '#ffffff' : '#171717' },
            value: { color: dark ? '#ffffff' : '#171717', fontSize: '24px', fontWeight: 600 },
            total: {
              show: true,
              label: demographics.value.coreGroup,
              color: mint,
              fontSize: '14px',
              fontWeight: 600,
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    theme: { mode: dark ? 'dark' : 'light' },
    tooltip: { theme: dark ? 'dark' : 'light' },
  };

  demoChartInstance = new ApexCharts(demoChartEl.value, demoOptions);
  demoChartInstance.render();
}

async function fetchAnalytics() {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    const res: any = await http.get('/analytics/insights', {
      params: {
        seriesId: selectedSeriesId.value,
        timeframe: selectedTimeframe.value,
        userId: authStore.user?.id || '',
      },
    });

    if (res?.data) {
      const data = res.data;
      if (data.kpi) {
        stats.value = { ...stats.value, ...data.kpi };
      }
      if (data.retentionChart) {
        chartData.value = data.retentionChart;
      }
      if (data.demographics) {
        demographics.value = data.demographics;
      }
      if (data.heatmap) {
        rawHeatmap.value = data.heatmap;
      }
    }
  } catch (e) {
    console.error('Failed to fetch analytics insights', e);
  } finally {
    isLoading.value = false;
    await nextTick();
    renderRetentionChart();
    renderDemoChart();
  }
}

function handleExportReport() {
  toast.success(t('analytics.reportExported'));
}

function handleSceneHighlightClick(item: any) {
  toast.info(t('analytics.sceneHighlightInfo', { title: item.title, time: item.time, desc: item.desc }));
}

const route = useRoute();

onMounted(async () => {
  await seriesStore.fetchSeriesList({ userId: authStore.user?.id });
  if (Array.isArray(seriesStore.seriesList) && seriesStore.seriesList.length > 0) {
    if (!selectedSeriesId.value) {
      const querySeriesId = route.query.seriesId as string;
      const hasQueryMatch = querySeriesId && seriesStore.seriesList.some(s => s.id === querySeriesId);
      const activeSeriesId = seriesStore.currentSeries?.id;
      const hasActiveMatch = activeSeriesId && seriesStore.seriesList.some(s => s.id === activeSeriesId);

      if (hasQueryMatch) {
        selectedSeriesId.value = querySeriesId;
      } else if (hasActiveMatch) {
        selectedSeriesId.value = activeSeriesId;
      } else {
        selectedSeriesId.value = seriesStore.seriesList[0].id;
      }
    } else {
      await fetchAnalytics();
    }
  } else {
    await fetchAnalytics();
  }
});

watch([selectedSeriesId, selectedTimeframe], ([newSeries, newTime], [oldSeries, oldTime]) => {
  if (newSeries && (newSeries !== oldSeries || newTime !== oldTime)) {
    fetchAnalytics();
  }
});

// Watch isDark theme switch and re-render ApexCharts dynamically
watch(isDark, async () => {
  await nextTick();
  renderRetentionChart();
  renderDemoChart();
});
</script>

<template>
  <div class="h-full overflow-y-auto px-6 lg:px-10 py-6 pb-16 font-sans">
    <!-- Top Filter Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div class="flex items-center gap-4 flex-wrap">
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">
          {{ t('analytics.retentionInsights') }}
        </h2>
        <div class="h-5 w-px bg-[var(--el-border-color)]"></div>

        <!-- Series Selector -->
        <el-select
          v-model="selectedSeriesId"
          :placeholder="t('analytics.selectSeries')"
          class="!w-[220px]"
          size="default"
        >
          <el-option
            v-for="s in seriesOptions"
            :key="s.id"
            :label="s.title"
            :value="s.id"
          />
        </el-select>
      </div>

      <div class="flex items-center gap-3">
        <!-- Timeframe Selector -->
        <el-select
          v-model="selectedTimeframe"
          :placeholder="t('analytics.period')"
          class="!w-[150px]"
          size="default"
        >
          <el-option
            v-for="tf in timeframes"
            :key="tf.id"
            :label="tf.label"
            :value="tf.id"
          />
        </el-select>

        <!-- Export Report Button -->
        <el-button
          type="primary"
          round
          @click="handleExportReport"
        >
          <el-icon class="mr-1.5 text-xs"><Download /></el-icon>
          <span>{{ t('analytics.exportReport') }}</span>
        </el-button>
      </div>
    </div>

    <!-- Top 4 Metric KPI Cards -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
      <!-- KPI 1 -->
      <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-[24px] p-6 shadow-soft hover:shadow-float transition-all duration-300">
        <div class="text-[var(--el-text-color-secondary)] text-[10px] font-bold uppercase tracking-widest mb-1">
          {{ t('analytics.avgRetention') }}
        </div>
        <div class="text-2xl font-semibold text-[var(--el-text-color-primary)]">
          {{ stats.avgRetention }}
        </div>
        <div class="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#3bcf8a] dark:text-[#72e3ad]">
          <el-icon><CaretTop /></el-icon> {{ stats.retentionChange }}
        </div>
      </div>

      <!-- KPI 2 -->
      <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-[24px] p-6 shadow-soft hover:shadow-float transition-all duration-300">
        <div class="text-[var(--el-text-color-secondary)] text-[10px] font-bold uppercase tracking-widest mb-1">
          {{ t('analytics.watchTime') }}
        </div>
        <div class="text-2xl font-semibold text-[var(--el-text-color-primary)]">
          {{ stats.watchTime }} <span class="text-sm text-[var(--el-text-color-secondary)] font-normal">{{ t('analytics.hrs') }}</span>
        </div>
        <div class="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#3bcf8a] dark:text-[#72e3ad]">
          <el-icon><CaretTop /></el-icon> {{ stats.watchTimeChange }}
        </div>
      </div>

      <!-- KPI 3 -->
      <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-[24px] p-6 shadow-soft hover:shadow-float transition-all duration-300">
        <div class="text-[var(--el-text-color-secondary)] text-[10px] font-bold uppercase tracking-widest mb-1">
          {{ t('analytics.completionRate') }}
        </div>
        <div class="text-2xl font-semibold text-[var(--el-text-color-primary)]">
          {{ stats.completionRate }}
        </div>
        <div class="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-amber-500 dark:text-amber-400">
          <el-icon><CaretBottom /></el-icon> {{ stats.completionChange }}
        </div>
      </div>

      <!-- KPI 4 -->
      <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-[24px] p-6 shadow-soft hover:shadow-float transition-all duration-300">
        <div class="text-[var(--el-text-color-secondary)] text-[10px] font-bold uppercase tracking-widest mb-1">
          {{ t('analytics.peakConcurrent') }}
        </div>
        <div class="text-2xl font-semibold text-[var(--el-text-color-primary)]">
          {{ stats.peakConcurrent }}
        </div>
        <div class="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#3bcf8a] dark:text-[#72e3ad]">
          <el-icon><CaretTop /></el-icon> {{ stats.peakChange }}
        </div>
      </div>
    </section>

    <!-- Main Visual Analytics Section -->
    <section class="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
      <!-- Retention Area Chart (8 cols) -->
      <div class="lg:col-span-8 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-[32px] p-6 lg:p-8 shadow-soft">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 class="font-semibold text-base text-[var(--el-text-color-primary)]">
            {{ t('analytics.viewerRetentionMap') }}
          </h3>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-[var(--el-color-primary)]"></span>
              <span class="text-xs text-[var(--el-text-color-secondary)]">{{ t('analytics.currentSeries') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-gray-400/50"></span>
              <span class="text-xs text-[var(--el-text-color-secondary)]">{{ t('analytics.globalBenchmark') }}</span>
            </div>
          </div>
        </div>
        <div ref="retentionChartEl" class="w-full min-h-[340px]"></div>
      </div>

      <!-- Demographic Donut Panel (4 cols) -->
      <div :class="[
        'lg:col-span-4 rounded-[32px] p-6 lg:p-8 shadow-soft relative overflow-hidden flex flex-col justify-between border transition-colors',
        isDark
          ? 'bg-[#171717] text-white border-white/10'
          : 'bg-white text-[var(--el-text-color-primary)] border-[var(--el-border-color)]'
      ]">
        <div class="absolute -right-20 -top-20 w-64 h-64 bg-[var(--el-color-primary)]/20 blur-[60px] rounded-full pointer-events-none"></div>
        <div class="relative h-full flex flex-col">
          <h3 class="font-semibold text-base mb-4">
            {{ t('analytics.demographicSplit') }}
          </h3>
          <div ref="demoChartEl" class="flex-1 flex items-center justify-center min-h-[250px]"></div>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div :class="[
              'rounded-2xl p-3.5 border transition-colors',
              isDark ? 'bg-white/5 border-white/10' : 'bg-[var(--el-fill-color-light)] border-[var(--el-border-color)]'
            ]">
              <p :class="[
                'text-[10px] uppercase tracking-widest font-bold mb-1',
                isDark ? 'text-white/50' : 'text-[var(--el-text-color-secondary)]'
              ]">
                {{ t('analytics.topRegion') }}
              </p>
              <p class="text-sm font-semibold">{{ demographics.topRegion }}</p>
            </div>
            <div :class="[
              'rounded-2xl p-3.5 border transition-colors',
              isDark ? 'bg-white/5 border-white/10' : 'bg-[var(--el-fill-color-light)] border-[var(--el-border-color)]'
            ]">
              <p :class="[
                'text-[10px] uppercase tracking-widest font-bold mb-1',
                isDark ? 'text-white/50' : 'text-[var(--el-text-color-secondary)]'
              ]">
                {{ t('analytics.coreAge') }}
              </p>
              <p class="text-sm font-semibold">{{ demographics.coreAge }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Engagement Heatmap Highlights -->
    <section class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-[32px] p-6 lg:p-8 shadow-soft">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <h3 class="font-semibold text-base text-[var(--el-text-color-primary)]">
          {{ t('analytics.heatmapHighlights') }}
        </h3>
        <span class="text-xs text-[var(--el-text-color-secondary)]">
          {{ t('analytics.heatmapHint') }}
        </span>
      </div>

      <div v-if="heatmapPoints.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div
          v-for="point in heatmapPoints"
          :key="point.time"
          @click="handleSceneHighlightClick(point)"
          class="group bg-[var(--el-fill-color-light)] rounded-2xl p-5 border border-[var(--el-border-color)]/60 hover:bg-[var(--el-card-bg-color)] hover:border-[var(--el-color-primary)] transition-all cursor-pointer shadow-soft hover:shadow"
        >
          <div class="flex items-center justify-between mb-3">
            <span :class="['text-xs font-bold', point.badgeClass]">
              {{ point.time }}
            </span>
            <el-icon :class="point.badgeClass"><component :is="point.icon" /></el-icon>
          </div>
          <p class="text-sm font-medium mb-1 truncate text-[var(--el-text-color-primary)]">
            {{ point.title }}
          </p>
          <p class="text-[11px] text-[var(--el-text-color-secondary)]">
            {{ point.desc }}
          </p>
        </div>
      </div>
      <div v-else class="py-8 text-center text-xs text-[var(--el-text-color-secondary)]">
        {{ t('analytics.noSeriesDesc') }}
      </div>
    </section>

    <!-- Episode Audience Intelligence & Adaptive Script Evolution -->
    <EpisodeAudienceFeedback
      v-if="selectedSeriesId"
      :series-id="selectedSeriesId"
    />
  </div>
</template>

<style scoped>
.shadow-soft {
  box-shadow: 0 1px 2px rgba(23, 23, 23, 0.04);
}
.shadow-float {
  box-shadow: 0 18px 40px -24px rgba(23, 23, 23, 0.45);
}
</style>

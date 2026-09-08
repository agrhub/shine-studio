<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { useAssetsStore } from '@/stores/useAssetsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBillingStore } from '@/stores/billingStore';
import DashboardHeroHeader from './components/DashboardHeroHeader.vue';
import DashboardStatsCards from './components/DashboardStatsCards.vue';
import DashboardSeriesGrid from './components/DashboardSeriesGrid.vue';
import DashboardTrendsWidget from './components/DashboardTrendsWidget.vue';
import DashboardAssetsAnalytics from './components/DashboardAssetsAnalytics.vue';
import SeriesWizardModal from '@/components/modals/SeriesWizardModal.vue';
import http from '@/utils/http';

const router = useRouter();
const seriesStore = useSeriesStore();
const assetsStore = useAssetsStore();
const authStore = useAuthStore();
const billingStore = useBillingStore();

const isWizardOpen = ref(false);
const selectedTrendForWizard = ref<any>(null);

function handleCreateFromTrend(topic: any) {
  selectedTrendForWizard.value = topic;
  isWizardOpen.value = true;
}

function handleOpenWizardDefault() {
  selectedTrendForWizard.value = null;
  isWizardOpen.value = true;
}

// Dynamic Dashboard Analytics from live backend API
const analyticsData = ref<any>({
  stats: {
    totalSeries: 0,
    activeSeries: 0,
    renderHours: 0.0,
    assetLibrarySizeGb: 0.0,
    creatorEarnings: 0.0,
    projectedYield: 0.0,
    viewerEngagementPct: 0.0,
    modelEfficiencyPct: 0.0,
    tokenVelocityPerHr: 0,
  },
  sparklines: {
    viewerEngagement: [0, 0, 0, 0, 0, 0, 0, 0],
    modelEfficiency: [0, 0, 0, 0, 0, 0, 0, 0],
    tokenVelocity: [0, 0, 0, 0, 0, 0, 0, 0],
  },
  cashflow: {
    categories: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'],
    income: [0, 0, 0, 0, 0, 0],
    expense: [0, 0, 0, 0, 0, 0],
  },
});

async function fetchDashboardAnalytics() {
  try {
    const res: any = await http.get('/analytics/dashboard', {
      params: { userId: authStore.user?.id || '' },
    });
    if (res && res.data && res.data.stats) {
      analyticsData.value = res.data;
    } else if (res && res.stats) {
      analyticsData.value = res;
    }
  } catch (err) {
    console.error('Failed to fetch dashboard analytics', err);
  }
}

onMounted(async () => {
  await Promise.allSettled([
    seriesStore.fetchSeriesList({ userId: authStore.user?.id }),
    billingStore.fetchTierInfo(),
    fetchDashboardAnalytics(),
    assetsStore.fetchAssets({ userId: authStore.user?.id }),
  ]);
});
</script>

<template>
  <div id="dashboard-page" class="w-full max-w-full overflow-x-hidden space-y-9 p-4 sm:p-6 font-sans text-[var(--el-text-color-primary)] pb-12">
    <!-- Top Welcome Banner -->
    <DashboardHeroHeader />

    <!-- Metric & Sparkline Cards -->
    <DashboardStatsCards :analytics-data="analyticsData" />

    <!-- Projects Roster (Search, Filter, Paging, Actions) -->
    <DashboardSeriesGrid @open-wizard="handleOpenWizardDefault" />

    <!-- Viral Hot Trends & Topics Widget -->
    <DashboardTrendsWidget @select-trend="handleCreateFromTrend" />

    <!-- Recent Assets & Cash Flow Chart -->
    <DashboardAssetsAnalytics :analytics-data="analyticsData" />

    <!-- Series Wizard Modal -->
    <SeriesWizardModal 
      v-model="isWizardOpen" 
      :initial-trend="selectedTrendForWizard"
      @created="id => router.push(`/project/${id}`)" 
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ApexCharts, { type ApexOptions } from 'apexcharts';
import { useAssetsStore } from '@/stores/useAssetsStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import { toast } from 'vue-sonner';

const { t } = useI18n();
const assetsStore = useAssetsStore();
const seriesStore = useSeriesStore();

const props = defineProps<{
  analyticsData: any;
}>();

let cashflowInstance: ApexCharts | null = null;

// Dynamic assets computed from real assetsStore or contextual series items
const displayAssets = computed(() => {
  if (assetsStore.assets && assetsStore.assets.length > 0) {
    return assetsStore.assets.slice(0, 5).map(file => ({
      name: file.name,
      type: (file.type || 'image').toUpperCase(),
      size: file.size || '12 MB',
      status: 'Ready',
      icon: file.type === 'video' ? 'VideoPlay' : file.type === 'audio' ? 'Headset' : 'Document',
      statusClass: 'text-[var(--el-color-primary-dark-2)] bg-[var(--el-color-primary-light-9)]',
    }));
  }

  // Fallback: extract rendered assets from active user series
  const extracted: any[] = [];
  if (Array.isArray(seriesStore.seriesList)) {
    for (const s of seriesStore.seriesList) {
      if (Array.isArray(s.characters)) {
        for (const char of s.characters) {
          if ((char as any).avatar_url || (char as any).image_url) {
            extracted.push({
              name: `${char.name} (${s.title})`,
              type: 'CHARACTER',
              size: '2.4 MB',
              status: 'Rendered',
              icon: 'User',
              statusClass: 'text-[var(--el-color-primary-dark-2)] bg-[var(--el-color-primary-light-9)]',
            });
          }
        }
      }
      if (Array.isArray(s.locations)) {
        for (const loc of s.locations) {
          if (loc.image_url) {
            extracted.push({
              name: `${loc.name} (${s.title})`,
              type: 'LOCATION',
              size: '3.8 MB',
              status: 'Rendered',
              icon: 'Picture',
              statusClass: 'text-[var(--el-color-primary-dark-2)] bg-[var(--el-color-primary-light-9)]',
            });
          }
        }
      }
      if (Array.isArray(s.props)) {
        for (const p of s.props) {
          if (p.image_url) {
            extracted.push({
              name: `${p.name} (${s.title})`,
              type: 'PROP',
              size: '1.8 MB',
              status: 'Rendered',
              icon: 'Goods',
              statusClass: 'text-[var(--el-color-primary-dark-2)] bg-[var(--el-color-primary-light-9)]',
            });
          }
        }
      }
    }
  }

  return extracted.slice(0, 5);
});

function handleWithdraw() {
  if ((props.analyticsData?.stats?.projectedYield || 0) <= 0) {
    toast.info(t('toast.noBalanceToWithdraw'));
  } else {
    toast.success(t('toast.payoutRequested'));
  }
}

function initCashflowChart() {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const computedStyle = getComputedStyle(document.documentElement);
  
  const mint = computedStyle.getPropertyValue('--el-color-primary').trim() || '#3ecf8e';
  const axis = computedStyle.getPropertyValue('--el-border-color').trim() || (isDarkMode ? '#282a29' : '#e6e8e7');
  const muted = computedStyle.getPropertyValue('--el-text-color-secondary').trim() || (isDarkMode ? '#868c88' : '#707572');
  const expenseBar = computedStyle.getPropertyValue('--el-border-color-light').trim() || (isDarkMode ? '#3d4a41' : '#cbd5e1');
  const tooltipTheme = isDarkMode ? 'dark' : 'light';

  const cashflowEl = document.querySelector('#cashflow') as HTMLElement | null;
  if (cashflowEl) {
    if (cashflowInstance) {
      cashflowInstance.destroy();
      cashflowInstance = null;
    }
    cashflowEl.innerHTML = '';

    const incomeData = props.analyticsData?.cashflow?.income || [0, 0, 0, 0, 0, 0];
    const rawExpenseData = props.analyticsData?.cashflow?.expense || [0, 0, 0, 0, 0, 0];
    const expenseData = rawExpenseData.map((v: number) => Math.abs(v));

    const options: ApexOptions = {
      chart: { type: 'bar', height: 200, toolbar: { show: false }, fontFamily: 'Outfit' },
      series: [
        { name: t('dashboard.income'), data: incomeData },
        { name: t('dashboard.expense'), data: expenseData },
      ],
      colors: [mint, expenseBar],
      plotOptions: { bar: { columnWidth: '52%', borderRadius: 5 } },
      legend: { show: false },
      grid: { borderColor: axis, strokeDashArray: 4, xaxis: { lines: { show: false } } },
      xaxis: {
        categories: props.analyticsData?.cashflow?.categories || ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'],
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: muted, fontSize: '10px' } },
      },
      yaxis: {
        labels: {
          style: { colors: muted, fontSize: '10px' },
          formatter: (v: number) => (Math.abs(v) > 999 ? `${v / 1000}k` : `${v}`),
        },
      },
      tooltip: { theme: tooltipTheme, y: { formatter: (v: number) => `$${Math.abs(v)}` } },
    };
    cashflowInstance = new ApexCharts(cashflowEl, options);
    cashflowInstance.render();
  }
}

onMounted(() => {
  if (!assetsStore.assets.length && !assetsStore.isLoading) {
    assetsStore.fetchAssets();
  }
  nextTick(() => {
    initCashflowChart();
  });

  const observer = new MutationObserver(() => {
    initCashflowChart();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

watch(
  () => props.analyticsData,
  () => {
    nextTick(() => {
      initCashflowChart();
    });
  },
  { deep: true }
);
</script>

<template>
  <!-- Row 4: Recent Assets & Cash Flow Chart -->
  <section class="grid grid-cols-1 lg:grid-cols-12 gap-5">
    <!-- Recent Assets Table -->
    <div class="lg:col-span-7 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-3xl p-6 shadow-soft">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-sm font-medium tracking-wide">{{ t('editor.assetLibrary') }}</h3>
        <router-link to="/assets" class="text-xs font-medium text-[var(--el-text-color-secondary)] hover:text-[var(--el-text-color-primary)] transition-colors">
          {{ t('common.edit') }}
        </router-link>
      </div>

      <div class="grid grid-cols-12 text-[10px] font-medium text-[var(--el-text-color-secondary)] tracking-widest uppercase px-2 pb-3 border-b border-[var(--el-border-color)]/70">
        <div class="col-span-5">{{ t('editor.assetName') }}</div>
        <div class="col-span-3">{{ t('common.type') }}</div>
        <div class="col-span-2">{{ t('editor.size') }}</div>
        <div class="col-span-2 text-right">{{ t('dashboard.tableStatus') }}</div>
      </div>

      <div class="divide-y divide-[var(--el-border-color)]/60">
        <div
          v-for="asset in displayAssets"
          :key="asset.name"
          class="grid grid-cols-12 items-center px-2 py-3.5 hover:bg-[var(--el-bg-color)]/50 rounded-xl transition-colors"
        >
          <div class="col-span-5 flex items-center gap-3 min-w-0 pr-2">
            <div class="w-9 h-9 rounded-xl bg-[var(--el-bg-color)] flex items-center justify-center text-[var(--el-text-color-regular)] shrink-0">
              <i :class="[asset.icon, 'text-sm']"></i>
            </div>
            <span class="text-sm font-medium truncate">{{ asset.name }}</span>
          </div>
          <div class="col-span-3 text-sm text-[var(--el-text-color-regular)]">{{ asset.type }}</div>
          <div class="col-span-2 text-sm text-[var(--el-text-color-regular)]">{{ asset.size }}</div>
          <div class="col-span-2 text-right">
            <span :class="['text-xs font-medium px-2 py-0.5 rounded-md inline-block', asset.statusClass]">
              {{ asset.status }}
            </span>
          </div>
        </div>

        <div v-if="displayAssets.length === 0" class="py-12 text-center text-xs text-[var(--el-text-color-secondary)]">
          {{ t('dashboard.noAssetsFound') }}
        </div>
      </div>
    </div>

    <!-- Cash Flow Chart & Projected Yield -->
    <div class="lg:col-span-5 flex flex-col gap-5">
      <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-3xl p-6 shadow-soft">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-sm font-medium tracking-wide text-[var(--el-text-color-primary)]">{{ t('dashboard.cashFlow') }}</h3>
          <span class="text-xs text-[var(--el-text-color-secondary)]">{{ t('dashboard.last6Mo') }}</span>
        </div>
        <div id="cashflow" class="-ml-2 mt-2 min-h-[200px]"></div>
      </div>

      <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] text-[var(--el-text-color-primary)] rounded-3xl p-6 relative overflow-hidden shadow-soft">
        <div class="absolute -right-6 -bottom-6 w-40 h-40 bg-[var(--el-color-primary)]/10 blur-[50px] rounded-full pointer-events-none"></div>
        <div class="relative">
          <p class="text-[var(--el-text-color-secondary)] text-xs font-medium mb-1">{{ t('dashboard.projectedYield') }}</p>
          <div class="text-3xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">${{ (analyticsData?.stats?.projectedYield || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</div>
          <p class="text-xs text-[var(--el-text-color-secondary)] mt-2">{{ t('dashboard.estPayout') }}</p>
          <el-button type="primary"
            round size="large"
            icon="Money"
            @click="handleWithdraw"
          >
            {{ t('dashboard.withdraw') }}
          </el-button>
        </div>
      </div>
    </div>
  </section>
</template>

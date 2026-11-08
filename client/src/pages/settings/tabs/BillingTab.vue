<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'vue-sonner';
import http from '@/utils/http';

const { t } = useI18n();
const authStore = useAuthStore();

const billingData = ref({
  tier: 'creator',
  credit_balance: 0,
  credit_quota: 99990,
  monthly_price_usd: 29,
});
const usageHistory = ref<any[]>([]);
const isUpgrading = ref(false);
const isLoadingHistory = ref(false);

// ─── Pagination & Filtering ──────────────────────────────────────────────────
const currentPage = ref(1);
const pageSize = ref(10);
const searchQuery = ref('');

const filteredHistory = computed(() => {
  if (!searchQuery.value.trim()) return usageHistory.value;
  const q = searchQuery.value.toLowerCase().trim();
  return usageHistory.value.filter((item) => {
    return (
      (item.type && item.type.toLowerCase().includes(q)) ||
      (item.detail && item.detail.toLowerCase().includes(q)) ||
      (item.date && item.date.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q))
    );
  });
});

const paginatedHistory = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredHistory.value.slice(start, start + pageSize.value);
});

const tiersList = computed(() => [
  { id: 'free', name: t('settings.freeTier'), price: 0, credits: 100, desc: 'Casual testing & learning' },
  { id: 'creator', name: t('settings.creatorPro'), price: 29, credits: 1000, desc: 'High-frequency 9:16 drama generation', popular: true },
  { id: 'studio', name: t('settings.studioTeam'), price: 99, credits: 5000, desc: 'High-throughput cluster & S3 dedicated' },
  { id: 'enterprise', name: t('settings.enterpriseVip'), price: 299, credits: 20000, desc: 'Dedicated GPU clusters & custom models' },
]);

async function loadBilling() {
  isLoadingHistory.value = true;
  try {
    const [tierRes, historyRes]: any = await Promise.all([
      http.get('/billing/tier'),
      http.get('/billing/usage-history'),
    ]);
    if (tierRes?.data) {
      billingData.value = tierRes.data;
      if (authStore.user) {
        authStore.user.credits = tierRes.data.credit_balance;
        localStorage.setItem('shine_user', JSON.stringify(authStore.user));
      }
    }
    if (historyRes?.data) usageHistory.value = historyRes.data;
  } catch (err) {
    console.error('Failed to fetch billing info', err);
  } finally {
    isLoadingHistory.value = false;
  }
}

async function handleUpgradePlan(tierId: string) {
  isUpgrading.value = true;
  try {
    const res: any = await http.post('/billing/checkout', { tier: tierId });
    if (res?.data?.url) {
      toast.info(t('toast.redirectingCheckout'));
      window.location.href = res.data.url;
    }
  } catch (err: any) {
    toast.error(err?.response?.data?.message || 'Upgrade failed');
  } finally {
    isUpgrading.value = false;
  }
}

onMounted(() => {
  loadBilling();

  // Returning from Stripe Checkout. The plan is applied by the webhook, which can
  // land a few seconds after the redirect, so refresh a couple of times.
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  if (checkout === 'success') {
    toast.success(t('toast.paymentReceived', 'Payment received — your plan will update in a moment.'));
    setTimeout(loadBilling, 3000);
    setTimeout(loadBilling, 10000);
  } else if (checkout === 'cancelled') {
    toast.info(t('toast.checkoutCancelled', 'Checkout cancelled.'));
  }
  if (checkout) {
    params.delete('checkout');
    params.delete('session_id');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }
});
</script>

<template>
  <div class="space-y-10">
    <div class="flex items-center justify-between pb-6 border-b border-[var(--el-border-color)]">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)]">
          {{ t('settings.billingPlan') }}
        </h2>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('settings.billingPlanDesc') }}
        </p>
      </div>
      <el-tag type="success" size="small" round effect="dark" class="uppercase">
        {{ t('settings.currentPrefix') }} {{ billingData.tier }}
      </el-tag>
    </div>

    <!-- Active Tier Card & Usage -->
    <div class="p-6 bg-gradient-to-br from-primary/10 via-[var(--el-card-bg-color)] to-[var(--el-card-bg-color)] border border-primary/20 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
      <div>
        <span class="text-[10px] font-bold tracking-wider text-primary uppercase">{{ t('settings.activeSubscription') }}</span>
        <h3 class="text-2xl font-bold text-[var(--el-text-color-primary)] mt-1">{{ billingData.tier.toUpperCase() }} {{ t('settings.planTag') }}</h3>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('settings.renewsNextCycle') }}
        </p>
      </div>
      <div class="w-full md:w-64 space-y-2">
        <div class="flex justify-between text-xs font-semibold">
          <span class="text-[var(--el-text-color-secondary)]">{{ t('settings.creditsUsed') }}</span>
          <span class="text-[var(--el-text-color-primary)]">{{ billingData.credit_balance }} / {{ billingData.credit_quota }}</span>
        </div>
        <el-progress
          :percentage="Math.min(100, Math.round((billingData.credit_balance / (billingData.credit_quota || 1)) * 100))"
          color="var(--el-color-primary)"
          :stroke-width="8"
        />
      </div>
    </div>

    <!-- Available Plans Grid -->
    <div>
      <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)] mb-4">{{ t('settings.availablePlans') }}</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="plan in tiersList"
          :key="plan.id"
          :class="[
            'p-6 bg-[var(--el-card-bg-color)] border rounded-2xl flex flex-col justify-between space-y-6 transition relative shadow-soft',
            billingData.tier === plan.id ? 'border-primary ring-1 ring-primary' : 'border-[var(--el-border-color)] hover:border-primary/40'
          ]"
        >
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <h4 class="font-bold text-sm text-[var(--el-text-color-primary)]">{{ plan.name }}</h4>
              <el-tag v-if="plan.popular" size="small" type="warning" effect="dark" round>{{ t('settings.popular') }}</el-tag>
            </div>
            <div>
              <span class="text-2xl font-black text-[var(--el-text-color-primary)]">${{ plan.price }}</span>
              <span class="text-xs text-[var(--el-text-color-secondary)]"> / {{ t('settings.mo') }}</span>
            </div>
            <p class="text-xs text-[var(--el-text-color-secondary)]">{{ plan.desc }}</p>
            <div class="pt-2 text-xs font-semibold text-primary flex items-center">
              <el-icon class="mr-1.5 text-amber-500"><Coin /></el-icon> {{ plan.credits.toLocaleString() }} {{ t('settings.credits') }}
            </div>
          </div>
          <el-button
            :type="billingData.tier === plan.id ? 'default' : 'primary'"
            round
            size="small"
            :disabled="billingData.tier === plan.id"
            :loading="isUpgrading"
            @click="handleUpgradePlan(plan.id)"
          >
            {{ billingData.tier === plan.id ? t('settings.currentPlan') : t('settings.upgrade') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- Usage & Invoices History -->
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">
            {{ t('settings.invoicesHistory') }}
          </h3>
          <el-tag size="small" round effect="plain" class="font-bold">
            {{ filteredHistory.length }} {{ t('common.records') || 'records' }}
          </el-tag>
        </div>

        <div class="flex items-center gap-2">
          <el-input
            v-model="searchQuery"
            :placeholder="t('common.search') || 'Search transactions...'"
            size="small"
            clearable
            prefix-icon="Search"
            class="!w-60"
          />
          <el-button
            size="small"
            plain
            round
            icon="Refresh"
            :loading="isLoadingHistory"
            @click="loadBilling"
          >
            {{ t('common.refresh') || 'Refresh' }}
          </el-button>
        </div>
      </div>

      <div class="bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl overflow-hidden shadow-soft flex flex-col">
        <el-table
          :data="paginatedHistory"
          v-loading="isLoadingHistory"
          style="width: 100%"
          empty-text="No billing transactions recorded yet"
        >
          <el-table-column prop="date" :label="t('common.date') || 'Date'" width="160" />
          <el-table-column prop="type" :label="t('common.type') || 'Type'" min-width="160">
            <template #default="{ row }">
              <span class="font-medium text-xs text-[var(--el-text-color-primary)]">{{ row.type }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="detail" :label="t('common.description') || 'Description'" min-width="220">
            <template #default="{ row }">
              <span class="text-xs text-[var(--el-text-color-secondary)]">{{ row.detail }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="credits" :label="t('settings.creditsUsed') || 'Credits Used'" width="130">
            <template #default="{ row }">
              <span :class="Number(row.credits) < 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'">
                {{ row.credits }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="balance_after" :label="t('common.amount') || 'Balance After'" width="130">
            <template #default="{ row }">
              <span class="font-semibold text-xs text-[var(--el-text-color-primary)]">{{ row.balance_after }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" :label="t('common.status') || 'Status'" width="110">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="row.status === 'Success' || row.status === 'COMPLETED' ? 'success' : 'info'"
                round
                effect="plain"
              >
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <!-- Pagination Controls -->
        <div class="px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--el-border-color)] bg-[var(--el-bg-color-page)]">
          <span class="text-xs text-[var(--el-text-color-secondary)]">
            {{ t('common.showing') || 'Showing' }}
            <span class="font-semibold text-[var(--el-text-color-primary)]">
              {{ filteredHistory.length > 0 ? (currentPage - 1) * pageSize + 1 : 0 }}
            </span>
            -
            <span class="font-semibold text-[var(--el-text-color-primary)]">
              {{ Math.min(currentPage * pageSize, filteredHistory.length) }}
            </span>
            {{ t('common.of') || 'of' }}
            <span class="font-semibold text-[var(--el-text-color-primary)]">{{ filteredHistory.length }}</span>
            {{ t('common.records') || 'records' }}
          </span>

          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[5, 10, 20, 50]"
            :total="filteredHistory.length"
            layout="sizes, prev, pager, next, jumper"
            size="small"
            background
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import http from '@/utils/http';

const { t } = useI18n();

const props = defineProps<{
  config: any;
}>();

const emit = defineEmits<{
  (e: 'save'): void;
}>();

const clusterMetrics = ref({
  activeGpuInstances: 0,
  gpuLoadPercentage: 0,
  activeJobsCount: 0,
  queuedJobsCount: 0,
  completedJobsCount: 0,
  failedJobsCount: 0,
  monthlySpendUsd: 0.00,
  monthlyBudgetCap: 50.00,
  serviceName: 'shine-render-worker',
  region: 'us-central1',
  status: 'ONLINE',
});

const workerNodes = ref<any[]>([]);
const renderJobs = ref<any[]>([]);
const isTestingBatchRender = ref(false);
const autoRefresh = ref(true);
const batchRenderProgress = ref<{ jobId: string; episodeId: string; status: string; progressPercent: number; outputUrl?: string } | null>(null);

// Worker node filter & pagination: Default to 'online' so user only sees active workers!
const workerFilterMode = ref<'online' | 'all'>('online');
const isPruningWorkers = ref(false);
const workerCurrentPage = ref(1);
const workerPageSize = ref(10);

const onlineWorkers = computed(() => {
  return workerNodes.value.filter((w) => (w.status || '').toUpperCase() !== 'OFFLINE');
});

const offlineWorkers = computed(() => {
  return workerNodes.value.filter((w) => (w.status || '').toUpperCase() === 'OFFLINE');
});

const displayedWorkerNodes = computed(() => {
  if (workerFilterMode.value === 'online') {
    return onlineWorkers.value;
  }
  return workerNodes.value;
});

const paginatedWorkerNodes = computed(() => {
  const start = (workerCurrentPage.value - 1) * workerPageSize.value;
  return displayedWorkerNodes.value.slice(start, start + workerPageSize.value);
});

watch(workerFilterMode, () => {
  workerCurrentPage.value = 1;
});

// Render Jobs pagination
const jobsCurrentPage = ref(1);
const jobsPageSize = ref(10);

const paginatedRenderJobs = computed(() => {
  const start = (jobsCurrentPage.value - 1) * jobsPageSize.value;
  return renderJobs.value.slice(start, start + jobsPageSize.value);
});

async function handlePruneOfflineWorkers() {
  isPruningWorkers.value = true;
  try {
    const res: any = await http.delete('/admin/workers/offline');
    toast.success(res?.message || 'Đã dọn dẹp các worker offline');
    await loadWorkerNodes();
    await loadClusterMetrics();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || err?.message || 'Lỗi dọn dẹp worker');
  } finally {
    isPruningWorkers.value = false;
  }
}

let pollTimer: any = null;

async function loadClusterMetrics() {
  try {
    const res: any = await http.get('/admin/render-cluster');
    if (res?.data) {
      clusterMetrics.value = {
        activeGpuInstances: res.data.activeInstances || 0,
        gpuLoadPercentage: res.data.gpuLoadPct || 0,
        activeJobsCount: res.data.activeJobsCount || 0,
        queuedJobsCount: res.data.queuedJobsCount || 0,
        completedJobsCount: res.data.completedJobsCount || 0,
        failedJobsCount: res.data.failedJobsCount || 0,
        monthlySpendUsd: res.data.monthlyCostUsd || 0.0,
        monthlyBudgetCap: res.data.monthlyBudgetCap || 50.0,
        serviceName: res.data.serviceName || 'shine-render-worker',
        region: res.data.region || 'us-central1',
        status: res.data.status || 'ONLINE',
      };
      if (Array.isArray(res.data.workers)) {
        workerNodes.value = res.data.workers;
      }
    }
  } catch (err) {
    console.error('Failed to load cluster metrics', err);
  }
}

async function loadWorkerNodes() {
  try {
    const res: any = await http.get('/admin/workers');
    if (Array.isArray(res?.data)) {
      workerNodes.value = res.data;
    }
  } catch (err) {
    console.error('Failed to load worker nodes', err);
  }
}

async function loadRenderJobs() {
  try {
    const res: any = await http.get('/admin/render-jobs?limit=100');
    if (Array.isArray(res?.data)) {
      renderJobs.value = res.data;
    }
  } catch (err) {
    console.error('Failed to load render jobs', err);
  }
}

async function refreshAll() {
  await Promise.all([
    loadClusterMetrics(),
    loadWorkerNodes(),
    loadRenderJobs(),
  ]);
}

async function handleTestBatchRender() {
  isTestingBatchRender.value = true;
  batchRenderProgress.value = { jobId: 'initializing', episodeId: 'ep-001', status: 'queued', progressPercent: 5 };
  try {
    const res: any = await http.post('/export/batch', {
      seriesId: 'series_demo',
      episodeIds: ['ep-001', 'ep-002'],
      outputFormat: 'mp4',
    });
    toast.success(res?.message || 'Batch render dispatched to Cloud Run / PubSub');

    // Connect to SSE stream
    const eventSource = new EventSource('/api/v1/export/render/stream');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.progressPercent !== undefined) {
          batchRenderProgress.value = data;
          if (data.status === 'completed') {
            toast.success(t('toast.allAssetsAlreadyRendered'));
            eventSource.close();
            isTestingBatchRender.value = false;
            refreshAll();
          }
        }
      } catch {}
    };
    eventSource.onerror = () => {
      eventSource.close();
      isTestingBatchRender.value = false;
    };
  } catch (err: any) {
    toast.error(err?.response?.data?.message || 'Failed to dispatch batch render');
    isTestingBatchRender.value = false;
  }
}

function formatRelativeTime(isoStr?: string): string {
  if (!isoStr) return 'Never';
  const t = new Date(isoStr).getTime();
  if (isNaN(t) || t <= 0) return 'Never';
  const ms = Date.now() - t;
  if (ms < 5000) return 'Just now';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function getWorkerTagType(status: string) {
  switch (status?.toUpperCase()) {
    case 'ONLINE':
    case 'IDLE':
      return 'success';
    case 'BUSY':
    case 'RENDERING':
      return 'primary';
    case 'OFFLINE':
      return 'danger';
    default:
      return 'info';
  }
}

function getJobTagType(status: string) {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':
      return 'success';
    case 'RENDERING':
    case 'COMPOSITING':
      return 'primary';
    case 'QUEUED':
      return 'warning';
    case 'FAILED':
      return 'danger';
    default:
      return 'info';
  }
}

onMounted(() => {
  refreshAll();
  pollTimer = setInterval(() => {
    if (autoRefresh.value) {
      refreshAll();
    }
  }, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="space-y-8">
    <div class="flex justify-between items-center pb-5 border-b border-[var(--el-border-color)]">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight text-[var(--el-text-color-primary)] flex items-center gap-2">
          <el-icon class="text-blue-500"><Platform /></el-icon>
          {{ t('settings.renderClusterTitle') }}
        </h2>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-1">
          {{ t('settings.renderClusterDesc') }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <el-switch
          v-model="autoRefresh"
          inline-prompt
          :active-text="t('observability.auto5s')"
          :inactive-text="t('observability.paused')"
          size="small"
        />
        <el-button size="small" round @click="refreshAll">
          <el-icon class="mr-1.5"><Refresh /></el-icon> {{ t('common.refresh') }}
        </el-button>
        <el-button type="primary" round size="small" :loading="isTestingBatchRender" @click="handleTestBatchRender">
          <el-icon class="mr-1.5"><VideoPlay /></el-icon> {{ t('settings.testBatchRenderBtn') }}
        </el-button>
      </div>
    </div>

    <!-- Live Batch Render Progress Banner (SSE Connected) -->
    <div v-if="batchRenderProgress" class="p-5 bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-semibold text-blue-500">
          <el-icon class="is-loading" v-if="batchRenderProgress.status !== 'completed'"><Loading /></el-icon>
          <el-icon class="text-green-500" v-else><CircleCheck /></el-icon>
          <span>{{ t('settings.cloudRunBatchStatus', { id: batchRenderProgress.episodeId }) }} {{ batchRenderProgress.status.toUpperCase() }}</span>
        </div>
        <span class="text-xs font-bold text-blue-500">{{ batchRenderProgress.progressPercent }}%</span>
      </div>
      <el-progress :percentage="batchRenderProgress.progressPercent" :stroke-width="8" color="#3b82f6" />
      <p v-if="batchRenderProgress.outputUrl" class="text-xs text-green-500 font-medium">
        {{ t('common.outputAsset') }} <a :href="batchRenderProgress.outputUrl" target="_blank" class="underline">{{ batchRenderProgress.outputUrl }}</a>
      </p>
    </div>

    <!-- FinOps & Cloud Run Metrics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft">
        <span class="text-xs text-[var(--el-text-color-secondary)] font-semibold uppercase tracking-wider">{{ t('settings.cloudRunWorkers') }}</span>
        <h3 class="text-3xl font-extrabold text-blue-500 mt-2">{{ clusterMetrics.activeGpuInstances }} {{ t('settings.activeStatus') }}</h3>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-3">{{ t('settings.regionLabel') }} {{ clusterMetrics.region || 'us-central1' }}</p>
      </div>

      <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft">
        <span class="text-xs text-[var(--el-text-color-secondary)] font-semibold uppercase tracking-wider">{{ t('settings.pubSubQueueDepth') }}</span>
        <h3 class="text-3xl font-extrabold text-amber-500 mt-2">{{ clusterMetrics.queuedJobsCount }} {{ t('settings.tasksLabel') }}</h3>
        <p class="text-xs text-[var(--el-text-color-secondary)] mt-3">{{ t('settings.topicLabel') }} {{ config?.pubsub?.topicRender || 'shine-render-jobs' }}</p>
      </div>

      <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft">
        <span class="text-xs text-[var(--el-text-color-secondary)] font-semibold uppercase tracking-wider">{{ t('settings.activeRenderJobs') }}</span>
        <h3 class="text-3xl font-extrabold text-[var(--el-text-color-primary)] mt-2">{{ clusterMetrics.activeJobsCount }} {{ t('settings.jobsLabel') }}</h3>
        <el-progress :percentage="Math.min(100, Math.round(clusterMetrics.gpuLoadPercentage))" color="var(--el-color-primary)" :stroke-width="6" class="mt-3" />
      </div>

      <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft">
        <span class="text-xs text-[var(--el-text-color-secondary)] font-semibold uppercase tracking-wider">{{ t('settings.estMonthlySpend') }}</span>
        <h3 class="text-3xl font-extrabold text-[var(--el-text-color-primary)] mt-2">${{ clusterMetrics.monthlySpendUsd.toFixed(2) }}</h3>
        <p class="text-xs text-primary mt-3">{{ t('settings.capPerMonth', { cap: clusterMetrics.monthlyBudgetCap }) }}</p>
      </div>
    </div>

    <!-- Live Registered Worker Microservices Table -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full" :class="onlineWorkers.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'"></div>
          <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('observability.connectedWorkerServices') }}</h3>
          <el-tag size="small" type="success" effect="light" round class="ml-1 font-mono font-medium">
            {{ onlineWorkers.length }} Online
          </el-tag>
        </div>

        <div class="flex items-center gap-2.5">
          <!-- Filter: Online Only vs All -->
          <el-radio-group v-model="workerFilterMode" size="small">
            <el-radio-button label="online">
              <span class="flex items-center gap-1.5 px-1">
                <span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                <span>Online ({{ onlineWorkers.length }})</span>
              </span>
            </el-radio-button>
            <el-radio-button label="all">
              <span class="px-1">Tất cả ({{ workerNodes.length }})</span>
            </el-radio-button>
          </el-radio-group>

          <!-- Prune Offline Workers Button -->
          <el-button
            v-if="offlineWorkers.length > 0"
            size="small"
            type="danger"
            plain
            round
            :loading="isPruningWorkers"
            @click="handlePruneOfflineWorkers"
            title="Dọn dẹp các container Cloud Run cũ đã tắt"
          >
            <el-icon class="mr-1"><Delete /></el-icon>
            Xóa Offline ({{ offlineWorkers.length }})
          </el-button>
        </div>
      </div>

      <el-table
        :data="paginatedWorkerNodes"
        style="width: 100%"
        class="rounded-xl overflow-hidden"
        :empty-text="workerFilterMode === 'online' ? 'Không có worker nào đang Online' : t('settings.noWorkerHeartbeats')"
      >
        <el-table-column prop="workerName" :label="t('settings.workerNodeRevision')" min-width="200">
          <template #default="{ row }">
            <div class="font-medium text-xs text-[var(--el-text-color-primary)]">
              {{ row.workerName || row.worker_name || row.workerId || row.worker_id }}
            </div>
            <div class="text-[11px] text-[var(--el-text-color-secondary)] font-mono">
              {{ row.workerId || row.worker_id }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="serviceName" :label="t('settings.microservice')" width="180">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.serviceName || row.service_name || 'shine-render-worker' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="region" :label="t('settings.gcpRegion')" width="120">
          <template #default="{ row }">
            <span class="text-xs font-mono">{{ row.region || 'us-central1' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('settings.resourceUtilization')" width="180">
          <template #default="{ row }">
            <div class="space-y-1">
              <div class="flex justify-between text-[11px] text-[var(--el-text-color-secondary)]">
                <span>CPU: {{ row.cpuUsagePct ?? row.cpu_usage_pct ?? 0 }}%</span>
                <span>RAM: {{ row.memoryUsageMb ?? row.memory_usage_mb ?? 0 }} MB</span>
              </div>
              <el-progress :percentage="Math.min(100, row.cpuUsagePct ?? row.cpu_usage_pct ?? 0)" :stroke-width="4" :show-text="false" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="getWorkerTagType(row.status)" round effect="plain">
              {{ row.status || 'ONLINE' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('settings.lastHeartbeat')" width="130">
          <template #default="{ row }">
            <span class="text-xs text-[var(--el-text-color-secondary)]">
              {{ formatRelativeTime(row.lastHeartbeat || row.last_heartbeat || row.timestamp) }}
            </span>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination for Workers -->
      <div v-if="displayedWorkerNodes.length > workerPageSize" class="flex items-center justify-between pt-3 border-t border-[var(--el-border-color)]">
        <span class="text-xs text-[var(--el-text-color-secondary)]">
          {{ (workerCurrentPage - 1) * workerPageSize + 1 }} - {{ Math.min(workerCurrentPage * workerPageSize, displayedWorkerNodes.length) }} / {{ displayedWorkerNodes.length }} workers
        </span>
        <el-pagination
          v-model:current-page="workerCurrentPage"
          v-model:page-size="workerPageSize"
          :page-sizes="[5, 10, 20, 50]"
          layout="sizes, prev, pager, next"
          :total="displayedWorkerNodes.length"
          size="small"
        />
      </div>
    </div>

    <!-- Google Cloud Run & Pub/Sub Serverless Workers Configuration -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--el-border-color)]">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-base">
            <el-icon><Platform /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.cloudRunInfrastructure') }}</h3>
            <p class="text-[11px] text-[var(--el-text-color-secondary)]">{{ t('settings.cloudRunInfraDesc') }}</p>
          </div>
        </div>
        <el-button type="primary" round size="small" @click="emit('save'); toast.success(t('toast.clusterConfigSaved'))">
          {{ t('settings.saveClusterConfig') }}
        </el-button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.cloudRunRenderUrl') }}</label>
          <el-input v-model="config.cloudRun.renderUrl" placeholder="https://shine-render-worker-xyz.a.run.app" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.cloudRunServiceName') }}</label>
          <el-input v-model="config.cloudRun.serviceName" placeholder="shine-render-worker" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.cloudRunRegion') }}</label>
          <el-input v-model="config.cloudRun.region" placeholder="us-central1" size="small"/>
        </div>
        <div class="sm:col-span-2">
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.pubSubRenderTopic') }}</label>
          <el-input v-model="config.pubsub.topicRender" placeholder="shine-render-jobs" size="small"/>
        </div>
        <div>
          <label class="text-xs font-semibold text-[var(--el-text-color-secondary)] block mb-1">{{ t('settings.pubSubSubscription') }}</label>
          <el-input v-model="config.pubsub.subscriptionRender" placeholder="shine-render-sub" size="small"/>
        </div>
      </div>
    </div>

    <!-- Render Jobs Queue Table -->
    <div class="p-6 bg-[var(--el-card-bg-color)] border border-[var(--el-border-color)] rounded-2xl shadow-soft space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">{{ t('settings.activeClusterRenderJobs') }}</h3>
        <span class="text-xs text-[var(--el-text-color-secondary)]">{{ renderJobs.length }} Total Job(s)</span>
      </div>

      <el-table :data="paginatedRenderJobs" style="width: 100%" class="rounded-xl overflow-hidden" :empty-text="t('settings.noRenderJobsDispatched')">
        <el-table-column prop="jobId" :label="t('settings.jobId')" width="140">
          <template #default="{ row }">
            <span class="font-mono text-xs">{{ row.jobId }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="seriesTitle" :label="t('settings.seriesEpisode')" min-width="180">
          <template #default="{ row }">
            <span class="text-xs font-medium text-[var(--el-text-color-primary)]">{{ row.seriesTitle || row.episodeId || 'Series Export' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="workerName" :label="t('settings.assignedWorkerNode')" width="200">
          <template #default="{ row }">
            <span class="text-xs font-mono text-[var(--el-text-color-secondary)]">{{ row.workerName || row.workerId || 'Auto (Pub/Sub)' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="progress" :label="t('common.progress')" width="160">
          <template #default="{ row }">
            <el-progress :percentage="row.progress || 0" :stroke-width="6" />
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="t('common.status')" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="getJobTagType(row.status)" round effect="plain">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('settings.outputDownload')" width="160">
          <template #default="{ row }">
            <a
              v-if="row.downloadUrl || row.outputUrl"
              :href="row.downloadUrl || row.outputUrl"
              target="_blank"
              class="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
            >
              <el-icon><Download /></el-icon> {{ t('common.downloadMp4') }}
            </a>
            <span v-else class="text-xs text-[var(--el-text-color-secondary)]">—</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination for Render Jobs -->
      <div v-if="renderJobs.length > jobsPageSize" class="flex items-center justify-between pt-3 border-t border-[var(--el-border-color)]">
        <span class="text-xs text-[var(--el-text-color-secondary)]">
          {{ (jobsCurrentPage - 1) * jobsPageSize + 1 }} - {{ Math.min(jobsCurrentPage * jobsPageSize, renderJobs.length) }} / {{ renderJobs.length }} jobs
        </span>
        <el-pagination
          v-model:current-page="jobsCurrentPage"
          v-model:page-size="jobsPageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="sizes, prev, pager, next"
          :total="renderJobs.length"
          size="small"
        />
      </div>
    </div>
  </div>
</template>

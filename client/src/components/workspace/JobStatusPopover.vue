<template>
  <div>
    <el-popover
      placement="bottom-end"
      :width="520"
      trigger="click"
      popper-class="pipeline-job-popover"
      :hide-after="0"
      @show="onPopoverShow"
    >
      <template #reference>
        <el-badge :value="pipelineStore.activeJobs.length" :max="10" is-dot
          :type="isJobRunning ? 'primary' : hasFailedJobs ? 'danger' : 'warning'">
          <el-button
            size="large" circle icon="Bell" plain bg
            title="Background Tasks & Pipeline Monitor" />
            <!-- <span class="relative flex h-2 w-2">
              <span
                v-if="isJobRunning"
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"
              ></span>
              <span
                class="relative inline-flex rounded-full h-2 w-2"
                :class="isJobRunning ? 'bg-primary' : hasFailedJobs ? 'bg-destructive' : 'bg-muted-foreground/50'"
              ></span>
            </span>

            <component :is="isJobRunning ? Loader2 : hasFailedJobs ? AlertCircle : Activity" class="w-3.5 h-3.5" :class="{ 'animate-spin': isJobRunning }" />
            
            <span v-if="isJobRunning" class="font-semibold">{{ topActiveJob?.progress || 0 }}%</span>
            <span v-else-if="hasFailedJobs" class="font-semibold text-destructive">{{ failedJobsCount }} {{ $t('common.failed') }}</span>
            <span v-else-if="hasCompletedJobs" class="font-semibold text-emerald-500">{{ $t('pipeline.jobs') }} ({{ pipelineStore.activeJobs.length }})</span>
            <span v-else class="hidden md:inline font-medium">{{ $t('pipeline.jobs') }}</span> -->
          <!-- </el-button> -->
        </el-badge>
      </template>

      <!-- Popover Content -->
      <div class="p-1 text-card-foreground">
        <!-- Header -->
        <div class="flex items-center justify-between pb-3 border-b border-border/60">
          <div class="flex items-center gap-2">
            <Layers class="w-4 h-4 text-primary" />
            <h4 class="text-xs font-semibold tracking-tight uppercase text-foreground">Pipeline Task Manager</h4>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
              {{ pipelineStore.activeJobs.length }} task{{ pipelineStore.activeJobs.length !== 1 ? 's' : '' }}
            </span>
          </div>

          <!-- <div class="flex items-center gap-1.5">
            <el-button
              type="primary"
              size="small"
              round
              @click="startFullPipeline"
              :loading="isJobRunning"
            >
              <Plus class="w-3 h-3 mr-1" />
              New Task
            </el-button>
          </div> -->
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center justify-between py-2 border-b border-border/40 text-[11px]">
          <div class="flex items-center gap-1 overflow-x-auto py-0.5 max-w-[360px]">
            <el-button
              v-for="filter in taskFilters"
              :key="filter.key"
              @click="selectedTaskFilter = filter.key"
              :type="selectedTaskFilter === filter.key ? 'primary' : 'default'"
              size="small"
              round bg text
              class="!text-[11px] !px-2.5"
            >
              {{ filter.label }}
              <span v-if="filter.count > 0" class="ml-1 opacity-70 text-[9px]">({{ filter.count }})</span>
            </el-button>
          </div>

          <el-button
            v-if="pipelineStore.activeJobs.length > 0"
            size="small"
            text
            class="!text-[11px] !text-muted-foreground hover:!text-destructive"
            @click="refreshJobs"
            title="Refresh Task List"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isRefreshing }" />
          </el-button>
        </div>

        <!-- Task List (Accordion) -->
        <div class="py-2 space-y-2 max-h-[440px] overflow-y-auto pr-1">
          <!-- Empty State -->
          <div v-if="filteredJobs.length === 0" class="py-8 text-center space-y-2">
            <Activity class="w-8 h-8 mx-auto text-muted-foreground/40 stroke-1" />
            <p class="text-xs text-muted-foreground font-medium">No tasks found in this view</p>
            <el-button size="small" type="primary" plain round @click="startFullPipeline">
              Run Full Pipeline
            </el-button>
          </div>

          <!-- Tasks -->
          <div
            v-for="job in filteredJobs"
            :key="job.id"
            class="rounded-lg border bg-card/60 overflow-hidden transition-all duration-200"
            :class="{
              'border-primary/50 shadow-sm shadow-primary/5': job.status === 'running',
              'border-destructive/40 bg-destructive/5': job.status === 'failed',
              'border-border/60 hover:border-border': job.status === 'completed' || job.status === 'cancelled',
            }"
          >
            <!-- Task Header / Summary Card -->
            <div
              class="p-2.5 cursor-pointer hover:bg-muted/30 transition-colors select-none"
              @click="toggleJobExpand(job.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <!-- Left: Status Icon & Title -->
                <div class="flex items-start gap-2 min-w-0 flex-1">
                  <component
                    :is="getJobStatusIcon(job.status)"
                    class="w-4 h-4 mt-0.5 shrink-0"
                    :class="getJobStatusColor(job.status)"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center flex-wrap gap-1.5">
                      <span class="text-xs font-semibold text-foreground truncate max-w-[200px]">
                        {{ job.title || 'Pipeline Task' }}
                      </span>
                      <span
                        v-if="job.series_title"
                        @click.stop="goToSeries(job.series_id)"
                        class="text-[9px] px-1.5 py-0.2 rounded font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-0.5 cursor-pointer max-w-[140px] truncate"
                        :title="`Open ${job.series_title} workspace`"
                      >
                        <Film class="w-2.5 h-2.5 shrink-0" />
                        <span class="truncate">{{ job.series_title }}</span>
                      </span>
                      <span
                        class="text-[9px] px-1.5 py-0.2 rounded font-mono uppercase tracking-wider font-semibold border"
                        :class="getJobBadgeClass(job.status)"
                      >
                        {{ job.status }}
                      </span>
                    </div>

                    <div class="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span class="truncate max-w-[260px]">
                        {{ job.current_step || formatJobType(job.type) }}
                      </span>
                      <span v-if="job.created_at" class="shrink-0 flex items-center gap-0.5 opacity-60">
                        <Clock class="w-2.5 h-2.5" />
                        {{ formatTime(job.created_at) }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Right: Action Buttons -->
                <div class="flex items-center gap-1 shrink-0" @click.stop>
                  <!-- Cancel button for running tasks -->
                  <el-button
                    v-if="job.status === 'running' || job.status === 'queued'"
                    size="small"
                    type="danger"
                    text bg round
                    class="!px-2 !py-0.5 !text-[10px]"
                    @click="cancelJob(job.id)"
                  >
                    Cancel
                  </el-button>

                  <!-- Retry button for failed tasks -->
                  <el-button
                    v-if="job.status === 'failed'"
                    size="small"
                    type="warning"
                    text bg round
                    class="!px-2 !py-0.5 !text-[10px]"
                    @click="retryJob(job)"
                  >
                    <RotateCw class="w-2.5 h-2.5 mr-1" />
                    Retry
                  </el-button>

                  <!-- Delete task button -->
                  <el-button
                    size="small"
                    text round
                    class="!p-1 !text-muted-foreground hover:!text-destructive"
                    title="Delete Task"
                    @click="deleteJob(job.id)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </el-button>

                  <!-- Expand Arrow -->
                  <div class="p-1 text-muted-foreground transition-transform duration-200" :class="{ 'rotate-180': expandedJobIds.has(job.id) }">
                    <ChevronDown class="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              <!-- Progress bar for running tasks -->
              <div v-if="job.status === 'running'" class="mt-2">
                <el-progress
                  :percentage="job.progress || 5"
                  :stroke-width="4"
                  :show-text="false"
                  color="hsl(var(--primary))"
                />
              </div>
            </div>

            <!-- Collapsible Body (Assets, Errors, Activity Logs) -->
            <div
              v-if="expandedJobIds.has(job.id)"
              class="border-t border-border/40 p-2.5 bg-background/50 space-y-3"
            >
              <!-- 1. Error Banner if Job Failed -->
              <div
                v-if="job.status === 'failed' || job.error"
                class="p-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1.5"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 font-semibold">
                    <AlertCircle class="w-4 h-4 shrink-0" />
                    <span>Task Execution Failed</span>
                  </div>
                  <el-button
                    size="small"
                    type="danger"
                    round
                    @click="retryJob(job)"
                  >
                    <RotateCw class="w-3 h-3 mr-1" />
                    Retry Task
                  </el-button>
                </div>
                <p class="text-[11px] leading-relaxed text-destructive/90 font-mono break-all">
                  {{ job.error || job.current_step || 'An unknown error occurred during execution.' }}
                </p>
              </div>

              <!-- 2. Produced Assets Section -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px]">
                  <span class="font-medium text-foreground flex items-center gap-1">
                    <Sparkles class="w-3 h-3 text-primary" />
                    Produced Assets ({{ getJobAssets(job).length }})
                  </span>

                  <el-button
                    v-if="getJobAssets(job).length > 0"
                    size="small"
                    text round bg
                    class="!text-[10px] !py-0.5"
                    @click="downloadJobAssets(job)"
                  >
                    <Download class="w-3 h-3 mr-1" />
                    Download All ({{ getJobAssets(job).length }})
                  </el-button>
                </div>

                <!-- Assets Grid -->
                <div
                  v-if="getJobAssets(job).length > 0"
                  class="grid grid-cols-4 gap-1.5 pt-1"
                >
                  <div
                    v-for="asset in getJobAssets(job)"
                    :key="asset.id"
                    @click="openAssetPreview(asset)"
                    class="group relative rounded border border-border/40 bg-muted/30 overflow-hidden cursor-pointer hover:border-primary transition-all flex flex-col items-center justify-center p-1 text-center"
                    :title="asset.name"
                  >
                    <!-- Thumbnail preview -->
                    <div class="w-full h-14 rounded bg-muted/60 overflow-hidden flex items-center justify-center mb-1 relative">
                      <img
                        v-if="asset.url && isImageType(asset.type)"
                        :src="asset.thumbnail || asset.url"
                        :alt="asset.name"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                      <div v-else-if="asset.type === 'video' || asset.type === 'render'" class="flex flex-col items-center justify-center text-primary">
                        <Film class="w-5 h-5" />
                      </div>
                      <div v-else-if="asset.type === 'voice' || asset.type === 'audio'" class="flex flex-col items-center justify-center text-emerald-400">
                        <Volume2 class="w-5 h-5" />
                      </div>
                      <div v-else class="flex flex-col items-center justify-center text-muted-foreground">
                        <FileText class="w-4 h-4" />
                      </div>
                    </div>

                    <!-- Name tag -->
                    <span class="text-[9px] font-medium truncate w-full text-foreground/80 group-hover:text-primary">
                      {{ asset.name }}
                    </span>

                    <!-- Hover overlay icon -->
                    <div class="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                      <Eye class="w-4 h-4 text-white drop-shadow" />
                    </div>
                  </div>
                </div>

                <div v-else-if="job.status === 'running'" class="text-[11px] text-muted-foreground py-2 flex items-center gap-1.5">
                  <Loader2 class="w-3.5 h-3.5 animate-spin text-primary" />
                  Generating media assets in background...
                </div>
                <div v-else class="text-[11px] text-muted-foreground/60 py-1 italic">
                  No assets attached to this task.
                </div>
              </div>

              <!-- 3. Activity Logs Section -->
              <div v-if="job.logs && job.logs.length > 0" class="space-y-1">
                <div class="text-[10px] font-medium text-muted-foreground uppercase">Activity Logs</div>
                <div class="bg-background/90 rounded p-2 text-[10px] font-mono max-h-24 overflow-y-auto space-y-1 border border-border/40">
                  <div
                    v-for="(log, idx) in job.logs.slice(-6)"
                    :key="idx"
                    class="flex items-start gap-1"
                    :class="{
                      'text-destructive': log.level === 'error',
                      'text-amber-500': log.level === 'warn',
                      'text-muted-foreground': log.level !== 'error' && log.level !== 'warn',
                    }"
                  >
                    <span class="text-primary shrink-0">›</span>
                    <span class="truncate">{{ log.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-popover>

    <!-- Global Asset Preview Modal -->
    <el-dialog
      v-model="previewDialogOpen"
      :title="previewAsset?.name || 'Asset Preview'"
      width="560px"
      append-to-body
      class="asset-preview-dialog"
    >
      <div class="space-y-4" v-if="previewAsset">
        <div class="flex items-center justify-between pb-2 border-b border-border/40">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {{ previewAsset.type }}
            </span>
            <span v-if="previewAsset.scene_index" class="text-xs text-muted-foreground">
              Scene #{{ previewAsset.scene_index }}
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <el-button
              v-if="previewAsset.url"
              size="small"
              round text bg
              @click="copyAssetUrl(previewAsset.url)"
            >
              <Copy class="w-3.5 h-3.5 mr-1" />
              Copy URL
            </el-button>
            <el-button
              v-if="previewAsset.url"
              size="small"
              round text bg
              @click="openExternalLink(previewAsset.url)"
            >
              <ExternalLink class="w-3.5 h-3.5 mr-1" />
              Open
            </el-button>
          </div>
        </div>

        <!-- Media Player / Image Container -->
        <div class="rounded-lg overflow-hidden border border-border/60 bg-muted/40 flex items-center justify-center min-h-[280px]">
          <img
            v-if="previewAsset.url && isImageType(previewAsset.type)"
            :src="previewAsset.url"
            :alt="previewAsset.name"
            class="max-h-[420px] w-auto object-contain rounded"
          />
          <video
            v-else-if="previewAsset.url && (previewAsset.type === 'video' || previewAsset.type === 'render')"
            :src="previewAsset.url"
            controls
            autoplay
            class="max-h-[420px] w-full rounded"
          />
          <audio
            v-else-if="previewAsset.url && (previewAsset.type === 'voice' || previewAsset.type === 'audio' || previewAsset.type === 'bgm')"
            :src="previewAsset.url"
            controls
            autoplay
            class="w-full p-4"
          />
          <div v-else class="text-xs text-muted-foreground p-8 text-center">
            No media preview available for this asset
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useSeriesStore } from '@/stores/useSeriesStore';
import {
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Film,
  Volume2,
  FileText,
  Eye,
  Copy,
  ExternalLink,
  Download,
  RotateCw,
  Trash2,
  ChevronDown,
  XCircle,
  Plus,
  Clock,
  RefreshCw,
} from 'lucide-vue-next';
import type { AssetJobItem } from '@/types';

const pipelineStore = usePipelineStore();
const seriesStore = useSeriesStore();
const router = useRouter();

function goToSeries(seriesId?: string) {
  if (seriesId) {
    router.push(`/project/${seriesId}`);
  }
}

// Filter for Task List: 'all' | 'running' | 'completed' | 'failed'
const selectedTaskFilter = ref<'all' | 'running' | 'completed' | 'failed'>('all');
const isRefreshing = ref(false);

// Expanded Job Cards Set
const expandedJobIds = ref<Set<string>>(new Set());

// Preview Dialog State
const previewDialogOpen = ref(false);
const previewAsset = ref<AssetJobItem | null>(null);

const isJobRunning = computed(() => pipelineStore.isJobRunning);
const { t } = useI18n();
const topActiveJob = computed(() => pipelineStore.activeJob);

const completedJobsCount = computed(() => pipelineStore.activeJobs.filter(j => j.status === 'completed').length);
const failedJobsCount = computed(() => pipelineStore.activeJobs.filter(j => j.status === 'failed').length);
const runningJobsCount = computed(() => pipelineStore.activeJobs.filter(j => j.status === 'running' || j.status === 'queued').length);
const hasFailedJobs = computed(() => failedJobsCount.value > 0);
const hasCompletedJobs = computed(() => completedJobsCount.value > 0);

const taskFilters = computed(() => [
  { key: 'all' as const, label: t('common.all'), count: pipelineStore.activeJobs.length },
  { key: 'running' as const, label: t('common.running'), count: runningJobsCount.value },
  { key: 'completed' as const, label: t('common.ready'), count: completedJobsCount.value },
  { key: 'failed' as const, label: t('common.failed'), count: failedJobsCount.value },
]);

const filteredJobs = computed(() => {
  const all = pipelineStore.activeJobs || [];
  if (selectedTaskFilter.value === 'running') {
    return all.filter(j => j.status === 'running' || j.status === 'queued');
  }
  if (selectedTaskFilter.value === 'completed') {
    return all.filter(j => j.status === 'completed');
  }
  if (selectedTaskFilter.value === 'failed') {
    return all.filter(j => j.status === 'failed');
  }
  return all;
});

function toggleJobExpand(jobId: string) {
  if (expandedJobIds.value.has(jobId)) {
    expandedJobIds.value.delete(jobId);
  } else {
    expandedJobIds.value.add(jobId);
  }
}

// Extract all produced AssetJobItems from a job
function getJobAssets(job: any): AssetJobItem[] {
  const assets: AssetJobItem[] = [];
  if (job?.step_progress) {
    for (const step of Object.values(job.step_progress) as any[]) {
      if (Array.isArray(step?.assets)) {
        assets.push(...step.assets);
      }
    }
  }
  if (job?.outputs?.published_urls) {
    for (const [platform, url] of Object.entries(job.outputs.published_urls as Record<string, string>)) {
      if (url) {
        assets.push({
          id: `pub_${platform}_${job.id}`,
          name: `${platform.toUpperCase()} Post`,
          type: 'publish_link',
          status: 'completed',
          url: url,
        });
      }
    }
  }
  return assets;
}

function getJobStatusIcon(status: string) {
  if (status === 'running' || status === 'queued') return Loader2;
  if (status === 'completed') return CheckCircle2;
  if (status === 'failed') return AlertCircle;
  if (status === 'cancelled') return XCircle;
  return Activity;
}

function getJobStatusColor(status: string) {
  if (status === 'running' || status === 'queued') return 'text-primary animate-spin';
  if (status === 'completed') return 'text-emerald-500';
  if (status === 'failed') return 'text-destructive';
  if (status === 'cancelled') return 'text-muted-foreground';
  return 'text-muted-foreground';
}

function getJobBadgeClass(status: string) {
  if (status === 'running' || status === 'queued') return 'bg-primary/15 text-primary border-primary/30';
  if (status === 'completed') return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
  if (status === 'failed') return 'bg-destructive/15 text-destructive border-destructive/30';
  return 'bg-muted text-muted-foreground border-border/40';
}

function formatJobType(type?: string): string {
  if (!type) return 'Pipeline Task';
  if (type === 'full_pipeline') return 'Full Pipeline Production';
  if (type === 'render') return 'Master Video Export';
  if (type === 'publish') return 'Social Media Publish';
  if (type.startsWith('step_')) return `Step ${type.replace('step_', '').toUpperCase()}`;
  return type;
}

function formatTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function isImageType(type?: string): boolean {
  return ['character', 'wardrobe', 'location', 'prop', 'storyboard'].includes(type || '');
}

function openAssetPreview(asset: AssetJobItem) {
  if (asset.type === 'publish_link' || (asset.url && (asset.url.includes('youtube.com') || asset.url.includes('tiktok.com') || asset.url.includes('facebook.com') || asset.url.includes('instagram.com')))) {
    window.open(asset.url, '_blank');
    return;
  }
  previewAsset.value = asset;
  previewDialogOpen.value = true;
}

function copyAssetUrl(url: string) {
  navigator.clipboard.writeText(url);
  toast.success(t('toast.assetUrlCopied'));
}

function openExternalLink(url: string) {
  window.open(url, '_blank');
}

function downloadJobAssets(job: any) {
  const assets = getJobAssets(job);
  const urls = assets.map(a => a.url).filter(Boolean) as string[];
  if (urls.length === 0) {
    toast.info(t('toast.noMediaFilesFound'));
    return;
  }
  urls.forEach((url, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = url;
      a.download = url.split('/').pop() || `asset_${i}`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, i * 250);
  });
  toast.success(t('toast.downloadingMediaFiles', { count: urls.length }));
}

async function cancelJob(jobId: string) {
  await pipelineStore.cancelBackgroundJob(jobId);
}

async function retryJob(job: any) {
  await pipelineStore.retryJob(job);
}

async function deleteJob(jobId: string) {
  await pipelineStore.deleteBackgroundJob(jobId);
  expandedJobIds.value.delete(jobId);
}

async function startFullPipeline() {
  await pipelineStore.startBackgroundPipeline();
}

async function refreshJobs() {
  const sid = seriesStore.currentSeries?.id || 'all';
  const eid = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
  isRefreshing.value = true;
  try {
    await pipelineStore.fetchActiveJobs(sid, eid);
    toast.success(t('toast.tasksRefreshed'));
  } finally {
    isRefreshing.value = false;
  }
}

function onPopoverShow() {
  const sid = seriesStore.currentSeries?.id || 'all';
  const eid = seriesStore.activeEpisode?.id || seriesStore.activeEpisodeId;
  pipelineStore.fetchActiveJobs(sid, eid);
  // Auto expand the top running/failed job by default
  if (topActiveJob.value?.id) {
    expandedJobIds.value.add(topActiveJob.value.id);
  }
}
</script>

<style scoped>
:deep(.el-progress-bar__outer) {
  background-color: hsl(var(--muted));
}
</style>

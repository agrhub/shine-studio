<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import http from '@/utils/http';
import { toast } from 'vue-sonner';
import {
  Refresh,
  View,
  ChatDotRound,
  Money,
  TrendCharts,
  User,
  Star,
  Warning,
  Check,
  Promotion,
  Location,
} from '@element-plus/icons-vue';

import type {
  Episode,
  EpisodeAnalyticsSummary,
  EpisodeCommentItem,
  EpisodeAudienceInsight,
} from '@/types/api';

const props = defineProps<{
  seriesId: string;
}>();

const { t } = useI18n();

const episodes = ref<Episode[]>([]);
const selectedEpisodeId = ref<string>('');
const isSyncing = ref<boolean>(false);
const isApplying = ref<boolean>(false);
const isLoading = ref<boolean>(false);

const summary = ref<EpisodeAnalyticsSummary | null>(null);
const comments = ref<EpisodeCommentItem[]>([]);
const insight = ref<EpisodeAudienceInsight | null>(null);

const selectedSentimentFilter = ref<'all' | 'positive' | 'negative' | 'neutral'>('all');
const customInstruction = ref<string>('');
const showRefinementDialog = ref<boolean>(false);
const refinedEpisode = ref<Episode | null>(null);

const filteredComments = computed(() => {
  if (selectedSentimentFilter.value === 'all') return comments.value;
  return comments.value.filter(c => c.sentiment === selectedSentimentFilter.value);
});

const positiveCount = computed(() => comments.value.filter(c => c.sentiment === 'positive').length);
const negativeCount = computed(() => comments.value.filter(c => c.sentiment === 'negative').length);
const neutralCount = computed(() => comments.value.filter(c => c.sentiment === 'neutral' || c.sentiment === 'mixed').length);

/**
 * Converts snake_case or underscore enum values (e.g. "addicted_to_cliffhanger") to
 * human-readable Title Case display text (e.g. "Addicted To Cliffhanger").
 */
function formatEnumLabel(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const isFetchingEpisodes = ref(false);
const filterPublishedOnly = ref(true);

function isEpisodePublished(ep: Episode): boolean {
  return ep.status === 'PUBLISHED' ||
    (Array.isArray(ep.published_platforms) && ep.published_platforms.length > 0) ||
    (ep.published_urls && Object.keys(ep.published_urls).length > 0) ||
    Boolean(ep.analytics_summary);
}

const displayedEpisodes = computed(() => {
  if (!filterPublishedOnly.value) return episodes.value;
  return episodes.value.filter(isEpisodePublished);
});

function syncSelectedEpisode() {
  const available = displayedEpisodes.value;
  if (available.length > 0) {
    if (!selectedEpisodeId.value || !available.some(e => e.id === selectedEpisodeId.value)) {
      selectedEpisodeId.value = available[0].id;
    }
  } else {
    selectedEpisodeId.value = '';
    summary.value = null;
    comments.value = [];
    insight.value = null;
  }
}

watch(filterPublishedOnly, () => {
  // Re-fetch from server with the updated publishedOnly param
  fetchEpisodes();
});

async function fetchEpisodes() {
  if (!props.seriesId || isFetchingEpisodes.value) return;
  isFetchingEpisodes.value = true;
  try {
    // Pass publishedOnly=true when filter is active so server-side also filters
    const params = filterPublishedOnly.value ? { publishedOnly: 'true' } : {};
    const res: any = await http.get(`/episodes/series/${props.seriesId}`, { params });
    const list = res.data?.episodes || res.episodes || res.data || res || [];
    episodes.value = Array.isArray(list) ? list : [];
    syncSelectedEpisode();
  } catch (err: any) {
    console.error('Failed to fetch series episodes', err);
  } finally {
    isFetchingEpisodes.value = false;
  }
}

async function fetchEpisodeAnalytics() {
  if (!selectedEpisodeId.value || isLoading.value) return;
  isLoading.value = true;
  try {
    const res: any = await http.get(`/analytics/episodes/${selectedEpisodeId.value}/insights`);
    const data = res.data || res;
    if (data) {
      summary.value = data.summary || null;
      comments.value = Array.isArray(data.comments) ? data.comments : [];
      insight.value = data.insight || null;
    }
  } catch (err: any) {
    console.error('Failed to load episode analytics', err);
  } finally {
    isLoading.value = false;
  }
}

async function handleSyncMetrics() {
  if (!selectedEpisodeId.value || isSyncing.value) return;
  isSyncing.value = true;
  try {
    const res: any = await http.post(`/analytics/episodes/${selectedEpisodeId.value}/sync`);
    const data = res.data || res;
    if (data) {
      summary.value = data.summary || null;
      comments.value = Array.isArray(data.comments) ? data.comments : [];
      insight.value = data.insight || null;
    }
    toast.success(t('analytics.episodeFeedback.syncSuccess'));
  } catch (err: any) {
    toast.error(err.message || t('analytics.episodeFeedback.syncFailed'));
  } finally {
    isSyncing.value = false;
  }
}

async function handleApplyToNext() {
  if (!selectedEpisodeId.value || isApplying.value) return;
  isApplying.value = true;
  try {
    const res: any = await http.post(`/analytics/episodes/${selectedEpisodeId.value}/apply-to-next`, {
      customInstruction: customInstruction.value.trim() || undefined,
    });
    refinedEpisode.value = res.data?.targetEpisode || null;
    if (refinedEpisode.value) {
      showRefinementDialog.value = true;
    }
    toast.success(res.message || t('analytics.episodeFeedback.applySuccess'));
  } catch (err: any) {
    toast.error(err.response?.data?.message || err.message || t('analytics.episodeFeedback.applyFailed'));
  } finally {
    isApplying.value = false;
  }
}

const currentEpisode = computed(() => {
  return episodes.value.find(e => e.id === selectedEpisodeId.value);
});

watch(() => props.seriesId, async (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    selectedEpisodeId.value = '';
    await fetchEpisodes();
  }
});

watch(selectedEpisodeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    fetchEpisodeAnalytics();
  }
});

onMounted(async () => {
  // fetchEpisodes → syncSelectedEpisode → sets selectedEpisodeId
  // which triggers the watch(selectedEpisodeId) → fetchEpisodeAnalytics automatically
  await fetchEpisodes();
});
</script>

<template>
  <div class="space-y-6 mt-8">
    <!-- Header & Episode Switcher -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)] shadow-sm">
      <div class="flex items-center gap-3 flex-wrap">
        <el-select
          v-model="selectedEpisodeId"
          :placeholder="$t('analytics.episodeFeedback.selectEpisode')"
          class="!w-[260px]"
          size="default"
          :disabled="displayedEpisodes.length === 0"
        >
          <el-option
            v-for="ep in displayedEpisodes"
            :key="ep.id"
            :label="`Ep ${ep.episode_number}: ${ep.title}`"
            :value="ep.id"
          >
            <div class="flex items-center justify-between w-full">
              <span class="truncate max-w-[170px]">Ep {{ ep.episode_number }}: {{ ep.title }}</span>
              <span
                class="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ml-2 shrink-0"
                :class="isEpisodePublished(ep) ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-500/15 text-zinc-500'"
              >
                {{ isEpisodePublished(ep) ? t('analytics.episodeFeedback.publishedBadge') : t('analytics.episodeFeedback.draftBadge') }}
              </span>
            </div>
          </el-option>
        </el-select>

        <el-checkbox
          v-model="filterPublishedOnly"
          class="!mr-0 text-xs"
        >
          {{ t('analytics.episodeFeedback.onlyPublished') }}
        </el-checkbox>

        <span
          v-if="currentEpisode"
          class="text-xs px-2 py-0.5 rounded font-medium"
          :class="isEpisodePublished(currentEpisode) ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'"
        >
          {{ isEpisodePublished(currentEpisode) ? t('analytics.episodeFeedback.publishedBadge') : t('analytics.episodeFeedback.draftBadge') }}
        </span>
      </div>

      <div class="flex items-center gap-3">
        <el-button
          type="primary"
          :loading="isSyncing"
          :disabled="displayedEpisodes.length === 0 || !selectedEpisodeId"
          @click="handleSyncMetrics"
        >
          <el-icon class="mr-1.5"><Refresh /></el-icon>
          <span>{{ isSyncing ? t('analytics.episodeFeedback.syncing') : t('analytics.episodeFeedback.syncBtn') }}</span>
        </el-button>
      </div>
    </div>

    <!-- No Published Episodes Empty State -->
    <div
      v-if="displayedEpisodes.length === 0 && !isFetchingEpisodes"
      class="p-8 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-dashed border-[var(--el-border-color-lighter)] text-center space-y-4 shadow-sm"
    >
      <div class="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto text-2xl">
        <el-icon><Warning /></el-icon>
      </div>
      <div class="max-w-md mx-auto space-y-2">
        <h3 class="text-base font-semibold text-[var(--el-text-color-primary)]">
          {{ t('analytics.episodeFeedback.noPublishedTitle') }}
        </h3>
        <p class="text-xs text-[var(--el-text-color-secondary)] leading-relaxed">
          {{ t('analytics.episodeFeedback.noPublishedEpisodes') }}
        </p>
      </div>
      <div class="flex items-center justify-center gap-3 pt-2">
        <el-button
          v-if="episodes.length > 0 && filterPublishedOnly"
          size="small"
          @click="filterPublishedOnly = false"
        >
          {{ t('analytics.episodeFeedback.showAllEpisodes') }}
        </el-button>
        <router-link to="/projects">
          <el-button type="primary" size="small">
            {{ t('analytics.episodeFeedback.goToPublish') }}
          </el-button>
        </router-link>
      </div>
    </div>

  <template v-if="displayedEpisodes.length > 0 && selectedEpisodeId">
    <!-- Quick KPI Stats Cards -->
    <div v-if="summary" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="p-4 rounded-xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)]">
        <div class="flex items-center justify-between text-xs text-[var(--el-text-color-secondary)] mb-1">
          <span>{{ t('analytics.episodeFeedback.views') }}</span>
          <el-icon class="text-emerald-500"><View /></el-icon>
        </div>
        <div class="text-2xl font-bold text-[var(--el-text-color-primary)]">
          {{ Number(summary.total_views || 0).toLocaleString() }}
        </div>
      </div>

      <div class="p-4 rounded-xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)]">
        <div class="flex items-center justify-between text-xs text-[var(--el-text-color-secondary)] mb-1">
          <span>{{ t('analytics.episodeFeedback.comments') }}</span>
          <el-icon class="text-sky-500"><ChatDotRound /></el-icon>
        </div>
        <div class="text-2xl font-bold text-[var(--el-text-color-primary)]">
          {{ Number(summary.total_comments || 0).toLocaleString() }}
        </div>
      </div>

      <div class="p-4 rounded-xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)]">
        <div class="flex items-center justify-between text-xs text-[var(--el-text-color-secondary)] mb-1">
          <span>{{ t('analytics.episodeFeedback.estRevenue') }}</span>
          <el-icon class="text-amber-500"><Money /></el-icon>
        </div>
        <div class="text-2xl font-bold text-[var(--el-text-color-primary)]">
          ${{ Number(summary.estimated_revenue || 0).toFixed(2) }}
        </div>
      </div>

      <div class="p-4 rounded-xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)]">
        <div class="flex items-center justify-between text-xs text-[var(--el-text-color-secondary)] mb-1">
          <span>{{ t('analytics.episodeFeedback.retentionRate') }}</span>
          <el-icon class="text-[var(--el-color-primary)]"><TrendCharts /></el-icon>
        </div>
        <div class="text-2xl font-bold text-[var(--el-text-color-primary)]">
          {{ typeof summary.retention_rate_pct === 'number' ? summary.retention_rate_pct : 0 }}%
        </div>
      </div>
    </div>

    <!-- Main Intelligence Layout: 2 Columns -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column: Sentiment, Geography, Character Reception -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Sentiment & Dominant Emotion -->
        <div v-if="insight?.sentiment_distribution" class="p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)]">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-semibold text-[var(--el-text-color-primary)]">
              {{ t('analytics.episodeFeedback.sentimentBreakdown') }}
            </h3>
            <span class="px-2.5 py-1 text-xs rounded-full bg-indigo-500/10 text-indigo-500 font-medium capitalize">
              {{ formatEnumLabel(insight.sentiment_distribution.dominant_emotion) }}
            </span>
          </div>

          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-emerald-500 font-medium">{{ t('analytics.episodeFeedback.sentimentPositive') }}</span>
                <span>{{ insight.sentiment_distribution.positive_pct }}%</span>
              </div>
              <el-progress :percentage="insight.sentiment_distribution.positive_pct" color="#10b981" :show-text="false" />
            </div>

            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-sky-500 font-medium">{{ t('analytics.episodeFeedback.sentimentNeutral') }}</span>
                <span>{{ insight.sentiment_distribution.neutral_pct }}%</span>
              </div>
              <el-progress :percentage="insight.sentiment_distribution.neutral_pct" color="#0ea5e9" :show-text="false" />
            </div>

            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-rose-500 font-medium">{{ t('analytics.episodeFeedback.sentimentNegative') }}</span>
                <span>{{ insight.sentiment_distribution.negative_pct }}%</span>
              </div>
              <el-progress :percentage="insight.sentiment_distribution.negative_pct" color="#f43f5e" :show-text="false" />
            </div>
          </div>
        </div>

        <!-- Character Reception Cards -->
        <div v-if="insight?.character_reception?.length" class="p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)]">
          <h3 class="text-base font-semibold text-[var(--el-text-color-primary)] mb-4 flex items-center gap-2">
            <el-icon class="text-amber-500"><User /></el-icon>
            <span>{{ t('analytics.episodeFeedback.characterReception') }}</span>
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="char in insight.character_reception"
              :key="char.character_name"
              class="p-4 rounded-xl bg-[var(--el-fill-color-light)] border border-[var(--el-border-color-extra-light)]"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm text-[var(--el-text-color-primary)]">{{ char.character_name }}</span>
                <span
                  class="text-xs px-2 py-0.5 rounded font-medium"
                  :class="char.sentiment_score >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'"
                >
                  {{ char.sentiment_score >= 0 ? `+${char.sentiment_score}` : char.sentiment_score }}
                </span>
              </div>
              <p class="text-xs text-[var(--el-text-color-secondary)] mb-3 leading-relaxed">
                {{ char.feedback_summary }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="tag in char.audience_tags"
                  :key="tag"
                  class="text-[11px] px-2 py-0.5 rounded-full bg-[var(--el-bg-color-overlay)] text-[var(--el-text-color-secondary)] border border-[var(--el-border-color-lighter)]"
                >
                  #{{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Regions (Geography) -->
        <div v-if="summary?.top_countries?.length" class="p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)]">
          <h3 class="text-base font-semibold text-[var(--el-text-color-primary)] mb-4 flex items-center gap-2">
            <el-icon class="text-sky-500"><Location /></el-icon>
            <span>{{ t('analytics.episodeFeedback.topRegions') }}</span>
          </h3>

          <div class="space-y-3">
            <div
              v-for="geo in summary.top_countries"
              :key="geo.country"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-[var(--el-text-color-primary)] font-medium">{{ geo.country }}</span>
              <div class="flex items-center gap-3 w-1/2">
                <el-progress :percentage="geo.percentage" class="w-full" :show-text="false" />
                <span class="text-xs font-semibold w-10 text-right">{{ geo.percentage }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pacing & Retention Critique -->
        <div v-if="insight?.pacing_and_retention_critique" class="p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)] space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-[var(--el-text-color-primary)] flex items-center gap-2">
              <el-icon class="text-amber-500"><TrendCharts /></el-icon>
              <span>{{ t('analytics.episodeFeedback.pacingCritique') }}</span>
            </h3>
            <span
              v-if="insight.pacing_and_retention_critique.pacing_rating"
              class="text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase"
              :class="{
                'bg-emerald-500/10 text-emerald-500': insight.pacing_and_retention_critique.pacing_rating === 'balanced',
                'bg-amber-500/10 text-amber-500': insight.pacing_and_retention_critique.pacing_rating === 'too_slow',
                'bg-rose-500/10 text-rose-500': insight.pacing_and_retention_critique.pacing_rating === 'rushed'
              }"
            >
              {{ formatEnumLabel(insight.pacing_and_retention_critique.pacing_rating) }}
            </span>
          </div>

          <p v-if="insight.pacing_and_retention_critique.verdict" class="text-xs text-[var(--el-text-color-secondary)] leading-relaxed">
            {{ insight.pacing_and_retention_critique.verdict }}
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <!-- Highlight Scenes -->
            <div v-if="insight.pacing_and_retention_critique.highlight_scenes?.length" class="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                <el-icon><Star /></el-icon>
                <span>{{ t('analytics.episodeFeedback.highlightScenes') }}</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="sc in insight.pacing_and_retention_critique.highlight_scenes"
                  :key="sc"
                  class="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                >
                  {{ sc }}
                </span>
              </div>
            </div>

            <!-- Risk Scenes -->
            <div v-if="insight.pacing_and_retention_critique.drop_off_risk_scenes?.length" class="p-3 rounded-xl bg-rose-500/5 border border-rose-500/15">
              <div class="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1.5 flex items-center gap-1">
                <el-icon><Warning /></el-icon>
                <span>{{ t('analytics.episodeFeedback.riskScenes') }}</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="sc in insight.pacing_and_retention_critique.drop_off_risk_scenes"
                  :key="sc"
                  class="text-[11px] px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium"
                >
                  {{ sc }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Audience Theories & Plot Flaws -->
        <div
          v-if="insight?.audience_theories_and_desires?.length || insight?.plot_flaws_and_questions?.length"
          class="p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)] space-y-4"
        >
          <!-- Theories -->
          <div v-if="insight.audience_theories_and_desires?.length">
            <h4 class="text-sm font-semibold text-[var(--el-text-color-primary)] mb-2 flex items-center gap-1.5">
              <el-icon class="text-indigo-500"><ChatDotRound /></el-icon>
              <span>{{ t('analytics.episodeFeedback.audienceTheories') }}</span>
            </h4>
            <ul class="space-y-1.5 text-xs text-[var(--el-text-color-secondary)]">
              <li
                v-for="(theory, idx) in insight.audience_theories_and_desires"
                :key="idx"
                class="flex items-start gap-2 bg-[var(--el-fill-color-light)] p-2.5 rounded-lg"
              >
                <span class="text-indigo-500 font-bold">•</span>
                <span class="leading-relaxed">{{ theory }}</span>
              </li>
            </ul>
          </div>

          <!-- Plot Flaws -->
          <div v-if="insight.plot_flaws_and_questions?.length" class="pt-2 border-t border-[var(--el-border-color-extra-light)]">
            <h4 class="text-sm font-semibold text-[var(--el-text-color-primary)] mb-2 flex items-center gap-1.5">
              <el-icon class="text-rose-500"><Warning /></el-icon>
              <span>{{ t('analytics.episodeFeedback.plotholes') }}</span>
            </h4>
            <ul class="space-y-1.5 text-xs text-[var(--el-text-color-secondary)]">
              <li
                v-for="(flaw, idx) in insight.plot_flaws_and_questions"
                :key="idx"
                class="flex items-start gap-2 bg-rose-500/5 p-2.5 rounded-lg text-rose-700 dark:text-rose-300"
              >
                <span class="font-bold">!</span>
                <span class="leading-relaxed">{{ flaw }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Right Column: AI Script Directives & Actions -->
      <div class="space-y-6">
        <!-- AI Recommendations & Apply Button -->
        <div class="p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)] shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-[var(--el-text-color-primary)] flex items-center gap-2">
              <el-icon class="text-indigo-500"><Promotion /></el-icon>
              <span>{{ t('analytics.episodeFeedback.recommendationsTitle') }}</span>
            </h3>
          </div>

          <p class="text-xs text-[var(--el-text-color-secondary)] leading-relaxed">
            {{ t('analytics.episodeFeedback.recommendationsDesc') }}
          </p>

          <!-- Directives List -->
          <ul v-if="insight?.recommendations_for_next_episodes?.length" class="space-y-2.5">
            <li
              v-for="(rec, idx) in insight.recommendations_for_next_episodes"
              :key="idx"
              class="flex items-start gap-2 text-xs text-[var(--el-text-color-primary)] leading-relaxed"
            >
              <el-icon class="text-emerald-500 mt-0.5 flex-shrink-0"><Check /></el-icon>
              <span>{{ rec }}</span>
            </li>
          </ul>
          <p v-else class="text-xs text-[var(--el-text-color-secondary)]">
            {{ t('analytics.episodeFeedback.noDirectives') }}
          </p>

          <!-- Paywall Advice Box -->
          <div v-if="insight?.paywall_optimization_advice" class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
            <div class="font-semibold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1.5">
              <el-icon><Star /></el-icon>
              <span>{{ t('analytics.episodeFeedback.paywallAdvice') }}</span>
            </div>
            <p class="text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
              <span class="font-semibold">{{ formatEnumLabel(insight.paywall_optimization_advice.recommended_cliffhanger_type) }}</span>
              <span class="opacity-70"> · {{ insight.paywall_optimization_advice.hook_placement_second }}s</span>
              <br />
              {{ insight.paywall_optimization_advice.reasoning }}
            </p>
          </div>

          <!-- Custom Director Guidance -->
          <div class="space-y-1.5 pt-2">
            <label class="text-xs font-medium text-[var(--el-text-color-regular)]">
              {{ t('analytics.episodeFeedback.customInstructionLabel') }}
            </label>
            <el-input
              v-model="customInstruction"
              type="textarea"
              :rows="2"
              :placeholder="t('analytics.episodeFeedback.customInstructionPlaceholder')"
              class="text-xs"
            />
          </div>

          <!-- Primary Action Button -->
          <el-button
            type="primary"
            class="w-full !py-5 font-semibold"
            :loading="isApplying"
            @click="handleApplyToNext"
          >
            <el-icon class="mr-1.5"><Promotion /></el-icon>
            <span>{{ isApplying ? t('analytics.episodeFeedback.applying') : t('analytics.episodeFeedback.applyBtn') }}</span>
          </el-button>
        </div>

        <!-- Audience Comments Feed with Filter Tabs -->
        <div class="p-5 rounded-2xl bg-[var(--el-bg-color-overlay)] border border-[var(--el-border-color-lighter)] space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h3 class="text-base font-semibold text-[var(--el-text-color-primary)]">
              {{ t('analytics.episodeFeedback.commentsFeedTitle') }}
            </h3>
            <span class="text-xs font-normal text-[var(--el-text-color-secondary)]">
              {{ filteredComments.length }} / {{ comments.length }}
            </span>
          </div>

          <!-- Sentiment Filter Badges -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              class="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
              :class="selectedSentimentFilter === 'all' ? 'bg-[var(--el-color-primary)] text-white' : 'bg-[var(--el-fill-color-light)] text-[var(--el-text-color-secondary)]'"
              @click="selectedSentimentFilter = 'all'"
            >
              {{ t('analytics.episodeFeedback.filterAll') }} ({{ comments.length }})
            </button>
            <button
              type="button"
              class="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
              :class="selectedSentimentFilter === 'positive' ? 'bg-emerald-500 text-white' : 'bg-[var(--el-fill-color-light)] text-[var(--el-text-color-secondary)]'"
              @click="selectedSentimentFilter = 'positive'"
            >
              {{ t('analytics.episodeFeedback.sentimentPositive') }} ({{ positiveCount }})
            </button>
            <button
              type="button"
              class="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
              :class="selectedSentimentFilter === 'negative' ? 'bg-rose-500 text-white' : 'bg-[var(--el-fill-color-light)] text-[var(--el-text-color-secondary)]'"
              @click="selectedSentimentFilter = 'negative'"
            >
              {{ t('analytics.episodeFeedback.sentimentNegative') }} ({{ negativeCount }})
            </button>
            <button
              type="button"
              class="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
              :class="selectedSentimentFilter === 'neutral' ? 'bg-sky-500 text-white' : 'bg-[var(--el-fill-color-light)] text-[var(--el-text-color-secondary)]'"
              @click="selectedSentimentFilter = 'neutral'"
            >
              {{ t('analytics.episodeFeedback.sentimentNeutral') }} ({{ neutralCount }})
            </button>
          </div>

          <div v-if="filteredComments.length > 0" class="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            <div
              v-for="cmt in filteredComments"
              :key="cmt.id"
              class="p-3 rounded-xl bg-[var(--el-fill-color-light)] text-xs space-y-1.5"
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold text-[var(--el-text-color-primary)]">{{ cmt.author_name }}</span>
                <span class="text-[10px] uppercase font-semibold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                  {{ cmt.platform }}
                </span>
              </div>
              <p class="text-[var(--el-text-color-regular)] leading-relaxed">
                "{{ cmt.comment_text }}"
              </p>
              <div class="flex items-center justify-between text-[11px] text-[var(--el-text-color-secondary)]">
                <span>{{ cmt.likes }} {{ t('analytics.episodeFeedback.likes').toLowerCase() }}</span>
                <span class="capitalize font-medium" :class="{
                  'text-emerald-500': cmt.sentiment === 'positive',
                  'text-rose-500': cmt.sentiment === 'negative',
                  'text-sky-500': cmt.sentiment === 'neutral'
                }">
                  {{ cmt.sentiment }}
                </span>
              </div>
            </div>
          </div>

          <div v-else class="text-xs text-[var(--el-text-color-secondary)] text-center py-6">
            {{ t('analytics.episodeFeedback.noComments') }}
          </div>
        </div>
      </div>
    </div>
  </template>

    <!-- Refinement Result Preview Dialog -->
    <el-dialog
      v-model="showRefinementDialog"
      :title="t('analytics.episodeFeedback.refinementResultTitle')"
      width="600px"
      append-to-body
      class="rounded-2xl"
    >
      <div v-if="refinedEpisode" class="space-y-4 text-xs">
        <p class="text-[var(--el-text-color-secondary)] leading-relaxed">
          {{ t('analytics.episodeFeedback.refinementResultDesc') }}
        </p>

        <div class="p-3.5 rounded-xl bg-[var(--el-fill-color-light)] space-y-1">
          <div class="font-semibold text-[var(--el-text-color-primary)]">
            Ep {{ refinedEpisode.number || refinedEpisode.episode_number }}: {{ refinedEpisode.title }}
          </div>
        </div>

        <div class="space-y-1">
          <span class="font-semibold text-[var(--el-text-color-primary)]">
            {{ t('analytics.episodeFeedback.updatedSynopsis') }}
          </span>
          <p class="p-3 rounded-xl bg-[var(--el-fill-color-light)] text-[var(--el-text-color-regular)] leading-relaxed">
            {{ refinedEpisode.synopsis }}
          </p>
        </div>

        <div v-if="refinedEpisode.scene_core" class="space-y-1">
          <span class="font-semibold text-[var(--el-text-color-primary)]">
            {{ t('analytics.episodeFeedback.updatedSceneCore') }}
          </span>
          <p class="p-3 rounded-xl bg-[var(--el-fill-color-light)] text-[var(--el-text-color-regular)] leading-relaxed">
            {{ refinedEpisode.scene_core }}
          </p>
        </div>

        <div v-if="refinedEpisode.cliffhanger_hook" class="space-y-1">
          <span class="font-semibold text-[var(--el-text-color-primary)]">
            {{ t('analytics.episodeFeedback.updatedCliffhanger') }}
          </span>
          <p class="p-3 rounded-xl bg-[var(--el-fill-color-light)] text-[var(--el-text-color-regular)] leading-relaxed">
            {{ refinedEpisode.cliffhanger_hook }}
          </p>
        </div>
      </div>

      <template #footer>
        <el-button type="primary" @click="showRefinementDialog = false">
          {{ t('analytics.episodeFeedback.closeBtn') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>


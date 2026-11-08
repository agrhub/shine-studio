import type { CreditTransactionEntity, EpisodeEntity, PipelineJobEntity, SeriesEntity } from '@/types.js';

/**
 * Creator dashboard numbers computed only from stored data:
 * - earnings / views / engagement: episode analytics summaries (synced from
 *   platform APIs or public pages); zero until real data exists
 * - render hours: duration of rendered versions
 * - asset library size: stored asset sizes
 * - pipeline success rate and credit velocity: pipeline jobs and credit history
 * Nothing here is a fixed demo value or a multiplier on the series count.
 */
export interface DashboardInput {
  series: SeriesEntity[];
  episodes: EpisodeEntity[];
  assets: Array<{ size_bytes?: number; fileSize?: number; sizeBytes?: number }>;
  credits: CreditTransactionEntity[];
  jobs: PipelineJobEntity[];
  creditBalance: number;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const round = (n: number, digits = 2) => Number(n.toFixed(digits));

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function aggregateDashboard(input: DashboardInput) {
  const now = input.now ?? new Date();
  const { series, episodes, assets, credits, jobs } = input;

  const totalSeries = series.length;
  const activeSeries = series.filter((s) => s.status !== 'ARCHIVED').length;
  const draftSeries = series.filter((s) => s.status === 'DRAFT').length;
  const publishedSeries = series.filter((s) => s.status === 'PUBLISHED').length;
  const totalEpisodes = episodes.length;

  // Render hours from actual rendered versions
  const renderSeconds = episodes.reduce(
    (acc, ep) => acc + (ep.render_versions || []).reduce((s, v: any) => s + (Number(v?.duration) || 0), 0),
    0
  );
  const renderHours = round(renderSeconds / 3600, 1);

  const totalBytes = assets.reduce((acc, a) => acc + (Number(a.size_bytes ?? a.fileSize ?? a.sizeBytes) || 0), 0);
  const assetLibrarySizeGb = round(totalBytes / 1024 ** 3);

  // Audience numbers from synced analytics summaries only
  const summaries = episodes.map((ep) => ep.analytics_summary).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const views = summaries.reduce((a, s) => a + (s.total_views || 0), 0);
  const interactions = summaries.reduce((a, s) => a + (s.total_likes || 0) + (s.total_comments || 0) + (s.total_shares || 0), 0);
  const creatorEarnings = round(summaries.reduce((a, s) => a + (s.estimated_revenue || 0), 0));
  const viewerEngagementPct = views > 0 ? round((interactions / views) * 100, 1) : 0;

  // Pipeline reliability
  const finished = jobs.filter((j) => j.status === 'completed' || j.status === 'failed');
  const completed = finished.filter((j) => j.status === 'completed').length;
  const modelEfficiencyPct = finished.length ? round((completed / finished.length) * 100, 1) : 0;

  // Credits spent per hour over the last 24h
  const spentSince = (from: number, to: number) =>
    credits
      .filter((c) => c.amount < 0 && c.created_at && new Date(c.created_at).getTime() >= from && new Date(c.created_at).getTime() < to)
      .reduce((a, c) => a + Math.abs(c.amount), 0);
  const tokenVelocityPerHr = round(spentSince(now.getTime() - DAY_MS, now.getTime() + 1) / 24, 1);

  // 8-day sparklines (oldest → newest)
  const days = Array.from({ length: 8 }, (_, i) => {
    const end = new Date(now.getTime() - (7 - i) * DAY_MS);
    end.setUTCHours(23, 59, 59, 999);
    return { from: end.getTime() - DAY_MS + 1, to: end.getTime() + 1 };
  });
  const tokenVelocitySpark = days.map((d) => round(spentSince(d.from, d.to) / 24, 1));
  const modelEfficiencySpark = days.map((d) => {
    const inDay = finished.filter((j) => {
      const t = new Date(j.updated_at || j.created_at).getTime();
      return t >= d.from && t < d.to;
    });
    return inDay.length ? round((inDay.filter((j) => j.status === 'completed').length / inDay.length) * 100, 1) : 0;
  });
  // Engagement of the 8 most recent episodes with data
  const engagementByEpisode = episodes
    .filter((ep) => ep.analytics_summary?.total_views)
    .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
    .slice(-8)
    .map((ep) => {
      const s = ep.analytics_summary!;
      return round((((s.total_likes || 0) + (s.total_comments || 0) + (s.total_shares || 0)) / (s.total_views || 1)) * 100, 1);
    });
  const viewerEngagementSpark = [...Array(Math.max(0, 8 - engagementByEpisode.length)).fill(0), ...engagementByEpisode];

  // Last 6 calendar months: estimated income (USD) vs credits spent
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
    return { key: monthKey(d), label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) };
  });
  const income = months.map((m) =>
    round(summaries.filter((s) => s.synced_at && monthKey(new Date(s.synced_at)) === m.key).reduce((a, s) => a + (s.estimated_revenue || 0), 0))
  );
  const expense = months.map(
    (m) => -credits.filter((c) => c.amount < 0 && c.created_at && monthKey(new Date(c.created_at)) === m.key).reduce((a, c) => a + Math.abs(c.amount), 0)
  );

  return {
    stats: {
      totalSeries,
      activeSeries,
      draftSeries,
      publishedSeries,
      totalEpisodes,
      renderHours,
      assetLibrarySizeGb,
      creatorEarnings,
      // No forecasting model yet: projection equals measured earnings.
      projectedYield: creatorEarnings,
      totalViews: views,
      viewerEngagementPct,
      modelEfficiencyPct,
      tokenVelocityPerHr,
      shineBalance: input.creditBalance,
      hasAudienceData: summaries.some((s) => s.data_status !== 'unavailable' && (s.total_views || 0) > 0),
    },
    sparklines: {
      viewerEngagement: viewerEngagementSpark,
      modelEfficiency: modelEfficiencySpark,
      tokenVelocity: tokenVelocitySpark,
    },
    cashflow: {
      categories: months.map((m) => m.label),
      income,
      expense,
      incomeUnit: 'usd_estimated',
      expenseUnit: 'credits',
    },
  };
}

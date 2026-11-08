import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-analytics-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { aggregateDashboard } = await import('../src/services/DashboardAnalyticsService.js');

test('dashboard: empty account shows zeros, not demo numbers', () => {
  const d = aggregateDashboard({ series: [{ id: 's', status: 'PUBLISHED' } as any], episodes: [], assets: [], credits: [], jobs: [], creditBalance: 100 });
  assert.equal(d.stats.creatorEarnings, 0, 'no $380-per-series earnings');
  assert.equal(d.stats.viewerEngagementPct, 0);
  assert.equal(d.stats.modelEfficiencyPct, 0);
  assert.equal(d.stats.hasAudienceData, false);
  assert.deepEqual(d.sparklines.viewerEngagement, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(d.cashflow.categories.length, 6);
});

test('dashboard: numbers are derived from stored data', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const d = aggregateDashboard({
    now,
    series: [{ id: 's1', status: 'PUBLISHED' } as any],
    episodes: [
      { id: 'e1', episode_number: 1, render_versions: [{ duration: 1800 }, { duration: 1800 }],
        analytics_summary: { total_views: 10000, total_likes: 800, total_comments: 100, total_shares: 100, estimated_revenue: 0.48, synced_at: '2026-11-02T00:00:00Z', data_status: 'live' } } as any,
    ],
    assets: [{ size_bytes: 1024 ** 3 }, { size_bytes: 1024 ** 3 }],
    credits: [
      { amount: -48, created_at: '2026-11-08T06:00:00Z' } as any,
      { amount: 1000, created_at: '2026-11-08T07:00:00Z' } as any, // grant, not spend
      { amount: -10, created_at: '2026-10-15T00:00:00Z' } as any,
    ],
    jobs: [
      { status: 'completed', created_at: '2026-11-08T01:00:00Z' } as any,
      { status: 'completed', created_at: '2026-11-07T01:00:00Z' } as any,
      { status: 'failed', created_at: '2026-11-07T02:00:00Z' } as any,
      { status: 'running', created_at: '2026-11-08T02:00:00Z' } as any,
    ],
    creditBalance: 952,
  });
  assert.equal(d.stats.renderHours, 1);
  assert.equal(d.stats.assetLibrarySizeGb, 2);
  assert.equal(d.stats.creatorEarnings, 0.48);
  assert.equal(d.stats.viewerEngagementPct, 10);
  assert.equal(d.stats.modelEfficiencyPct, 66.7);
  assert.equal(d.stats.tokenVelocityPerHr, 2);
  assert.equal(d.cashflow.categories.at(-1), 'Nov');
  assert.equal(d.cashflow.income.at(-1), 0.48);
  assert.deepEqual(d.cashflow.expense.slice(-2), [-10, -48]);
});

test('harvester + audience agent: no web data → no invented metrics, comments or directives', async () => {
  const { getDatabaseProvider } = await import('../src/database/index.js');
  const { mcpClient } = await import('../src/integrations/mcp/ParallelMCPClient.js');
  const { episodeHarvesterService } = await import('../src/services/EpisodeHarvesterService.js');
  const { audienceIntelligenceAgent } = await import('../src/agents/AudienceIntelligenceAgent.js');

  // Web search finds nothing
  (mcpClient as any).fetchEpisodePublicMetrics = async () => null;
  (mcpClient as any).fetchEpisodeComments = async () => [];

  const db = await getDatabaseProvider();
  await db.createSeries({ id: 'ser_a', user_id: 'usr_a', title: 'S', status: 'PUBLISHED' } as any);
  await db.createEpisode({ id: 'ep_a1', series_id: 'ser_a', episode_number: 1, title: 'One', status: 'PUBLISHED', published_urls: { youtube: 'https://youtu.be/x' } } as any);
  await db.createEpisode({ id: 'ep_a2', series_id: 'ser_a', episode_number: 2, title: 'Two' } as any);

  const { summary, comments } = await episodeHarvesterService.harvestEpisodeData('ep_a1', 'usr_a');
  assert.equal(summary.total_views, 0);
  assert.equal(summary.total_likes, 0, 'no likes derived from views');
  assert.equal(summary.retention_rate_pct, undefined, 'no assumed 79.4% retention');
  assert.equal(summary.data_status, 'unavailable');
  assert.deepEqual(comments, []);

  const episode = await db.getEpisodeById('ep_a1');
  const insight = await audienceIntelligenceAgent.analyzeEpisodeFeedback({ episode: episode!, comments, metrics: summary, series: null as any });
  assert.deepEqual(insight.recommendations_for_next_episodes, []);
  assert.deepEqual(insight.character_reception, []);

  const applied = await audienceIntelligenceAgent.applyInsightsToNextEpisode('ep_a1');
  assert.equal(applied.success, false, 'never rewrites the next script from invented feedback');
  assert.match(applied.message, /No real audience feedback/);
});

import { Router, Request, Response } from 'express';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { aggregateDashboard } from '@/services/DashboardAnalyticsService.js';
import { getDatabaseProvider } from '../database/index.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { getUserId } from '@/utils/auth.js';
import { episodeHarvesterService } from '@/services/EpisodeHarvesterService.js';
import { audienceIntelligenceAgent } from '@/agents/AudienceIntelligenceAgent.js';

export const analyticsPaywallRouter = Router();

// GET /api/analytics/dashboard - Provide real creator studio dashboard analytics matching the logged-in user
analyticsPaywallRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ code: 401, data: null, message: 'Unauthorized', error: 'UNAUTHORIZED' });
    const db = await getDatabaseProvider();

    const [seriesList, userAssets, user, credits, jobs] = await Promise.all([
      db.getSeriesList(userId, '', ''),
      db.getAssets({ user_id: userId }),
      db.getUserById(userId),
      db.getCreditHistory(userId, 1000),
      db.getPipelineJobs({ user_id: userId, limit: 500 }),
    ]);
    const episodes = (await Promise.all(seriesList.map((s) => db.getEpisodesBySeriesId(s.id)))).flat();

    const data = aggregateDashboard({
      series: seriesList,
      episodes,
      assets: userAssets as any[],
      credits,
      jobs,
      creditBalance: user?.credits ?? 0,
    });

    return res.json({ code: 200, data, message: 'Dashboard analytics retrieved successfully', error: null });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: 'Failed to fetch dashboard analytics', error: err.message });
  }
});

// GET /api/analytics/insights — Retention curves, demographic split & engagement heatmap
analyticsPaywallRouter.get('/insights', async (req: Request, res: Response) => {
  try {
    const seriesId = (req.query.seriesId as string) || '';
    const timeframe = (req.query.timeframe as string) || '30d';
    // Always the authenticated user (a userId query parameter would expose other users' data).
    const userId = getUserId(req);
    const db = await getDatabaseProvider();
    const seriesList = userId ? await db.getSeriesList(userId, '', '') : [];
    const targetSeries = seriesId ? seriesList.find((s) => s.id === seriesId) : seriesList[0];

    const categories = ['0:00', '0:15', '0:30', '0:45', '1:00', '1:15', '1:30', '1:45', '2:00', '2:15', '2:30', '2:45', '3:00', '3:15', '3:30'];
    const zeros = categories.map(() => 0);

    // Measured data only: synced episode analytics (views, interactions, countries,
    // retention when a platform API reported it). Retention curves, age groups and
    // scene heatmaps need platform analytics access and are left empty until then.
    const episodes = targetSeries ? await db.getEpisodesBySeriesId(targetSeries.id) : [];
    const summaries = episodes
      .map((ep) => ep.analytics_summary)
      .filter((s): s is NonNullable<typeof s> => Boolean(s) && s!.data_status !== 'unavailable');
    const views = summaries.reduce((a, s) => a + (s.total_views || 0), 0);
    const interactions = summaries.reduce((a, s) => a + (s.total_likes || 0) + (s.total_comments || 0) + (s.total_shares || 0), 0);
    const retentions = summaries.map((s) => s.retention_rate_pct).filter((r): r is number => typeof r === 'number' && r > 0);
    const avgRetention = retentions.length ? retentions.reduce((a, r) => a + r, 0) / retentions.length : 0;

    const countryViews = new Map<string, number>();
    for (const s of summaries) {
      for (const c of s.top_countries || []) {
        const name = (c as any).country || (c as any).country_code;
        if (!name) continue;
        countryViews.set(name, (countryViews.get(name) || 0) + ((Number((c as any).percentage) || 0) / 100) * (s.total_views || 0));
      }
    }
    const topRegion = [...countryViews.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return res.json({
      code: 200,
      data: {
        seriesId: targetSeries?.id || '',
        seriesTitle: targetSeries?.title || '',
        timeframe,
        hasData: summaries.length > 0 && views > 0,
        totals: {
          views,
          interactions,
          engagementRatePct: views > 0 ? Number(((interactions / views) * 100).toFixed(1)) : 0,
          episodesWithData: summaries.length,
        },
        kpi: {
          avgRetention: `${avgRetention.toFixed(1)}%`,
          retentionChange: 'N/A',
          watchTime: 'N/A',
          watchTimeChange: 'N/A',
          completionRate: 'N/A',
          completionChange: 'N/A',
          peakConcurrent: 'N/A',
          peakChange: 'N/A',
        },
        retentionChart: { categories, currentSeries: zeros, benchmark: zeros },
        demographics: { series: [0, 0, 0], labels: ['18-24', '25-34', '35+'], topRegion, coreAge: 'N/A', coreGroup: 'None' },
        heatmap: [],
      },
      message: targetSeries ? 'Insights analytics retrieved successfully' : 'No series available for user',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: 'Failed to fetch insights', error: err.message });
  }
});

// GET /api/analytics/overview - Provide overall metrics
analyticsPaywallRouter.get('/overview', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const db = await getDatabaseProvider();
    const seriesList = userId ? await db.getSeriesList(userId, '', '') : [];
    const episodes = (await Promise.all(seriesList.map((s) => db.getEpisodesBySeriesId(s.id)))).flat();
    const summaries = episodes.map((ep) => ep.analytics_summary).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const views = summaries.reduce((a, s) => a + (s.total_views || 0), 0);
    const revenue = summaries.reduce((a, s) => a + (s.estimated_revenue || 0), 0);
    const retentions = summaries.map((s) => s.retention_rate_pct).filter((r): r is number => typeof r === 'number' && r > 0);
    const activeSeries = seriesList.filter((s) => s.status !== 'ARCHIVED').length;

    return res.json({
      code: 200,
      data: {
        // Measured values only; "change" needs historical snapshots, which are not stored yet.
        summaryStats: [
          { title: 'Total Views', value: views.toLocaleString(), change: 'N/A', positive: true, icon: 'View' },
          { title: 'Est. Revenue', value: `$${revenue.toFixed(2)}`, change: 'N/A', positive: true, icon: 'Money' },
          { title: 'Active Series', value: `${activeSeries}`, change: 'N/A', positive: true, icon: 'User' },
          {
            title: 'Avg. Retention',
            value: retentions.length ? `${(retentions.reduce((a, r) => a + r, 0) / retentions.length).toFixed(1)}%` : 'N/A',
            change: 'N/A',
            positive: true,
            icon: 'TrendCharts',
          },
        ],
        episodeStats: []
      },
      message: 'Analytics overview retrieved',
      error: null
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: 'Failed to fetch analytics', error: err.message });
  }
});

// GET /api/analytics/paywall-recommendation — Return AI paywall placement recommendations
analyticsPaywallRouter.get('/paywall-recommendation', async (req: Request, res: Response) => {
  const seriesId = (req.query.seriesId as string) || 'series-001';

  try {
    const prompt = PromptLoader.render('trend/paywall_recommendation', {
      seriesId,
      totalEpisodes: 20,
      retentionSummary: 'Ep 1-3 average 85% retention, sharp cliffhanger at Ep 3 climax',
    });

    const raw = await aiProviderRouter.generateText({
      prompt,
      systemInstruction: 'You are an AI Paywall & Monetization Optimization Engine for Micro-Drama platforms.',
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    const recommendations = Array.isArray(parsed) ? parsed : (parsed.recommendations || []);
    return res.json({
      code: 200,
      data: recommendations,
      message: 'Paywall recommendations calculated via Gemini Monetization Engine',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: 'Failed to calculate paywall recommendations',
      error: err.message,
    });
  }
});

// POST /api/analytics/episodes/:episodeId/sync - Trigger multi-platform metrics & comments harvesting via Parallel MCP
analyticsPaywallRouter.post('/episodes/:episodeId/sync', async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.params;
    const userId = getUserId(req) || 'usr_default';
    const db = await getDatabaseProvider();

    const episode = await db.getEpisodeById(episodeId as string);
    if (!episode) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: `Episode not found with id: ${episodeId}`,
        error: 'Not Found',
      });
    }

    const series = await db.getSeriesById(episode.series_id);

    // 1. Harvest metrics and comments via Parallel MCP & Native APIs
    const { summary, comments } = await episodeHarvesterService.harvestEpisodeData(episodeId as string, userId);

    // 2. Perform Gemini audience intelligence analysis
    const insight = await audienceIntelligenceAgent.analyzeEpisodeFeedback({
      episode,
      comments,
      metrics: summary,
      series,
    });

    return res.json({
      code: 200,
      data: {
        summary,
        comments,
        insight,
      },
      message: 'Episode performance metrics and audience intelligence synchronized successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: 'Failed to synchronize episode analytics',
      error: err.message,
    });
  }
});

// GET /api/analytics/episodes/:episodeId/insights - Retrieve audience intelligence and feedback for an episode
analyticsPaywallRouter.get('/episodes/:episodeId/insights', async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.params;
    const userId = getUserId(req) || 'usr_default';
    const db = await getDatabaseProvider();

    const episode = await db.getEpisodeById(episodeId as string);
    if (!episode) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: `Episode not found with id: ${episodeId}`,
        error: 'Not Found',
      });
    }

    const series = await db.getSeriesById(episode.series_id);

    // If no summary or insight exists yet, harvest on-the-fly
    let summary = episode.analytics_summary;
    let comments = await episodeHarvesterService.getEpisodeComments(episode.id, userId);
    let insight = episode.audience_insight;

    if (!summary || !insight) {
      const harvested = await episodeHarvesterService.harvestEpisodeData(episode.id, userId);
      summary = harvested.summary;
      comments = harvested.comments;
      insight = await audienceIntelligenceAgent.analyzeEpisodeFeedback({
        episode,
        comments,
        metrics: summary,
        series,
      });
    }

    return res.json({
      code: 200,
      data: {
        summary,
        comments,
        insight,
      },
      message: 'Episode audience intelligence retrieved successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: 'Failed to retrieve episode insights',
      error: err.message,
    });
  }
});

// POST /api/analytics/episodes/:episodeId/apply-to-next - Apply audience recommendations to subsequent episode's screenplay
analyticsPaywallRouter.post('/episodes/:episodeId/apply-to-next', async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.params;
    const { customInstruction } = req.body || {};

    const result = await audienceIntelligenceAgent.applyInsightsToNextEpisode(episodeId as string, customInstruction);

    if (!result.success) {
      return res.status(400).json({
        code: 400,
        data: result,
        message: result.message,
        error: 'Failed to apply recommendations',
      });
    }

    return res.json({
      code: 200,
      data: result,
      message: result.message,
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: 'Failed to apply audience feedback to next episode',
      error: err.message,
    });
  }
});


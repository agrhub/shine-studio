import { Router } from 'express';
import { directorAgent } from '../agents/DirectorAgent.js';
import { storySkeletonAgent } from '../agents/StorySkeletonAgent.js';
import { scriptAgent } from '../agents/ScriptAgent.js';
import { supervisionAgent } from '../agents/SupervisionAgent.js';
import { trendRadarAgent } from '../agents/TrendRadarAgent.js';
import { masterPlanRefineAgent } from '../agents/MasterPlanRefineAgent.js';
import { CreditService } from '../services/CreditService.js';
import { getUserId } from '@/utils/auth.js';

export const aiRouter = Router();

import { viralTrendService } from '../services/ViralTrendService.js';

// GET /api/ai/trends/viral-topics — Multi-market caching & pagination service with instant response
aiRouter.get('/trends/viral-topics', async (req, res) => {
  const country = (req.query.country as string) || (req.query.region as string) || 'US';
  const lang = (req.query.lang as string) || (req.query.language as string) || (req.headers['accept-language']?.split(',')[0]?.split(';')[0]) || 'en-US';
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || Number(req.query.limit) || 12;
  const genre = (req.query.genre as string) || undefined;
  const search = (req.query.search as string) || undefined;
  const forceRefresh = req.query.forceRefresh === 'true' || req.query.refresh === 'true';

  try {
    const result = await viralTrendService.getTrends({
      country,
      lang,
      page,
      pageSize,
      genre,
      search,
      forceRefresh,
    });
    return res.json({
      code: 200,
      data: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
      country: result.country,
      updatedAt: result.updatedAt,
      fromCache: result.fromCache,
      message: result.fromCache
        ? `Served ${result.items.length} trends from cache for ${result.country}`
        : `Fetched ${result.items.length} fresh trends for ${result.country} via AI`,
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: [],
      message: `Failed to fetch viral topics: ${err.message}`,
      error: err.message,
    });
  }
});

// GET /api/ai/trends/cache-status — Debug: which markets are cached and whether stale
aiRouter.get('/trends/cache-status', (_req, res) => {
  return res.json({
    code: 200,
    data: viralTrendService.getCacheStatus(),
    message: 'Cache status for all popular markets',
    error: null,
  });
});

// POST /api/ai/generate-master-plan — Delegated to StorySkeletonAgent & script_skeleton skill
aiRouter.post('/generate-master-plan', async (req, res) => {
  try {
    const {
      title,
      genre,
      visual_style,
      visual_style_prompt,
      synopsis,
      total_episodes,
      episode_duration_seconds,
      country,
      language,
      ratio,
      viral_topic,
      reference_assets,
    } = req.body;

    const userId = getUserId(req);
    const deduct = await CreditService.deductUserCredits(userId, 'scriptGeneration', 'Script Master Plan Generation', `Series: ${title || 'Untitled'}`);
    if (!deduct.success && deduct.error?.includes('Insufficient')) {
      return res.status(402).json({ code: 402, data: null, message: deduct.error, error: 'INSUFFICIENT_CREDITS' });
    }

    const plan = await storySkeletonAgent.execute({
      title: title || 'Untitled Series',
      genre: genre || 'Suspense / Mystery',
      visual_style: visual_style || 'realistic',
      visual_style_prompt: visual_style_prompt || '',
      synopsis: synopsis || 'A high-stakes conflict of ambition, betrayal, and power.',
      total_episodes: total_episodes || 24,
      episode_duration_seconds: episode_duration_seconds ? Number(episode_duration_seconds) : undefined,
      country: country || 'United States',
      language: language || 'en-US',
      ratio: ratio || '9:16',
      viral_topic: viral_topic || '',
      reference_assets: reference_assets,
    });

    return res.json({
      code: 200,
      data: plan,
      message: 'Master plan generated successfully adhering to script skeleton specification',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Master plan generation failed: ${err.message}`,
      error: err.message,
    });
  }
});

// POST /api/ai/generate-outline — Delegated to StorySkeletonAgent
aiRouter.post('/generate-outline', async (req, res) => {
  try {
    const { title, genre, visual_style, synopsis, total_episodes } = req.body;
    const userId = getUserId(req);
    const deduct = await CreditService.deductUserCredits(userId, 'scriptGeneration', 'Story Outline Generation', `Series: ${title || 'Untitled'}`);
    if (!deduct.success && deduct.error?.includes('Insufficient')) {
      return res.status(402).json({ code: 402, data: null, message: deduct.error, error: 'INSUFFICIENT_CREDITS' });
    }

    const outline = await storySkeletonAgent.execute({
      title: title || 'Undercover Mastermind',
      genre: genre || 'Suspense',
      visual_style: visual_style || 'realistic',
      synopsis: synopsis || 'Betrayed heir undercover to dismantle corrupt board.',
      total_episodes: total_episodes || 20,
    });
    return res.json({ code: 200, data: outline, message: 'Outline generated successfully', error: null });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Outline generation failed: ${err.message}`,
      error: err.message,
    });
  }
});

// POST /api/ai/refine-master-plan — Delegated to MasterPlanRefineAgent & script_refine_master_plan skill
aiRouter.post('/refine-master-plan', async (req, res) => {
  try {
    const { current_plan, user_instruction } = req.body;
    if (!current_plan || !user_instruction) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: 'current_plan and user_instruction are required',
        error: 'INVALID_PAYLOAD',
      });
    }

    const userId = getUserId(req);
    const deduct = await CreditService.deductUserCredits(userId, 'scriptGeneration', 'Master Plan Refine', `Plan: ${current_plan?.title || 'Series'}`);
    if (!deduct.success && deduct.error?.includes('Insufficient')) {
      return res.status(402).json({ code: 402, data: null, message: deduct.error, error: 'INSUFFICIENT_CREDITS' });
    }

    const result = await masterPlanRefineAgent.execute({ currentPlan: current_plan, userInstruction: user_instruction });

    return res.json({
      code: 200,
      data: result,
      message: 'Master plan refined successfully via Script Consultant skill',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Master plan refinement failed: ${err.message}`,
      error: err.message,
    });
  }
});

// POST /api/ai/generate-script — Delegated to DirectorAgent & multi-agent pipeline
aiRouter.post('/generate-script', async (req, res) => {
  try {
    const { title, genre, visual_style, synopsis, episode_number, total_episodes } = req.body;
    const userId = getUserId(req);
    const deduct = await CreditService.deductUserCredits(userId, 'scriptGeneration', 'Screenplay Script Generation', `Series: ${title || 'Untitled'} (Ep ${episode_number || 1})`);
    if (!deduct.success && deduct.error?.includes('Insufficient')) {
      return res.status(402).json({ code: 402, data: null, message: deduct.error, error: 'INSUFFICIENT_CREDITS' });
    }

    const pipelineResult = await directorAgent.runPipeline({
      title: title || 'Undercover Mastermind',
      genre: genre || 'Suspense',
      visual_style: visual_style || 'realistic',
      synopsis: synopsis || 'Betrayed heir undercover to dismantle corrupt board.',
      episode_number: episode_number || 1,
      total_episodes: total_episodes || 20,
    });

    return res.json({
      code: 200,
      data: {
        script_item: pipelineResult.scriptItem,
        supervision: pipelineResult.supervision,
        outline: pipelineResult.outline,
      },
      message: 'Script generated successfully via Multi-Agent pipeline',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Script generation failed: ${err.message}`,
      error: err.message,
    });
  }
});

// POST /api/ai/verify-compliance — Master Plan Compliance & Safety Audit
aiRouter.post('/verify-compliance', async (req, res) => {
  try {
    const { master_plan, masterPlan, country, ratio, language, lang } = req.body;
    const plan = master_plan || masterPlan;
    const result = await supervisionAgent.verifyMasterPlanCompliance({
      masterPlan: plan,
      country,
      ratio,
      lang: language || lang || 'en-US',
    });
    return res.json({
      code: 200,
      data: result,
      message: 'Compliance and safety check verified successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Compliance check failed: ${err.message}`,
      error: err.message,
    });
  }
});

import { analysisService } from '../services/AnalysisService.js';
import { productionAgentService } from '../services/ProductionAgentService.js';

// POST /api/ai/analyze-pacing — Script pacing & emotional retention trajectory analysis
aiRouter.post('/analyze-pacing', async (req, res) => {
  try {
    const { script_data } = req.body;
    const result = await analysisService.analyzeScriptPacing(script_data);
    return res.json({
      code: 200,
      data: result,
      message: 'Script pacing and retention analysis completed',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Pacing analysis failed: ${err.message}`,
      error: err.message,
    });
  }
});

// POST /api/ai/generate-storyboard — Generate cinematic storyboard visual panels
aiRouter.post('/generate-storyboard', async (req, res) => {
  try {
    const { scenes } = req.body;
    const result = await productionAgentService.generateStoryboardPanels(scenes || []);
    return res.json({
      code: 200,
      data: result,
      message: 'Visual storyboard panels generated successfully via Production Agent',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Storyboard generation failed: ${err.message}`,
      error: err.message,
    });
  }
});



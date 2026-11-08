import { Router, Request, Response } from 'express';
import { aiUsageGuard, AiCostGuardrails } from '@/services/ai/AiUsageGuard.js';
import { PLANS } from '@/config/plans.js';

export const costGuardrailsRouter = Router();

const KINDS = ['TEXT', 'IMAGE', 'VIDEO', 'MUSIC', 'VOICE'] as const;

async function snapshot() {
  const [guardrails, usage] = await Promise.all([aiUsageGuard.getGuardrails(), aiUsageGuard.getUsage()]);
  const topUsers = Object.entries(usage.users)
    .map(([userId, calls]) => ({
      userId,
      calls,
      spendUsd: Math.round(KINDS.reduce((s, k) => s + (calls[k] || 0) * (guardrails.unitCostUsd[k] || 0), 0) * 10_000) / 10_000,
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd)
    .slice(0, 20);

  return {
    ...guardrails,
    // Legacy field names used by the chat store / admin UI
    maxBudgetUsd: guardrails.dailyBudgetUsd,
    currentSpendUsd: usage.spendUsd,
    date: usage.date,
    callsToday: usage.calls,
    topUsers,
    planDailyLimits: Object.fromEntries(Object.values(PLANS).map((p) => [p.id, p.dailyAiLimits])),
  };
}

// GET /api/admin/cost-guardrails — current limits + today's estimated spend
costGuardrailsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ code: 200, data: await snapshot(), message: 'Cost guardrails retrieved', error: null });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'GUARDRAILS_ERROR' });
  }
});

// PUT /api/admin/cost-guardrails — update limits (persisted in system settings)
costGuardrailsRouter.put('/', async (req: Request, res: Response) => {
  const body = req.body || {};
  const patch: Partial<AiCostGuardrails> = {};
  const budget = body.dailyBudgetUsd ?? body.maxBudgetUsd;

  if (budget !== undefined) {
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0) {
      return res.status(400).json({ code: 400, data: null, message: 'dailyBudgetUsd must be a number ≥ 0 (0 = unlimited)', error: 'INVALID_PAYLOAD' });
    }
    patch.dailyBudgetUsd = budget;
  }
  if (typeof body.lowResProxyMode === 'boolean') patch.lowResProxyMode = body.lowResProxyMode;
  if (typeof body.aiDisabled === 'boolean') patch.aiDisabled = body.aiDisabled;
  if (body.unitCostUsd && typeof body.unitCostUsd === 'object') {
    const costs: Partial<Record<(typeof KINDS)[number], number>> = {};
    for (const k of KINDS) {
      const v = body.unitCostUsd[k];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        return res.status(400).json({ code: 400, data: null, message: `unitCostUsd.${k} must be a number ≥ 0`, error: 'INVALID_PAYLOAD' });
      }
      costs[k] = v;
    }
    patch.unitCostUsd = costs as AiCostGuardrails['unitCostUsd'];
  }

  try {
    await aiUsageGuard.saveGuardrails(patch);
    return res.status(200).json({ code: 200, data: await snapshot(), message: 'Cost guardrails updated', error: null });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'GUARDRAILS_ERROR' });
  }
});

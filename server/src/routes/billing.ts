import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { getUserId, getAuthUser } from '@/utils/auth.js';
import { getPlan } from '@/config/plans.js';
import { createCheckoutSession, isStripeConfigured } from '@/services/StripeService.js';

export const billingRouter = Router();

// GET /api/billing/tier — Return current user tier and AI credit balance
billingRouter.get('/tier', async (req: Request, res: Response) => {
  try {
    const db = await getDatabaseProvider();
    let user: any = await getAuthUser(req);
    if (!user) {
      return res.status(401).send("User not found");
    }

    const plan = getPlan(user.tier);
    return res.json({
      code: 200,
      data: {
        tier: plan.id,
        credit_balance: user.credits ?? 0,
        credit_quota: plan.monthlyCredits,
        features: plan.features,
        monthly_price_usd: plan.priceUsd,
        daily_ai_limits: plan.dailyAiLimits,
        billing_enabled: isStripeConfigured(),
      },
      message: 'Subscription tier retrieved',
      error: null,
    });
  }catch(error: any){
    return res.status(500).json({
      code: 500,
      data: null,
      message: error.message || 'Failed to retrieve subscription tier',
      error: 'INTERNAL_ERROR',
    });
  }
});

// POST /api/billing/checkout — Create a real Stripe Checkout Session.
// Plan changes are applied ONLY by the verified webhook, never by this call or the redirect.
billingRouter.post('/checkout', async (req: Request, res: Response) => {
  try {
    const { tier } = req.body;
    if (!tier) {
      return res.status(400).json({ code: 400, data: null, message: 'Subscription tier is required', error: 'INVALID_TIER' });
    }
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ code: 401, data: null, message: 'User not found', error: 'UNAUTHORIZED' });
    }

    const session = await createCheckoutSession({ userId: user.id, email: user.email, planId: tier });
    return res.json({
      code: 200,
      data: { session_id: session.id, url: session.url },
      message: 'Stripe checkout session created',
      error: null,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return res.status(status).json({
      code: status,
      data: null,
      message: err.message || 'Checkout failed',
      error: status === 503 ? 'BILLING_NOT_CONFIGURED' : 'STRIPE_ERROR',
    });
  }
});

// POST /api/billing/revenue-splits — Creator revenue share calculation
billingRouter.post('/revenue-splits', (req: Request, res: Response) => {
  const { seriesId, totalRevenueUsd } = req.body;
  const netRevenue = (totalRevenueUsd || 1000) * 0.7; // 70% to creator

  return res.json({
    code: 200,
    data: {
      seriesId: seriesId || 'series-001',
      gross_revenueUsd: totalRevenueUsd || 1000,
      platform_fee_usd: (totalRevenueUsd || 1000) * 0.3,
      creator_payout_usd: netRevenue,
      payout_status: 'scheduled',
    },
    error: null,
    message: 'Revenue split calculated successfully',
  });
});

// GET /api/billing/usage-history — Return real credit deduction history
billingRouter.get('/usage-history', async (req: Request, res: Response) => {
  try{
    const db = await getDatabaseProvider();
    const userId = getUserId(req, '');
    if(!userId){
      return res.status(401).send("User not found");
    }

    let transactions = await db.getCreditHistory(userId || undefined, 50);
    
    const formatted = transactions.map((t) => ({
      id: t.id,
      type: t.activity,
      detail: t.details || 'AI Task Execution',
      credits: t.amount,
      balance_after: t.balance_after,
      date: t.created_at ? new Date(t.created_at).toISOString().replace('T', ' ').substring(0, 16) : new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: t.status || 'Success',
    }));

    return res.json({
      code: 200,
      data: formatted,
      message: 'Usage history retrieved',
      error: null,
    });
  }catch(error: any){
    return res.status(500).json({
      code: 500,
      data: null,
      message: error.message || 'Failed to retrieve history usage',
      error: 'INTERNAL_ERROR',
    });
  }
});

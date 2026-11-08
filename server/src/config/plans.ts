/**
 * Single source of truth for subscription plans: price, monthly credit grant,
 * Stripe price mapping and per-day AI usage caps. Keep the ids in sync with
 * client/src/pages/settings/tabs/BillingTab.vue.
 */
export type PlanId = 'free' | 'creator' | 'studio' | 'enterprise';
export type AiKind = 'TEXT' | 'IMAGE' | 'VIDEO' | 'MUSIC' | 'VOICE';

export interface PlanDefinition {
  id: PlanId;
  /** Value stored on UserEntity.tier */
  tier: 'FREE' | 'CREATOR' | 'STUDIO' | 'ENTERPRISE';
  priceUsd: number;
  monthlyCredits: number;
  /** Env var holding the Stripe recurring Price id (price_...) for this plan */
  stripePriceEnv?: string;
  /** Max AI calls per user per UTC day, by kind (-1 = unlimited) */
  dailyAiLimits: Record<AiKind, number>;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    tier: 'FREE',
    priceUsd: 0,
    monthlyCredits: 100,
    dailyAiLimits: { TEXT: 100, IMAGE: 20, VIDEO: 3, MUSIC: 3, VOICE: 30 },
    features: ['series.create', 'script.generate'],
  },
  creator: {
    id: 'creator',
    tier: 'CREATOR',
    priceUsd: 29,
    monthlyCredits: 1000,
    stripePriceEnv: 'STRIPE_PRICE_CREATOR',
    dailyAiLimits: { TEXT: 1000, IMAGE: 200, VIDEO: 30, MUSIC: 30, VOICE: 300 },
    features: ['series.create', 'script.generate', 'voice.tts', 'publish.single', 'publish.multi', 'cover.generate'],
  },
  studio: {
    id: 'studio',
    tier: 'STUDIO',
    priceUsd: 99,
    monthlyCredits: 5000,
    stripePriceEnv: 'STRIPE_PRICE_STUDIO',
    dailyAiLimits: { TEXT: 5000, IMAGE: 1000, VIDEO: 150, MUSIC: 150, VOICE: 1500 },
    features: ['series.create', 'script.generate', 'voice.tts', 'publish.single', 'publish.multi', 'cover.generate', 'persona.advanced', 'marketplace.purchase'],
  },
  enterprise: {
    id: 'enterprise',
    tier: 'ENTERPRISE',
    priceUsd: 299,
    monthlyCredits: 20000,
    stripePriceEnv: 'STRIPE_PRICE_ENTERPRISE',
    dailyAiLimits: { TEXT: -1, IMAGE: 5000, VIDEO: 600, MUSIC: 600, VOICE: -1 },
    features: ['*'],
  },
};

/** Maps any stored/legacy tier string ('PRO', 'creator', 'FREE', ...) to a plan. */
export function getPlan(rawTier: string | undefined | null): PlanDefinition {
  const t = String(rawTier || 'free').toLowerCase();
  if (t === 'pro') return PLANS.creator; // legacy name
  return (PLANS as Record<string, PlanDefinition>)[t] || PLANS.free;
}

export function getStripePriceId(plan: PlanDefinition): string | undefined {
  return plan.stripePriceEnv ? process.env[plan.stripePriceEnv] || undefined : undefined;
}

/** Reverse lookup: Stripe price id → plan (used by subscription webhooks). */
export function getPlanByStripePrice(priceId: string | undefined | null): PlanDefinition | undefined {
  if (!priceId) return undefined;
  return Object.values(PLANS).find((p) => getStripePriceId(p) === priceId);
}

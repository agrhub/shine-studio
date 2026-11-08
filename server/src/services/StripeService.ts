import Stripe from 'stripe';
import { getDatabaseProvider } from '@/database/index.js';
import { EnvConfig } from '@/config/env.js';
import { Logger } from '@/utils/logger.js';
import { PLANS, PlanDefinition, getPlan, getPlanByStripePrice, getStripePriceId } from '@/config/plans.js';

export class BillingNotConfiguredError extends Error {
  status = 503;
  constructor(message = 'Stripe is not configured on this server (STRIPE_SECRET_KEY missing).') {
    super(message);
  }
}

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new BillingNotConfiguredError();
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

const customerKey = (customerId: string) => `stripe_customer_${customerId}`;
const eventKey = (eventId: string) => `stripe_event_${eventId}`;

/** Creates a Stripe Checkout Session for a paid plan. */
export async function createCheckoutSession(params: {
  userId: string;
  email?: string;
  planId: string;
}): Promise<{ id: string; url: string }> {
  const plan = getPlan(params.planId);
  if (plan.id === 'free') throw Object.assign(new Error('The free plan does not require checkout'), { status: 400 });

  const priceId = getStripePriceId(plan);
  if (!priceId) {
    throw new BillingNotConfiguredError(`No Stripe price configured for plan "${plan.id}" (${plan.stripePriceEnv}).`);
  }

  const appUrl = EnvConfig.appUrl.replace(/\/+$/, '');
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: params.userId,
    customer_email: params.email,
    metadata: { userId: params.userId, planId: plan.id },
    subscription_data: { metadata: { userId: params.userId, planId: plan.id } },
    success_url: `${appUrl}/settings?tab=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/settings?tab=billing&checkout=cancelled`,
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { id: session.id, url: session.url };
}

/**
 * Verifies the `Stripe-Signature` header against the raw request body.
 * Throws if the signature, timestamp tolerance or secret is wrong.
 */
export function constructWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new BillingNotConfiguredError('STRIPE_WEBHOOK_SECRET is not configured.');
  if (!signature) throw Object.assign(new Error('Missing Stripe-Signature header'), { status: 400 });
  // constructEvent only needs the secret, but the SDK requires an instance.
  const stripe = stripeClient || new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unused_for_signature_checks');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

async function resolveUserId(opts: { metadataUserId?: string | null; customerId?: string | null }): Promise<string | null> {
  if (opts.metadataUserId) return opts.metadataUserId;
  if (!opts.customerId) return null;
  const db = await getDatabaseProvider();
  const mapping = await db.getSystemSetting<{ userId: string }>(customerKey(opts.customerId));
  return mapping?.userId || null;
}

async function applyPlan(userId: string, plan: PlanDefinition, extra: Record<string, unknown> = {}) {
  const db = await getDatabaseProvider();
  const user = await db.getUserById(userId);
  if (!user) {
    Logger.warn(`[Stripe] User ${userId} not found while applying plan ${plan.id}`);
    return;
  }
  await db.updateUser({ ...user, tier: plan.tier, ...extra } as any);
  Logger.info(`[Stripe] User ${userId} → plan ${plan.id}`);
}

async function grantCredits(userId: string, plan: PlanDefinition, reason: string) {
  if (plan.monthlyCredits <= 0) return;
  const db = await getDatabaseProvider();
  await db.refundCredits(userId, plan.monthlyCredits, 'Subscription Credits', `${reason}: ${plan.id} (+${plan.monthlyCredits})`);
}

function planFromSubscription(sub: Stripe.Subscription): PlanDefinition | undefined {
  const priceId = sub.items?.data?.[0]?.price?.id;
  return getPlanByStripePrice(priceId) || (sub.metadata?.planId ? getPlan(sub.metadata.planId) : undefined);
}

/**
 * Applies a verified Stripe event. Idempotent: each event id is processed once
 * (Stripe retries deliveries and may send duplicates).
 * Returns false when the event was already handled.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<boolean> {
  const db = await getDatabaseProvider();
  if (await db.getSystemSetting(eventKey(event.id))) return false;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') break;

      const userId = await resolveUserId({
        metadataUserId: session.metadata?.userId || session.client_reference_id,
        customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      });
      const plan = getPlan(session.metadata?.planId);
      if (!userId || plan.id === 'free') {
        Logger.warn(`[Stripe] checkout.session.completed ${session.id} without user/plan metadata`);
        break;
      }

      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (customerId) await db.saveSystemSetting(customerKey(customerId), { userId });

      await applyPlan(userId, plan, { stripe_customer_id: customerId, stripe_subscription_id: subscriptionId });
      await grantCredits(userId, plan, 'Plan purchase');
      break;
    }

    case 'invoice.paid': {
      // Monthly renewals refill credits. The first invoice is covered by checkout.session.completed.
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== 'subscription_cycle') break;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const userId = await resolveUserId({ customerId });
      if (!userId) break;
      const user = await db.getUserById(userId);
      const plan = getPlan(user?.tier);
      if (plan.id !== 'free') await grantCredits(userId, plan, 'Monthly renewal');
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId({
        metadataUserId: sub.metadata?.userId,
        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      });
      if (!userId) break;
      if (['active', 'trialing'].includes(sub.status)) {
        const plan = planFromSubscription(sub);
        if (plan) await applyPlan(userId, plan, { stripe_subscription_id: sub.id });
      } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
        await applyPlan(userId, PLANS.free);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId({
        metadataUserId: sub.metadata?.userId,
        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      });
      if (userId) await applyPlan(userId, PLANS.free, { stripe_subscription_id: null });
      break;
    }

    default:
      // Unhandled event types are acknowledged so Stripe stops retrying them.
      break;
  }

  await db.saveSystemSetting(eventKey(event.id), { type: event.type, processed_at: new Date().toISOString() });
  return true;
}

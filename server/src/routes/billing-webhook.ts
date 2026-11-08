import express, { Router, Request, Response } from 'express';
import { constructWebhookEvent, handleStripeEvent } from '@/services/StripeService.js';
import { Logger } from '@/utils/logger.js';

/**
 * POST /api/billing/webhook — Stripe webhook endpoint.
 *
 * Must be mounted BEFORE express.json(): signature verification needs the exact
 * raw bytes Stripe sent. Public (Stripe has no user token); authenticity comes
 * from the `Stripe-Signature` HMAC checked against STRIPE_WEBHOOK_SECRET.
 */
export const billingWebhookRouter = Router();

billingWebhookRouter.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req: Request, res: Response) => {
  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    event = constructWebhookEvent(raw, req.header('stripe-signature'));
  } catch (err: any) {
    const status = err?.status || 400;
    Logger.warn(`[Stripe] Webhook rejected: ${err?.message}`);
    return res.status(status).json({ received: false, error: status === 503 ? err.message : 'Invalid signature' });
  }

  try {
    const processed = await handleStripeEvent(event);
    return res.json({ received: true, type: event.type, duplicate: !processed });
  } catch (err: any) {
    // 5xx makes Stripe retry later, which is what we want for transient failures.
    Logger.error(`[Stripe] Failed to handle ${event.type} (${event.id}): ${err?.message}`);
    return res.status(500).json({ received: false, error: 'Webhook handler failed' });
  }
});

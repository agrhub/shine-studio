import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Stripe from 'stripe';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-billing-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.STRIPE_PRICE_CREATOR = 'price_creator_123';

const { getDatabaseProvider } = await import('../src/database/index.js');
const { constructWebhookEvent, handleStripeEvent } = await import('../src/services/StripeService.js');

const stripe = new Stripe('sk_test_dummy');
let db: Awaited<ReturnType<typeof getDatabaseProvider>>;

function signed(payload: object, secret = process.env.STRIPE_WEBHOOK_SECRET!) {
  const body = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return { raw: Buffer.from(body), header };
}

async function makeUser(id: string, tier: string, credits: number) {
  await db.createUser({ id, email: `${id}@test.io`, password_hash: 'x', name: id, role: 'user', tier, credits } as any);
}

before(async () => {
  db = await getDatabaseProvider();
});

test('webhook rejects bad / missing signatures', () => {
  const evt = { id: 'evt_bad', type: 'checkout.session.completed', data: { object: {} } };
  const { raw } = signed(evt);
  const forged = signed(evt, 'whsec_attacker');
  assert.throws(() => constructWebhookEvent(raw, undefined));
  assert.throws(() => constructWebhookEvent(raw, forged.header));
  const tampered = signed(evt);
  assert.throws(() => constructWebhookEvent(Buffer.from(tampered.raw.toString().replace('evt_bad', 'evt_evil')), tampered.header));
});

test('checkout.session.completed upgrades plan and grants credits exactly once', async () => {
  await makeUser('usr_buyer', 'FREE', 5);
  const evt = {
    id: 'evt_checkout_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1', object: 'checkout.session', payment_status: 'paid',
        client_reference_id: 'usr_buyer', customer: 'cus_1', subscription: 'sub_1',
        metadata: { userId: 'usr_buyer', planId: 'creator' },
      },
    },
  };
  const { raw, header } = signed(evt);
  const event = constructWebhookEvent(raw, header);

  assert.equal(await handleStripeEvent(event), true);
  let user: any = await db.getUserById('usr_buyer');
  assert.equal(user.tier, 'CREATOR');
  assert.equal(user.credits, 1005);
  assert.equal(user.stripe_customer_id, 'cus_1');

  // Stripe retries / duplicate delivery must not grant credits twice
  assert.equal(await handleStripeEvent(event), false);
  user = await db.getUserById('usr_buyer');
  assert.equal(user.credits, 1005);
});

test('renewal refills credits; cancellation downgrades to free', async () => {
  const renewal = constructWebhookEvent(...Object.values(signed({
    id: 'evt_renew_1', object: 'event', type: 'invoice.paid',
    data: { object: { id: 'in_1', object: 'invoice', billing_reason: 'subscription_cycle', customer: 'cus_1' } },
  })) as [Buffer, string]);
  await handleStripeEvent(renewal);
  assert.equal(((await db.getUserById('usr_buyer')) as any).credits, 2005);

  const cancel = constructWebhookEvent(...Object.values(signed({
    id: 'evt_cancel_1', object: 'event', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'canceled', metadata: {} } },
  })) as [Buffer, string]);
  await handleStripeEvent(cancel);
  const user: any = await db.getUserById('usr_buyer');
  assert.equal(user.tier, 'FREE');
  assert.equal(user.credits, 2005, 'already-granted credits are kept');
});

test('unpaid checkout sessions do not upgrade', async () => {
  await makeUser('usr_unpaid', 'FREE', 0);
  const evt = constructWebhookEvent(...Object.values(signed({
    id: 'evt_unpaid', object: 'event', type: 'checkout.session.completed',
    data: { object: { id: 'cs_2', object: 'checkout.session', payment_status: 'unpaid', customer: 'cus_2', metadata: { userId: 'usr_unpaid', planId: 'studio' } } },
  })) as [Buffer, string]);
  await handleStripeEvent(evt);
  assert.equal(((await db.getUserById('usr_unpaid')) as any).tier, 'FREE');
});

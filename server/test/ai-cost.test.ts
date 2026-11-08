import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-ai-cost-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { getDatabaseProvider } = await import('../src/database/index.js');
const { aiUsageGuard, runWithAiContext, AiLimitError } = await import('../src/services/ai/AiUsageGuard.js');

let db: Awaited<ReturnType<typeof getDatabaseProvider>>;

async function makeUser(id: string, tier: string, credits: number) {
  await db.createUser({ id, email: `${id}@test.io`, password_hash: 'x', name: id, role: 'user', tier, credits } as any);
}

before(async () => {
  db = await getDatabaseProvider();
});

async function expectLimit(fn: () => Promise<unknown>, status: number, code: string) {
  await assert.rejects(fn, (err: any) => err instanceof AiLimitError && err.status === status && err.code === code);
}

test('AI guard: per-plan daily caps, credits, admin bypass', async () => {
  aiUsageGuard.resetForTests();
  await aiUsageGuard.saveGuardrails({ dailyBudgetUsd: 0, aiDisabled: false }); // unlimited budget for this test
  await makeUser('usr_free', 'FREE', 50);
  await makeUser('usr_broke', 'FREE', 0);

  await runWithAiContext({ userId: 'usr_free', role: 'user' }, async () => {
    for (let i = 0; i < 3; i++) await aiUsageGuard.track('VIDEO', async () => 'ok'); // free plan: 3 videos/day
    await expectLimit(() => aiUsageGuard.track('VIDEO', async () => 'ok'), 429, 'AI_USER_DAILY_LIMIT');
    await aiUsageGuard.track('TEXT', async () => 'ok'); // other kinds still allowed
  });

  await runWithAiContext({ userId: 'usr_free', role: 'user' }, async () => {
    // A failed provider call is not counted against the user
    await assert.rejects(aiUsageGuard.track('IMAGE', async () => { throw new Error('provider down'); }));
    assert.equal((await aiUsageGuard.getUsage()).users['usr_free'].IMAGE, 0);
  });

  await runWithAiContext({ userId: 'usr_broke', role: 'user' }, () =>
    expectLimit(() => aiUsageGuard.track('TEXT', async () => 'ok'), 402, 'INSUFFICIENT_CREDITS')
  );

  await runWithAiContext({ userId: 'usr_admin', role: 'admin' }, async () => {
    for (let i = 0; i < 5; i++) await aiUsageGuard.track('VIDEO', async () => 'ok');
  });
});

test('AI guard: global daily budget and kill switch', async () => {
  aiUsageGuard.resetForTests();
  await makeUser('usr_budget', 'ENTERPRISE', 100000);
  await aiUsageGuard.saveGuardrails({ dailyBudgetUsd: 1, unitCostUsd: { VIDEO: 0.5 } as any });

  await runWithAiContext({ userId: 'usr_budget', role: 'user' }, async () => {
    const before = (await aiUsageGuard.getUsage()).spendUsd;
    // Spend up to the $1 budget (some may already be used by earlier tests today)
    let blocked = false;
    for (let i = 0; i < 10 && !blocked; i++) {
      try { await aiUsageGuard.track('VIDEO', async () => 'ok'); } catch (e: any) { blocked = e.code === 'AI_DAILY_BUDGET_EXCEEDED'; }
    }
    assert.ok(blocked, `budget should block (spent ${before} → ${(await aiUsageGuard.getUsage()).spendUsd})`);
    assert.ok((await aiUsageGuard.getUsage()).spendUsd <= 1);
    await expectLimit(() => aiUsageGuard.assertAllowed(), 429, 'AI_DAILY_BUDGET_EXCEEDED');
  });

  await aiUsageGuard.saveGuardrails({ dailyBudgetUsd: 0, aiDisabled: true });
  await runWithAiContext({ userId: 'usr_budget', role: 'user' }, () =>
    expectLimit(() => aiUsageGuard.track('TEXT', async () => 'ok'), 503, 'AI_DISABLED')
  );
  await runWithAiContext({ userId: 'usr_admin', role: 'admin' }, () => aiUsageGuard.track('TEXT', async () => 'ok'));
  await aiUsageGuard.saveGuardrails({ aiDisabled: false });
});

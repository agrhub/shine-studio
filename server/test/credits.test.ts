import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-credits-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { getDatabaseProvider } = await import('../src/database/index.js');
const { CreditService } = await import('../src/services/CreditService.js');
const { invalidateStudioConfig } = await import('../src/services/StudioConfigCache.js');

test('admin-configured credit rates (studio_config) are applied', async () => {
  const db = await getDatabaseProvider();
  await db.createUser({ id: 'usr_c', email: 'c@test.io', password_hash: 'x', name: 'c', role: 'user', tier: 'FREE', credits: 100 } as any);

  assert.equal(await CreditService.getRate('videoRender'), 30, 'default rate');

  await db.saveSystemSetting('studio_config', { creditRates: { videoRender: 7 } });
  invalidateStudioConfig(); // what the admin save route does
  assert.equal(await CreditService.getRate('videoRender'), 7);
  assert.equal(await CreditService.getRate('sceneImage'), 15, 'unset keys keep defaults');

  const res = await CreditService.deductUserCredits('usr_c', 'videoRender', 'Test', 'rate check');
  assert.equal(res.success, true);
  assert.equal(res.balance, 93);

  await db.saveSystemSetting('studio_config', { creditRates: { videoRender: -5 } });
  invalidateStudioConfig();
  assert.equal(await CreditService.getRate('videoRender'), 30, 'invalid configured rate falls back');
});

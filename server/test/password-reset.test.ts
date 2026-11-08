import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-reset-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { getDatabaseProvider } = await import('../src/database/index.js');
const { default: authRoutes } = await import('../src/routes/auth.js');
const { verifyAccessToken } = await import('../src/utils/token.js');

// Mirrors the token the forgot-password route emails (purpose + password fingerprint).
const resetTokenFor = (userId: string, hash: string) =>
  jwt.sign(
    { purpose: 'password_reset', userId, fp: crypto.createHash('sha256').update(hash).digest('hex').slice(0, 24) },
    process.env.JWT_SECRET!,
    { expiresIn: '30m' }
  );

test('password reset: generic response, single-use token, new password works', async () => {
  const db = await getDatabaseProvider();
  const hash = await bcrypt.hash('old-password', 10);
  await db.createUser({ id: 'usr_r', email: 'Reset@Test.io', password_hash: hash, name: 'R', role: 'user', tier: 'FREE', credits: 1 } as any);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/auth`;
  const post = (p: string, body: object) =>
    fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  try {
    // Same answer for existing and unknown accounts (no enumeration)
    const known = await (await post('/forgot-password', { email: 'Reset@Test.io' })).json();
    const unknown = await (await post('/forgot-password', { email: 'nobody@test.io' })).json();
    assert.equal(known.message, unknown.message);

    const token = resetTokenFor('usr_r', hash);
    assert.equal(verifyAccessToken(token), null, 'reset token is not a login session');

    assert.equal((await post('/reset-password', { token, newPassword: '123' })).status, 400, 'too short');
    assert.equal((await post('/reset-password', { token: 'garbage', newPassword: 'new-password' })).status, 400);

    const ok = await post('/reset-password', { token, newPassword: 'new-password' });
    assert.equal(ok.status, 200);
    const user: any = await db.getUserById('usr_r');
    assert.ok(await bcrypt.compare('new-password', user.password_hash));

    const reuse = await post('/reset-password', { token, newPassword: 'another-password' });
    assert.equal(reuse.status, 400, 'token is single-use');
    assert.match((await reuse.json()).error, /already been used/);
  } finally {
    server.close();
  }
});

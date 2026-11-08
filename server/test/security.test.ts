import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';
process.env.INTERNAL_API_SECRET = 'test_internal_secret_value_0123456789abcdef';

const { verifyAccessToken, safeEqual } = await import('../src/utils/token.js');
const { resolveWithin } = await import('../src/services/storage/LocalStorageAdapter.js');
const { requireAuth, requireAdmin, requireInternalOrAdmin } = await import('../src/middleware/RequireAuth.js');
const { escapeHtml, toScriptJson } = await import('../src/utils/html.js');
const { rateLimit } = await import('../src/middleware/Security.js');

const sign = (payload: object) => jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '5m' });

test('access tokens are accepted, purpose-specific tokens are rejected', () => {
  assert.equal(verifyAccessToken(sign({ userId: 'u1', email: 'a@b.c', role: 'Admin' }))?.role, 'admin');
  assert.equal(verifyAccessToken(sign({ userId: 'u1', temp2fa: true })), null, 'pre-2FA token must not log in');
  assert.equal(verifyAccessToken(sign({ signupId: 's', email: 'a@b.c', tempSignup: true })), null);
  assert.equal(verifyAccessToken(sign({ userId: 'u1', provider: 'youtube' })), null, 'OAuth state must not log in');
  assert.equal(verifyAccessToken(sign({ purpose: 'antigravity_oauth', userId: 'u1' })), null);
  assert.equal(verifyAccessToken(jwt.sign({ userId: 'u1' }, 'some-other-secret-xxxxxxxxxxxxxxxxxxxx')), null);
  assert.equal(verifyAccessToken('garbage'), null);
});

test('safeEqual compares secrets exactly', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('resolveWithin blocks path traversal', () => {
  const base = path.join(os.tmpdir(), 'shine-uploads');
  assert.equal(resolveWithin(base, 'images/a.png'), path.join(base, 'images/a.png'));
  assert.equal(resolveWithin(base, '/images/a.png'), path.join(base, 'images/a.png'));
  assert.equal(resolveWithin(base, '../.env'), null);
  assert.equal(resolveWithin(base, 'images/../../etc/passwd'), null);
  assert.equal(resolveWithin(base, '..\\..\\x'.replace(/\\/g, path.sep)), null);
  assert.equal(resolveWithin(base, 'a\0b'), null);
  assert.equal(resolveWithin(path.join(os.tmpdir(), 'shine'), '../shine-evil/x'), null, 'sibling prefix must not match');
});

test('escapeHtml / toScriptJson neutralise markup', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  const json = toScriptJson({ e: '</script><script>alert(1)</script>' });
  assert.ok(!json.includes('</script>'));
  assert.deepEqual(JSON.parse(json), { e: '</script><script>alert(1)</script>' });
});

async function withServer(app: express.Express, fn: (base: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as any;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test('requireAuth / requireAdmin / requireInternalOrAdmin', async () => {
  const app = express();
  app.get('/user', requireAuth, (req, res) => res.json((req as any).user));
  app.get('/admin', requireAuth, requireAdmin, (_req, res) => res.json({ ok: true }));
  app.post('/internal', requireInternalOrAdmin, (req, res) => res.json({ role: (req as any).user.role }));

  await withServer(app, async (base) => {
    const user = sign({ userId: 'u1', role: 'user' });
    const admin = sign({ userId: 'a1', role: 'admin' });
    const temp2fa = sign({ userId: 'a1', temp2fa: true });
    const h = (t: string) => ({ Authorization: `Bearer ${t}` });

    assert.equal((await fetch(`${base}/user`)).status, 401);
    assert.equal((await fetch(`${base}/user`, { headers: h(temp2fa) })).status, 401);
    assert.equal((await fetch(`${base}/user`, { headers: h(user) })).status, 200);
    assert.equal((await fetch(`${base}/admin`, { headers: h(user) })).status, 403);
    assert.equal((await fetch(`${base}/admin`, { headers: h(admin) })).status, 200);

    assert.equal((await fetch(`${base}/internal`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/internal`, { method: 'POST', headers: { 'X-Internal-Secret': 'wrong' } })).status, 401);
    const ok = await fetch(`${base}/internal`, { method: 'POST', headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET! } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).role, 'system');
    assert.equal((await fetch(`${base}/internal`, { method: 'POST', headers: h(user) })).status, 403);
    assert.equal((await fetch(`${base}/internal`, { method: 'POST', headers: h(admin) })).status, 200);
  });
});

test('rateLimit returns 429 after the limit', async () => {
  const app = express();
  app.post('/login', rateLimit({ windowMs: 60_000, max: 3 }), (_req, res) => res.json({ ok: true }));
  await withServer(app, async (base) => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch(`${base}/login`, { method: 'POST' })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  });
});

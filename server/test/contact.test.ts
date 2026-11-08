import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-contact-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { default: contactRoutes } = await import('../src/routes/contact.js');
const { emailService } = await import('../src/services/EmailService.js');

const sent: any[] = [];
(emailService as any).sendContactInquiry = async (i: any) => { sent.push(i); };

test('contact form: validates, stores, notifies admin; tickets are admin-only', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/contact', contactRoutes);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/contact`;
  const post = (body: object) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const token = (role: string) => jwt.sign({ userId: `u_${role}`, role }, process.env.JWT_SECRET!);

  try {
    const bad = await post({ name: 'A', email: 'not-an-email', message: 'short' });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).message, /valid email/);

    const bot = await post({ name: 'Bot', email: 'b@x.io', message: 'Buy cheap followers now!!!', website: 'http://spam' });
    assert.equal(bot.status, 201, 'honeypot pretends success');
    assert.equal(sent.length, 0, 'bot messages are not stored or emailed');

    const ok = await post({ name: 'Lan', email: 'lan@studio.vn', subject: 'Pricing', message: 'Do you offer an annual plan for teams?', category: 'billing' });
    assert.equal(ok.status, 201);
    const { ticket_id } = await ok.json();
    assert.match(ticket_id, /^ticket_/);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].category, 'BILLING');

    assert.equal((await fetch(`${base}/tickets`)).status, 401, 'no longer public');
    assert.equal((await fetch(`${base}/tickets`, { headers: { Authorization: `Bearer ${token('user')}` } })).status, 403);
    const list = await (await fetch(`${base}/tickets`, { headers: { Authorization: `Bearer ${token('admin')}` } })).json();
    assert.equal(list.count, 1);
    assert.equal(list.tickets[0].id, ticket_id);
    assert.equal(list.tickets[0].email, 'lan@studio.vn');
  } finally {
    server.close();
  }
});

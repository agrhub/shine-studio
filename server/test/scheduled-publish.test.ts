import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-schedule-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { schedulePublication, runDuePublications, listScheduledPublications } = await import('../src/services/ScheduledPublishService.js');
const { getDatabaseProvider } = await import('../src/database/index.js');
const { PipelineJobService } = await import('../src/services/PipelineJobService.js');

const body = (minutes: number, extra: object = {}) => ({
  episodeId: 'ep_1', seriesId: 'ser_1', platforms: ['youtube'], title: 'EP1',
  scheduledTime: new Date(Date.now() + minutes * 60_000).toISOString(), ...extra,
});

test('schedulePublication validates the time and stores a queued job', async () => {
  await assert.rejects(schedulePublication('u1', body(-5)), /at least one minute in the future/);
  await assert.rejects(schedulePublication('u1', { ...body(10), scheduledTime: 'nope' }), /valid date/);
  await assert.rejects(schedulePublication('u1', { ...body(10), platforms: [] }), /platform/);
  const job = await schedulePublication('u1', body(10));
  assert.equal(job.status, 'queued');
  assert.equal(job.type, 'publish_schedule');
  assert.equal((await listScheduledPublications('u1')).length, 1);
});

test('runDuePublications publishes due jobs only, respecting cancel / failure / missed window', async () => {
  const db = await getDatabaseProvider();
  const calls: any[] = [];
  const startPublish = async (userId: string, req: any) => {
    calls.push({ userId, req });
    return req.title === 'reject'
      ? { status: 400, payload: { message: 'Missing OAuth credentials' } }
      : { status: 200, payload: { data: { id: `pub_${req.title}` } } };
  };

  const due = await schedulePublication('u2', body(3, { title: 'due' }));
  const future = await schedulePublication('u2', body(120, { title: 'future' }));
  const cancelled = await schedulePublication('u2', body(2, { title: 'cancelled' }));
  const rejected = await schedulePublication('u2', body(2, { title: 'reject' }));
  const stale = await schedulePublication('u2', body(2, { title: 'stale' }));
  await PipelineJobService.cancelJob(cancelled.id);
  // simulate a schedule that was due 2 days ago (server was down)
  await db.updatePipelineJob(stale.id, { outputs: { ...stale.outputs, scheduled_at: new Date(Date.now() - 2 * 86_400_000).toISOString() } } as any);

  const result = await runDuePublications(startPublish, new Date(Date.now() + 5 * 60_000));
  assert.deepEqual(result, { started: 1, failed: 2 });
  // 'reject' is scheduled at +2 min and 'due' at +3 min: published in scheduled order
  assert.deepEqual(calls.map((c) => c.req.title), ['reject', 'due']);
  assert.equal(calls.find((c) => c.req.title === 'due').userId, 'u2');

  const get = (id: string) => db.getPipelineJobById(id);
  assert.equal((await get(due.id))!.status, 'completed');
  assert.equal((await get(due.id))!.outputs!.publish_job_id, 'pub_due');
  assert.equal((await get(future.id))!.status, 'queued');
  assert.equal((await get(cancelled.id))!.status, 'cancelled');
  assert.equal((await get(rejected.id))!.status, 'failed');
  assert.match(String((await get(rejected.id))!.error), /OAuth/);
  assert.equal((await get(stale.id))!.status, 'failed');

  // Running again does not republish anything
  const again = await runDuePublications(startPublish, new Date(Date.now() + 5 * 60_000));
  assert.deepEqual(again, { started: 0, failed: 0 });
});

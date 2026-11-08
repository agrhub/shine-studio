import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-team-'));
process.env.DB_PROVIDER = 'mapdb';
process.env.MAPDB_PATH = path.join(tmp, 'mapdb.json');
process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { getDatabaseProvider } = await import('../src/database/index.js');
const { emailService } = await import('../src/services/EmailService.js');
const { listTeam, inviteMember, removeMember, applyTeamInvitation } = await import('../src/services/TeamService.js');

const invites: any[] = [];
(emailService as any).sendTeamInvitation = async (...args: any[]) => { invites.push(args); };

const mkUser = (id: string, email: string, role: string) =>
  ({ id, email, name: id, password_hash: 'x', role, tier: 'FREE', credits: 0, created_at: '2026-11-01T00:00:00Z' }) as any;

test('team: only staff are listed, with real series counts', async () => {
  const db = await getDatabaseProvider();
  await db.createUser(mkUser('u_owner', 'owner@shine.io', 'owner'));
  await db.createUser(mkUser('u_admin', 'admin@shine.io', 'admin'));
  await db.createUser(mkUser('u_cust', 'customer@shine.io', 'user'));
  await db.createSeries({ id: 's1', user_id: 'u_admin', title: 'A', status: 'ACTIVE' } as any);
  await db.createSeries({ id: 's2', user_id: 'u_admin', title: 'B', status: 'ACTIVE' } as any);

  const team = await listTeam();
  assert.deepEqual(team.map((m) => m.email), ['owner@shine.io', 'admin@shine.io'], 'customers are not team members');
  assert.equal(team.find((m) => m.id === 'u_admin')!.sharedProjectsCount, 2);
});

test('team: inviting an existing account assigns the role; a new email gets a pending invitation', async () => {
  const actor = { id: 'u_owner', name: 'Owner' };
  const promoted = await inviteMember(actor, 'Customer@Shine.io', 'Editor');
  assert.equal(promoted.status, 'active');
  assert.equal(promoted.role, 'Editor');
  assert.equal((await (await getDatabaseProvider()).getUserById('u_cust'))!.role, 'editor');

  const invited = await inviteMember(actor, 'new.hire@shine.io', 'viewer');
  assert.equal(invited.status, 'invited');
  assert.equal(invites.length, 1, 'invitation email sent');
  assert.ok((await listTeam()).some((m) => m.email === 'new.hire@shine.io' && m.status === 'invited'));

  await assert.rejects(inviteMember(actor, 'owner@shine.io', 'viewer'), /cannot change your own role/);
  await assert.rejects(inviteMember({ id: 'u_admin' }, 'owner@shine.io', 'viewer'), /owner's role cannot be changed/);
  await assert.rejects(inviteMember(actor, 'x@shine.io', 'owner'), /Role must be one of/);
  await assert.rejects(inviteMember(actor, 'not-an-email', 'editor'), /valid email/);
});

test('team: invitation is applied when that email signs up', async () => {
  const db = await getDatabaseProvider();
  const created = await db.createUser(mkUser('u_new', 'new.hire@shine.io', 'user'));
  const applied = await applyTeamInvitation(created);
  assert.equal(applied.role, 'viewer');
  assert.ok(!(await listTeam()).some((m) => m.status === 'invited'), 'invitation no longer pending');
  // a second signup for another email is unaffected
  const other = await applyTeamInvitation(await db.createUser(mkUser('u_other', 'other@shine.io', 'user')));
  assert.equal(other.role, 'user');
});

test('team: removal revokes the role, keeps the account, and protects owner/self', async () => {
  const db = await getDatabaseProvider();
  await removeMember({ id: 'u_owner' }, 'u_cust');
  const user = await db.getUserById('u_cust');
  assert.ok(user, 'account kept');
  assert.equal(user!.role, 'user');
  await assert.rejects(removeMember({ id: 'u_admin' }, 'u_owner'), /owner cannot be removed/);
  await assert.rejects(removeMember({ id: 'u_admin' }, 'u_admin'), /cannot remove yourself/);
  await assert.rejects(removeMember({ id: 'u_owner' }, 'u_cust'), /not found/);

  const inv = await inviteMember({ id: 'u_owner' }, 'later@shine.io', 'editor');
  await removeMember({ id: 'u_owner' }, inv.id);
  assert.ok(!(await listTeam()).some((m) => m.email === 'later@shine.io'), 'cancelled invitation disappears');
});

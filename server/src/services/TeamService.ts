import { nanoid } from 'nanoid';
import { getDatabaseProvider } from '@/database/index.js';
import { emailService } from '@/services/EmailService.js';
import { EnvConfig } from '@/config/env.js';
import { Logger } from '@/utils/logger.js';
import type { UserEntity } from '@/types.js';

/**
 * Studio team management. Team members are accounts holding a staff role
 * (owner / admin / editor / viewer) on `user.role`; regular customers have
 * "user". Removing a member revokes the role — it never deletes the account.
 * Inviting an email without an account creates a pending invitation that is
 * applied when that email signs up.
 *
 * Note: only owner/admin grant access to the admin API today (requireAdmin);
 * editor/viewer are recorded roles without extra permissions yet. A role
 * change takes effect at the member's next login (the JWT carries the role).
 */

export const TEAM_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
const ASSIGNABLE: TeamRole[] = ['admin', 'editor', 'viewer'];
const INVITES_KEY = 'team_invitations';
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  invited_by: string;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'revoked';
}

export interface TeamMemberView {
  id: string;
  name: string;
  email: string;
  role: string; // display form: "Owner", "Admin", ...
  status: 'active' | 'invited';
  avatar: string;
  sharedProjectsCount: number;
  joinedAt: string;
}

const display = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
const avatarFor = (email: string) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`;
const isTeamRole = (role: unknown): role is TeamRole => TEAM_ROLES.includes(String(role || '').toLowerCase() as TeamRole);

export class TeamError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function loadInvitations(): Promise<TeamInvitation[]> {
  const db = await getDatabaseProvider();
  return (await db.getSystemSetting<TeamInvitation[]>(INVITES_KEY)) || [];
}

async function saveInvitations(list: TeamInvitation[]) {
  const db = await getDatabaseProvider();
  await db.saveSystemSetting(INVITES_KEY, list.slice(0, 500));
}

const isLive = (inv: TeamInvitation, now = Date.now()) => inv.status === 'pending' && new Date(inv.expires_at).getTime() > now;

export async function listTeam(): Promise<TeamMemberView[]> {
  const db = await getDatabaseProvider();
  const { users } = await db.getUsers({ limit: 10000 });
  const staff = users.filter((u) => isTeamRole(u.role));
  const counts = await Promise.all(staff.map((u) => db.getSeriesList(u.id).then((s) => s.length).catch(() => 0)));

  const members: TeamMemberView[] = staff.map((u, i) => ({
    id: u.id,
    name: u.name || u.email.split('@')[0],
    email: u.email,
    role: display(String(u.role).toLowerCase()),
    status: 'active',
    avatar: (u as any).avatar || avatarFor(u.email),
    sharedProjectsCount: counts[i],
    joinedAt: u.created_at ? u.created_at.slice(0, 10) : '',
  }));

  const invited: TeamMemberView[] = (await loadInvitations()).filter((inv) => isLive(inv)).map((inv) => ({
    id: inv.id,
    name: inv.email.split('@')[0],
    email: inv.email,
    role: display(inv.role),
    status: 'invited',
    avatar: avatarFor(inv.email),
    sharedProjectsCount: 0,
    joinedAt: inv.created_at.slice(0, 10),
  }));

  const order: Record<string, number> = { Owner: 0, Admin: 1, Editor: 2, Viewer: 3 };
  return [...members, ...invited].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.email.localeCompare(b.email));
}

export async function inviteMember(actor: { id: string; name?: string }, emailInput: string, roleInput: string): Promise<TeamMemberView> {
  const email = String(emailInput || '').trim().toLowerCase();
  const role = String(roleInput || 'editor').trim().toLowerCase() as TeamRole;
  if (!EMAIL_RE.test(email)) throw new TeamError('A valid email address is required.');
  if (!ASSIGNABLE.includes(role)) throw new TeamError(`Role must be one of: ${ASSIGNABLE.map(display).join(', ')}.`);

  const db = await getDatabaseProvider();
  const existing = (await db.getUserByEmail(email)) || (await db.getUserByEmail(emailInput.trim()));
  if (existing) {
    if (existing.id === actor.id) throw new TeamError('You cannot change your own role.');
    if (String(existing.role).toLowerCase() === 'owner') throw new TeamError("The owner's role cannot be changed here.");
    const updated = await db.updateUser({ ...existing, role } as UserEntity);
    Logger.info(`[Team] ${actor.id} set role of ${existing.id} to ${role}`);
    const seriesCount = (await db.getSeriesList(existing.id).catch(() => [])).length;
    return {
      id: updated.id,
      name: updated.name || updated.email.split('@')[0],
      email: updated.email,
      role: display(role),
      status: 'active',
      avatar: (updated as any).avatar || avatarFor(updated.email),
      sharedProjectsCount: seriesCount,
      joinedAt: updated.created_at ? updated.created_at.slice(0, 10) : '',
    };
  }

  const now = new Date();
  const list = (await loadInvitations()).filter((inv) => !(inv.email === email && inv.status === 'pending'));
  const invitation: TeamInvitation = {
    id: `inv_${nanoid(10)}`,
    email,
    role,
    invited_by: actor.id,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
    status: 'pending',
  };
  await saveInvitations([invitation, ...list]);

  const signupUrl = `${EnvConfig.appUrl.replace(/\/+$/, '')}/auth/signup?email=${encodeURIComponent(email)}`;
  emailService
    .sendTeamInvitation(email, display(role), actor.name || 'A studio admin', signupUrl)
    .catch((err) => Logger.warn(`[Team] Invitation email failed: ${err?.message}`));

  return {
    id: invitation.id,
    name: email.split('@')[0],
    email,
    role: display(role),
    status: 'invited',
    avatar: avatarFor(email),
    sharedProjectsCount: 0,
    joinedAt: invitation.created_at.slice(0, 10),
  };
}

export async function removeMember(actor: { id: string }, id: string): Promise<{ id: string; removed: true }> {
  if (id.startsWith('inv_')) {
    const list = await loadInvitations();
    const inv = list.find((i) => i.id === id && i.status === 'pending');
    if (!inv) throw new TeamError('Invitation not found.', 404);
    inv.status = 'revoked';
    await saveInvitations(list);
    return { id, removed: true };
  }

  const db = await getDatabaseProvider();
  const user = await db.getUserById(id);
  if (!user || !isTeamRole(user.role)) throw new TeamError('Team member not found.', 404);
  if (user.id === actor.id) throw new TeamError('You cannot remove yourself from the team.');
  if (String(user.role).toLowerCase() === 'owner') throw new TeamError('The owner cannot be removed.');
  await db.updateUser({ ...user, role: 'user' } as UserEntity);
  Logger.info(`[Team] ${actor.id} removed ${user.id} from the team (role revoked)`);
  return { id, removed: true };
}

/** Called right after an account is created: applies a live invitation for that email. */
export async function applyTeamInvitation(user: UserEntity): Promise<UserEntity> {
  try {
    const list = await loadInvitations();
    const inv = list.find((i) => isLive(i) && i.email === String(user.email).toLowerCase());
    if (!inv) return user;
    const db = await getDatabaseProvider();
    const updated = await db.updateUser({ ...user, role: inv.role } as UserEntity);
    inv.status = 'accepted';
    await saveInvitations(list);
    Logger.info(`[Team] Applied invitation ${inv.id}: ${user.id} joined as ${inv.role}`);
    return updated;
  } catch (err: any) {
    Logger.warn(`[Team] Could not apply invitation for ${user.id}: ${err?.message}`);
    return user;
  }
}

import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import {
  IDatabaseProvider,
} from './IDatabaseProvider.js';
import {
  UserEntity,
  SeriesEntity,
  EpisodeEntity,
  FlowAccountEntity,
  AntigravityAccountEntity,
  CreditTransactionEntity,
  AssetEntity,
  WorkerHeartbeatEntity,
  WorkerJobEntity,
  ClusterMetricsSummary,
  IProject,
  TimelineSnapshotVersion,
  TimelineSnapshotHistoryItem,
  RestoreTimelineResult,
  ChatMessageEntity,
  SocialAccountEntity,
} from '~/types.js';
import { Logger } from '../utils/logger.js';
import { normalizePureTimeline } from '../utils/timeline.js';

export class MapDBProvider implements IDatabaseProvider {
  private filePath: string;
  private users: Map<string, UserEntity> = new Map();
  private creditTransactions: CreditTransactionEntity[] = [];
  private chatMessages: ChatMessageEntity[] = [];
  private series: Map<string, SeriesEntity> = new Map();
  private episodes: Map<string, EpisodeEntity> = new Map();
  private timelines: Map<string, any> = new Map();
  private timelineVersions: Map<string, any[]> = new Map();
  private flowAccounts: Map<string, FlowAccountEntity> = new Map();
  private antigravityAccounts: Map<string, AntigravityAccountEntity> = new Map();
  private assets: Map<string, AssetEntity> = new Map();
  private systemSettings: Map<string, any> = new Map();
  private workerHeartbeats: Map<string, WorkerHeartbeatEntity> = new Map();
  private workerJobs: Map<string, WorkerJobEntity> = new Map();

  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(customPath?: string) {
    const dataDir = process.env.MAPDB_DIR || path.resolve(process.cwd(), 'server', 'data');
    this.filePath = customPath || process.env.MAPDB_PATH || path.join(dataDir, 'mapdb.json');
  }

  public async initialize(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.users) this.users = new Map(Object.entries(data.users));
        if (Array.isArray(data.creditTransactions)) this.creditTransactions = data.creditTransactions;
        if (Array.isArray(data.chatMessages)) this.chatMessages = data.chatMessages;
        if (data.series) this.series = new Map(Object.entries(data.series));
        if (data.episodes) this.episodes = new Map(Object.entries(data.episodes));
        if (data.timelines) this.timelines = new Map(Object.entries(data.timelines));
        if (data.timelineVersions) this.timelineVersions = new Map(Object.entries(data.timelineVersions));
        if (data.flowAccounts) this.flowAccounts = new Map(Object.entries(data.flowAccounts));
        if (data.antigravityAccounts) this.antigravityAccounts = new Map(Object.entries(data.antigravityAccounts));
        if (data.assets) this.assets = new Map(Object.entries(data.assets));
        if (data.systemSettings) this.systemSettings = new Map(Object.entries(data.systemSettings));
        if (data.workerHeartbeats) this.workerHeartbeats = new Map(Object.entries(data.workerHeartbeats));
        if (data.workerJobs) this.workerJobs = new Map(Object.entries(data.workerJobs));
        Logger.info(`[MapDBProvider] Loaded database from ${this.filePath}`);
      } catch (err: any) {
        Logger.warn(`[MapDBProvider] Error loading database file: ${err.message}. Starting fresh.`);
      }
    } else {
      Logger.info(`[MapDBProvider] No database file found at ${this.filePath}. Starting fresh.`);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.persistToDisk().catch(err => {
        Logger.warn(`[MapDBProvider] Error persisting to disk: ${err.message}`);
      });
    }, 200);
  }

  private async persistToDisk(): Promise<void> {
    const data = {
      users: Object.fromEntries(this.users),
      creditTransactions: this.creditTransactions,
      chatMessages: this.chatMessages,
      series: Object.fromEntries(this.series),
      episodes: Object.fromEntries(this.episodes),
      timelines: Object.fromEntries(this.timelines),
      timelineVersions: Object.fromEntries(this.timelineVersions),
      flowAccounts: Object.fromEntries(this.flowAccounts),
      antigravityAccounts: Object.fromEntries(this.antigravityAccounts),
      assets: Object.fromEntries(this.assets),
      systemSettings: Object.fromEntries(this.systemSettings),
      workerHeartbeats: Object.fromEntries(this.workerHeartbeats),
      workerJobs: Object.fromEntries(this.workerJobs),
    };
    await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ==================== Users ====================
  public async createUser(user: UserEntity): Promise<UserEntity> {
    const id = user.id || `usr_${nanoid(10)}`;
    const created: UserEntity = {
      ...user,
      id,
      credits: user.credits !== undefined ? user.credits : 100,
      tier: user.tier || 'FREE',
      role: user.role || 'user',
      created_at: user.created_at || new Date().toISOString(),
    };
    this.users.set(id, created);
    this.scheduleSave();
    return created;
  }

  public async getUserByEmail(email: string): Promise<UserEntity | null> {
    if (!email) return null;
    const lower = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email && u.email.toLowerCase().trim() === lower) {
        return { ...u };
      }
    }
    return null;
  }

  public async getUserById(id: string): Promise<UserEntity | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  public async countUsers(): Promise<number> {
    return this.users.size;
  }

  public async getUsers(filter?: {
    search?: string;
    tier?: string;
    role?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    let list = Array.from(this.users.values()).map(u => ({ ...u }));

    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter(u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q))
      );
    }
    if (filter?.tier) {
      const t = filter.tier.toLowerCase().trim();
      list = list.filter(u => (u.tier || 'FREE').toLowerCase() === t);
    }
    if (filter?.role) {
      const r = filter.role.toLowerCase().trim();
      list = list.filter(u => (u.role || 'user').toLowerCase() === r);
    }
    if (filter?.status) {
      const s = filter.status.toLowerCase().trim();
      list = list.filter(u => {
        const userStatus = (u.status || (u.is_active === false ? 'locked' : 'active')).toLowerCase();
        return userStatus === s;
      });
    }

    list.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    const total = list.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 20;
    const paginated = list.slice(offset, offset + limit);

    return { users: paginated, total };
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const existed = this.users.delete(userId);
    if (existed) {
      this.scheduleSave();
    }
    return existed;
  }

  public async updateUser(user: UserEntity): Promise<UserEntity> {
    const existing = this.users.get(user.id);
    if (!existing) {
      this.users.set(user.id, { ...user });
      this.scheduleSave();
      return { ...user };
    }
    const updated = { ...existing, ...user };
    this.users.set(user.id, updated);
    this.scheduleSave();
    return updated;
  }

  public async updateUserPreferences(userId: string, prefs: { theme?: string; language?: string }): Promise<UserEntity | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    if (prefs.theme) user.theme = prefs.theme;
    if (prefs.language) user.language = prefs.language;
    this.users.set(userId, user);
    this.scheduleSave();
    return { ...user };
  }

  // ==================== Chat History & Session Messages ====================
  public async saveChatMessage(message: ChatMessageEntity): Promise<ChatMessageEntity> {
    const msgId = message.id || `msg_${Date.now()}_${nanoid(6)}`;
    const entity: ChatMessageEntity = {
      ...message,
      id: msgId,
      created_at: message.created_at || new Date().toISOString(),
      timestamp: message.timestamp || Date.now(),
    };
    const idx = this.chatMessages.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      this.chatMessages[idx] = entity;
    } else {
      this.chatMessages.push(entity);
    }
    this.scheduleSave();
    return entity;
  }

  public async saveChatMessages(messages: ChatMessageEntity[]): Promise<void> {
    if (!messages || messages.length === 0) return;
    for (const msg of messages) {
      await this.saveChatMessage(msg);
    }
  }

  public async getChatMessages(filter: {
    userId: string;
    sessionId?: string;
    seriesId?: string;
    episodeId?: string;
    scope?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: ChatMessageEntity[]; total: number }> {
    let list = this.chatMessages.filter(m => m.user_id === filter.userId);
    if (filter.sessionId) list = list.filter(m => m.session_id === filter.sessionId);
    if (filter.seriesId) list = list.filter(m => m.series_id === filter.seriesId);
    if (filter.episodeId) list = list.filter(m => m.episode_id === filter.episodeId);
    if (filter.scope) list = list.filter(m => m.scope === filter.scope);

    list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const total = list.length;
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset || 0;

    const paginated = offset > 0 ? list.slice(offset, offset + limit) : list.slice(Math.max(0, total - limit));
    return { messages: paginated, total };
  }

  public async deleteChatSession(userId: string, sessionId: string): Promise<boolean> {
    const prevLen = this.chatMessages.length;
    this.chatMessages = this.chatMessages.filter(
      m => !(m.user_id === userId && m.session_id === sessionId)
    );
    if (this.chatMessages.length !== prevLen) {
      this.scheduleSave();
    }
    return true;
  }

  // ==================== Credits & Deductions ====================
  public async deductCredits(
    userId: string,
    amount: number,
    activity: string,
    details?: string
  ): Promise<{ success: boolean; balance: number; transaction?: CreditTransactionEntity; error?: string }> {
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, balance: 0, error: 'User not found' };
    }
    if ((user.credits || 0) < amount) {
      return { success: false, balance: user.credits || 0, error: 'Insufficient credits' };
    }

    user.credits = (user.credits || 0) - amount;
    this.users.set(userId, user);

    const tx: CreditTransactionEntity = {
      id: `tx_${nanoid(12)}`,
      user_id: userId,
      amount: -amount,
      balance_after: user.credits,
      activity,
      details,
      status: 'Success',
      created_at: new Date().toISOString(),
    };
    this.creditTransactions.unshift(tx);
    this.scheduleSave();

    return { success: true, balance: user.credits, transaction: tx };
  }

  public async getCreditHistory(userId?: string, limit = 50): Promise<CreditTransactionEntity[]> {
    let list = this.creditTransactions;
    if (userId) {
      list = list.filter(t => t.user_id === userId);
    }
    return list.slice(0, limit);
  }

  public async recordCreditTransaction(tx: CreditTransactionEntity): Promise<CreditTransactionEntity> {
    const item: CreditTransactionEntity = {
      ...tx,
      id: tx.id || `tx_${nanoid(12)}`,
      created_at: tx.created_at || new Date().toISOString(),
    };
    this.creditTransactions.unshift(item);
    this.scheduleSave();
    return item;
  }

  // ==================== Series ====================
  public async createSeries(series: SeriesEntity): Promise<SeriesEntity> {
    if (!series.user_id) {
      throw new Error('user_id is required to create a series');
    }
    if (!series.title) {
      throw new Error('title is required to create a series');
    }
    if (series.id === 'global' || series.id?.startsWith('wiz_') || series.id?.startsWith('temp_')) {
      throw new Error('Cannot persist temporary or global session as database series');
    }
    const id = series.id || `ser_${nanoid(10)}`;
    const now = new Date().toISOString();
    const created: SeriesEntity = {
      ...series,
      id,
      status: series.status || 'DRAFT',
      created_at: series.created_at || now,
      updated_at: now,
    };
    this.series.set(id, created);
    this.scheduleSave();
    return created;
  }

  public async getSeriesList(userId?: string, search?: string, status?: string): Promise<SeriesEntity[]> {
    let list = Array.from(this.series.values())
      .filter(s => s.id && s.id !== 'global' && !s.id.startsWith('wiz_') && !s.id.startsWith('temp_'));

    if (userId) {
      list = list.filter(s => s.user_id === userId);
    }
    if (status) {
      list = list.filter(s => s.status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.synopsis && s.synopsis.toLowerCase().includes(q)) ||
        (s.genre && s.genre.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
  }

  public async getSeriesById(id: string): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    const s = this.series.get(id);
    return s ? { ...s } : null;
  }

  public async updateSeries(id: string, updates: Partial<SeriesEntity>): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    const s = this.series.get(id);
    if (!s) return null;
    const updated: SeriesEntity = {
      ...s,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.series.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  public async deleteSeries(id: string): Promise<boolean> {
    const existed = this.series.delete(id);
    if (existed) {
      const epIds: string[] = [];
      for (const [epId, ep] of this.episodes.entries()) {
        if (ep.series_id === id) {
          epIds.push(epId);
          this.episodes.delete(epId);
          this.timelines.delete(epId);
          this.timelineVersions.delete(epId);
        }
      }

      // Delete chat messages
      this.chatMessages = this.chatMessages.filter(
        m => m.series_id !== id && (!m.episode_id || !epIds.includes(m.episode_id))
      );

      // Delete assets
      for (const [assetId, asset] of this.assets.entries()) {
        if (asset.series_id === id) {
          this.assets.delete(assetId);
        }
      }

      // Delete pipeline jobs
      for (const [jobId, job] of this.pipelineJobs.entries()) {
        if (job.series_id === id || (job.episode_id && epIds.includes(job.episode_id))) {
          this.pipelineJobs.delete(jobId);
        }
      }

      this.scheduleSave();
    }
    return existed;
  }

  private syncSeriesEpisodeCounters(seriesId: string): void {
    if (!seriesId || seriesId === 'global' || seriesId.startsWith('wiz_') || seriesId.startsWith('temp_')) return;
    const episodes = Array.from(this.episodes.values()).filter(e => e.series_id === seriesId);
    const series = this.series.get(seriesId);
    if (series) {
      series.episode_count = episodes.length;
      series.published_episode_count = episodes.filter(e => e.status === 'PUBLISHED').length;
      series.updated_at = new Date().toISOString();
      this.series.set(seriesId, series);
      this.scheduleSave();
    }
  }

  // ==================== Episodes ====================
  public async createEpisode(episode: EpisodeEntity): Promise<EpisodeEntity> {
    if (!episode.series_id) {
      throw new Error('series_id is required to create an episode');
    }
    const id = episode.id || `ep_${nanoid(10)}`;
    const now = new Date().toISOString();
    const created: EpisodeEntity = {
      ...episode,
      id,
      status: episode.status || 'DRAFT',
      created_at: episode.created_at || now,
      updated_at: now,
    };
    this.episodes.set(id, created);
    this.syncSeriesEpisodeCounters(episode.series_id);
    this.scheduleSave();
    return created;
  }

  public async getEpisodesBySeriesId(seriesId: string): Promise<EpisodeEntity[]> {
    const list = Array.from(this.episodes.values()).filter(e => e.series_id === seriesId);
    return list.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));
  }

  public async getEpisodeById(id: string): Promise<EpisodeEntity | null> {
    const e = this.episodes.get(id);
    return e ? { ...e } : null;
  }

  public async updateEpisode(id: string, updates: Partial<EpisodeEntity>): Promise<EpisodeEntity | null> {
    const e = this.episodes.get(id);
    if (!e) return null;
    const updated: EpisodeEntity = {
      ...e,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.episodes.set(id, updated);
    if (e.series_id && (updates.status !== undefined || updates.published_urls !== undefined || updates.published_platforms != undefined)) {
      this.syncSeriesEpisodeCounters(e.series_id);
    }
    this.scheduleSave();
    return updated;
  }

  public async deleteEpisode(id: string): Promise<boolean> {
    const ep = this.episodes.get(id);
    const seriesId = ep?.series_id;
    const existed = this.episodes.delete(id);
    if (existed) {
      this.timelines.delete(id);
      this.timelineVersions.delete(id);
      this.chatMessages = this.chatMessages.filter(m => m.episode_id !== id);
      if (seriesId) {
        this.syncSeriesEpisodeCounters(seriesId);
      }
      for (const [jobId, job] of this.pipelineJobs.entries()) {
        if (job.episode_id === id) {
          this.pipelineJobs.delete(jobId);
        }
      }
      for (const [assetId, asset] of this.assets.entries()) {
        if (asset.episode_id === id) {
          this.assets.delete(assetId);
        }
      }
      this.scheduleSave();
    }
    return existed;
  }

  // ==================== Timeline & Versions ====================
  public async saveTimeline(
    episode_id: string,
    timeline_data: IProject,
    author: { id: string; name: string; avatar?: string },
    change_summary?: string
  ): Promise<{ version_id: string; version_number: number; updated_at: string }> {
    const now = new Date().toISOString();
    const version_id = `ver_${nanoid(10)}`;

    let history = this.timelineVersions.get(episode_id) || [];
    const version_number = history.length + 1;
    const pureTimeline = normalizePureTimeline(timeline_data);

    const versionDoc = {
      id: version_id,
      episode_id,
      version_number,
      timeline_data: pureTimeline,
      author,
      change_summary: change_summary || 'Timeline state update',
      created_at: now,
    };

    history.unshift(versionDoc);
    // Cap to maximum 20 versions
    if (history.length > 20) {
      history = history.slice(0, 20);
    }
    this.timelineVersions.set(episode_id, history);

    const latestDoc = {
      episode_id,
      version_id,
      version_number,
      timeline_data: pureTimeline,
      updated_at: now,
    };
    this.timelines.set(episode_id, latestDoc);

    this.scheduleSave();
    return { version_id, version_number, updated_at: now };
  }

  public async getLatestTimeline(episode_id: string): Promise<IProject | null> {
    const t = this.timelines.get(episode_id);
    if (!t) return null;
    return normalizePureTimeline(t.timeline_data || t);
  }

  public async getTimelineHistory(episode_id: string, limit = 20, offset = 0): Promise<{ total: number; history: TimelineSnapshotHistoryItem[] }> {
    const all = this.timelineVersions.get(episode_id) || [];
    const sliced: TimelineSnapshotHistoryItem[] = all.slice(offset, offset + limit).map(v => ({
      version_id: v.id,
      version_number: v.version_number,
      label: v.label,
      author: v.author,
      change_summary: v.change_summary,
      created_at: v.created_at,
    }));
    return { total: all.length, history: sliced };
  }

  public async getTimelineVersion(episode_id: string, version_id: string): Promise<TimelineSnapshotVersion | null> {
    const all = this.timelineVersions.get(episode_id) || [];
    const match = all.find(v => v.id === version_id);
    if (!match) return null;
    return {
      version_id: match.id,
      version_number: match.version_number,
      author: match.author,
      change_summary: match.change_summary,
      created_at: match.created_at,
      timeline_data: normalizePureTimeline(match.timeline_data || match.timelineData),
    };
  }

  public async restoreTimelineVersion(
    episode_id: string,
    version_id: string,
    author: { id: string; name: string; avatar?: string },
    reason?: string
  ): Promise<RestoreTimelineResult> {
    const version = await this.getTimelineVersion(episode_id, version_id);
    if (!version) throw new Error(`Version ${version_id} not found`);

    const result = await this.saveTimeline(
      episode_id,
      version.timeline_data,
      author,
      `Restored from version ${version.version_number}: ${reason || ''}`
    );
    return {
      success: true,
      restored_from_version_id: version_id,
      new_version_id: result.version_id,
      new_version_number: result.version_number,
      active_timeline: version.timeline_data,
      created_at: result.updated_at,
    };
  }

  // ==================== Flow Accounts ====================
  public async getFlowAccounts(status?: string): Promise<FlowAccountEntity[]> {
    let list = Array.from(this.flowAccounts.values());
    if (status) {
      list = list.filter(a => a.status === status);
    }
    const map = new Map<string, FlowAccountEntity>();
    for (const acc of list) {
      const emailKey = (acc.email || '').trim().toLowerCase();
      if (!emailKey) continue;
      const existing = map.get(emailKey);
      if (!existing || new Date(acc.last_synced_at || 0).getTime() > new Date(existing.last_synced_at || 0).getTime()) {
        map.set(emailKey, acc);
      }
    }
    return Array.from(map.values());
  }

  public async upsertFlowAccount(account: FlowAccountEntity): Promise<FlowAccountEntity> {
    const email = (account.email || '').trim();
    const existing = Array.from(this.flowAccounts.values()).find(a => a.email?.toLowerCase() === email.toLowerCase()) || (account.id ? this.flowAccounts.get(account.id) : null);
    const id = existing?.id || account.id || `fa_${nanoid(8)}`;
    const updated: FlowAccountEntity = {
      ...(existing || {}),
      ...account,
      id,
      email,
      last_synced_at: new Date().toISOString(),
    };
    this.flowAccounts.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  public async deleteFlowAccount(idOrEmail: string): Promise<boolean> {
    let key = idOrEmail;
    if (!this.flowAccounts.has(key)) {
      for (const [id, acc] of this.flowAccounts.entries()) {
        if (acc.email === idOrEmail) {
          key = id;
          break;
        }
      }
    }
    const existed = this.flowAccounts.delete(key);
    if (existed) this.scheduleSave();
    return existed;
  }

  // ==================== Antigravity Accounts ====================
  public async getAntigravityAccounts(status?: string): Promise<AntigravityAccountEntity[]> {
    let list = Array.from(this.antigravityAccounts.values());
    if (status) {
      list = list.filter(a => a.status === status);
    }
    const map = new Map<string, AntigravityAccountEntity>();
    for (const acc of list) {
      const emailKey = (acc.email || '').trim().toLowerCase();
      if (!emailKey) continue;
      const existing = map.get(emailKey);
      if (!existing || new Date(acc.updated_at || 0).getTime() > new Date(existing.updated_at || 0).getTime()) {
        map.set(emailKey, acc);
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.request_count || 0) - (b.request_count || 0));
  }

  public async upsertAntigravityAccount(account: AntigravityAccountEntity): Promise<AntigravityAccountEntity> {
    const email = (account.email || '').trim();
    const existing = Array.from(this.antigravityAccounts.values()).find(a => a.email?.toLowerCase() === email.toLowerCase()) || (account.id ? this.antigravityAccounts.get(account.id) : null);
    const id = existing?.id || account.id || `ag_${nanoid(8)}`;
    const updated: AntigravityAccountEntity = {
      ...(existing || {}),
      ...account,
      id,
      email,
      status: account.status || existing?.status || 'ACTIVE',
      request_count: account.request_count !== undefined ? account.request_count : (existing?.request_count || 0),
      updated_at: new Date().toISOString(),
    };
    this.antigravityAccounts.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  public async deleteAntigravityAccount(idOrEmail: string): Promise<boolean> {
    let key = idOrEmail;
    if (!this.antigravityAccounts.has(key)) {
      for (const [id, acc] of this.antigravityAccounts.entries()) {
        if (acc.email === idOrEmail) {
          key = id;
          break;
        }
      }
    }
    const existed = this.antigravityAccounts.delete(key);
    if (existed) this.scheduleSave();
    return existed;
  }

  // ==================== Assets ====================
  public async saveAsset(asset: AssetEntity): Promise<AssetEntity> {
    const id = asset.id || `ast_${nanoid(10)}`;
    const created: AssetEntity = {
      ...asset,
      id,
      created_at: asset.created_at || new Date().toISOString(),
    };
    this.assets.set(id, created);
    this.scheduleSave();
    return created;
  }

  public async getAssets(filter?: {
    user_id?: string;
    series_id?: string;
    episode_id?: string;
    scene_id?: string;
    type?: string;
    character_id?: string;
    search?: string;
  }): Promise<AssetEntity[]> {
    let list = Array.from(this.assets.values());
    if (filter?.user_id) list = list.filter(a => a.user_id === filter.user_id);
    if (filter?.series_id) list = list.filter(a => a.series_id === filter.series_id);
    if (filter?.episode_id) list = list.filter(a => a.episode_id === filter.episode_id);
    if (filter?.scene_id) list = list.filter(a => a.scene_id === filter.scene_id);
    if (filter?.type) list = list.filter(a => a.type === filter.type);
    if (filter?.character_id) list = list.filter(a => a.character_id === filter.character_id);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(a =>
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.prompt && a.prompt.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }

  public async getAssetById(id: string): Promise<AssetEntity | null> {
    const a = this.assets.get(id);
    return a ? { ...a } : null;
  }

  public async deleteAsset(id: string): Promise<boolean> {
    const existed = this.assets.delete(id);
    if (existed) this.scheduleSave();
    return existed;
  }

  // ==================== System Settings ====================
  public async getSystemSetting<T = any>(key: string): Promise<T | null> {
    const val = this.systemSettings.get(key);
    return val !== undefined ? (val as T) : null;
  }

  public async saveSystemSetting<T = any>(key: string, value: T): Promise<void> {
    this.systemSettings.set(key, value);
    this.scheduleSave();
  }

  // ==================== Worker Telemetry & Monitoring ====================
  public async recordWorkerHeartbeat(heartbeat: WorkerHeartbeatEntity): Promise<void> {
    const id = heartbeat.worker_id || `worker_${nanoid(8)}`;
    this.workerHeartbeats.set(id, {
      ...heartbeat,
      worker_id: id,
      last_heartbeat: heartbeat.last_heartbeat || new Date().toISOString(),
    });
    this.scheduleSave();
  }

  public async getWorkerNodes(options?: { activeOnly?: boolean }): Promise<WorkerHeartbeatEntity[]> {
    const now = Date.now();
    const result: WorkerHeartbeatEntity[] = [];

    for (const [id, w] of Array.from(this.workerHeartbeats.entries())) {
      const raw: any = w;
      const last = raw.last_heartbeat || raw.lastHeartbeat || raw.timestamp || 0;
      const ageMs = last ? (now - new Date(last).getTime()) : Infinity;
      const status = ageMs > 90000 ? 'OFFLINE' : (raw.status || 'ONLINE');

      // Auto-prune stale worker records older than 10 minutes
      if (ageMs > 10 * 60 * 1000) {
        this.workerHeartbeats.delete(id);
        continue;
      }

      if (options?.activeOnly && status === 'OFFLINE') {
        continue;
      }

      result.push({
        ...raw,
        worker_id: id,
        workerId: id,
        worker_name: raw.worker_name || raw.workerName || id,
        workerName: raw.worker_name || raw.workerName || id,
        service_name: raw.service_name || raw.serviceName || 'shine-render-worker',
        serviceName: raw.service_name || raw.serviceName || 'shine-render-worker',
        cpu_usage_pct: raw.cpu_usage_pct ?? raw.cpuUsagePct ?? 0,
        cpuUsagePct: raw.cpu_usage_pct ?? raw.cpuUsagePct ?? 0,
        memory_usage_mb: raw.memory_usage_mb ?? raw.memoryUsageMb ?? 0,
        memoryUsageMb: raw.memory_usage_mb ?? raw.memoryUsageMb ?? 0,
        last_heartbeat: last ? new Date(last).toISOString() : '',
        lastHeartbeat: last ? new Date(last).toISOString() : '',
        status,
      });
    }

    result.sort((a: any, b: any) => {
      if (a.status !== 'OFFLINE' && b.status === 'OFFLINE') return -1;
      if (a.status === 'OFFLINE' && b.status !== 'OFFLINE') return 1;
      return new Date(b.last_heartbeat || 0).getTime() - new Date(a.last_heartbeat || 0).getTime();
    });

    return result;
  }

  public async pruneOfflineWorkers(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, w] of Array.from(this.workerHeartbeats.entries())) {
      const raw: any = w;
      const last = raw.last_heartbeat || raw.lastHeartbeat || raw.timestamp || 0;
      const ageMs = last ? (now - new Date(last).getTime()) : Infinity;
      if (ageMs > 90000 || raw.status === 'OFFLINE') {
        this.workerHeartbeats.delete(id);
        count++;
      }
    }
    if (count > 0) this.scheduleSave();
    return count;
  }

  public async recordWorkerJob(job: WorkerJobEntity): Promise<void> {
    const id = job.job_id || `job_${nanoid(10)}`;
    const existing = this.workerJobs.get(id) || {};
    const updated: WorkerJobEntity = {
      ...existing,
      ...job,
      job_id: id,
      submitted_at: job.submitted_at || (existing as any).submitted_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workerJobs.set(id, updated);
    this.scheduleSave();
  }

  public async getWorkerJobs(filter?: { status?: string; limit?: number }): Promise<WorkerJobEntity[]> {
    let list = Array.from(this.workerJobs.values());
    if (filter?.status) {
      const targetStatus = filter.status.toUpperCase();
      list = list.filter(j => j.status?.toUpperCase() === targetStatus);
    }
    list.sort((a, b) => new Date(b.updated_at || b.submitted_at || 0).getTime() - new Date(a.updated_at || a.submitted_at || 0).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  public async getClusterMetrics(): Promise<ClusterMetricsSummary> {
    const workers = await this.getWorkerNodes();
    const activeWorkers = workers.filter(w => w.status === 'ONLINE' || w.status === 'BUSY' || w.status === 'IDLE');
    const jobs = Array.from(this.workerJobs.values());
    const activeJobs = jobs.filter(j => j.status === 'RENDERING' || j.status === 'COMPOSITING');
    const queuedJobs = jobs.filter(j => j.status === 'QUEUED');
    const completedJobs = jobs.filter(j => j.status === 'COMPLETED');
    const failedJobs = jobs.filter(j => j.status === 'FAILED');

    const avgCpu = activeWorkers.length > 0
      ? Math.round(activeWorkers.reduce((acc, w) => acc + (w.cpu_usage_pct || 0), 0) / activeWorkers.length)
      : 0;

    return {
      active_instances: activeWorkers.length || (workers.length > 0 ? 0 : 1),
      gpu_load_pct: avgCpu || (activeJobs.length > 0 ? 68.5 : 12.0),
      active_jobs_count: activeJobs.length,
      queued_jobs_count: queuedJobs.length,
      completed_jobs_count: completedJobs.length,
      failed_jobs_count: failedJobs.length,
      monthly_cost_usd: 0.00,
      monthly_budget_cap: 50.00,
      service_name: 'shine-render-worker',
      region: process.env.GCP_REGION || 'us-central1',
      status: activeWorkers.length > 0 ? 'ONLINE' : (workers.length > 0 ? 'DEGRADED' : 'ONLINE'),
      workers: workers,
      active_jobs: activeJobs.concat(queuedJobs),
    };
  }

  // ==================== Pipeline Background Jobs ====================
  private pipelineJobs: Map<string, any> = new Map();

  public async savePipelineJob(job: any): Promise<any> {
    const item = {
      ...job,
      created_at: job.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.pipelineJobs.set(job.id, item);
    this.scheduleSave();
    return item;
  }

  public async getPipelineJobById(job_id: string): Promise<any | null> {
    return this.pipelineJobs.get(job_id) || null;
  }

  public async getPipelineJobs(filter?: { user_id?: string; series_id?: string; episode_id?: string; status?: string; limit?: number }): Promise<any[]> {
    let list = Array.from(this.pipelineJobs.values());
    if (filter?.user_id) list = list.filter(j => j.user_id === filter.user_id);
    if (filter?.series_id) list = list.filter(j => j.series_id === filter.series_id);
    if (filter?.episode_id) list = list.filter(j => j.episode_id === filter.episode_id);
    if (filter?.status) list = list.filter(j => j.status?.toLowerCase() === filter.status?.toLowerCase());
    list.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  public async updatePipelineJob(job_id: string, patch: Partial<any>): Promise<any | null> {
    const existing = await this.getPipelineJobById(job_id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.pipelineJobs.set(job_id, updated);
    this.scheduleSave();
    return updated;
  }

  public async deletePipelineJob(job_id: string): Promise<boolean> {
    const deleted = this.pipelineJobs.delete(job_id);
    if (deleted) this.scheduleSave();
    return deleted;
  }

  public async findActivePipelineJob(series_id: string, episode_id: string, type?: string): Promise<any | null> {
    const jobs = await this.getPipelineJobs({ series_id, episode_id });
    return jobs.find(j => (j.status === 'running' || j.status === 'queued') && (!type || j.type === type)) || null;
  }

  // ─── Viral Trends Storage & Persistence ───────────────────────────────────
  private viralTrends: Map<string, { country: string; language: string; items: any[]; updated_at: Date }> = new Map();

  public async getViralTrends(country: string, language: string): Promise<{ items: any[]; updated_at: Date } | null> {
    const key = `${country.toUpperCase()}_${language.toLowerCase()}`;
    const found = this.viralTrends.get(key);
    return found ? { items: found.items, updated_at: found.updated_at } : null;
  }

  public async saveViralTrends(country: string, language: string, items: any[]): Promise<void> {
    const key = `${country.toUpperCase()}_${language.toLowerCase()}`;
    this.viralTrends.set(key, {
      country: country.toUpperCase(),
      language: language.toLowerCase(),
      items: items || [],
      updated_at: new Date(),
    });
  }

  public async getAllCachedViralTrends(): Promise<Array<{ cache_key: string; country: string; language: string; items: any[]; updated_at: Date }>> {
    return Array.from(this.viralTrends.entries()).map(([cache_key, val]) => ({
      cache_key,
      country: val.country,
      language: val.language,
      items: val.items,
      updated_at: val.updated_at,
    }));
  }

  // ─── Social Connected Accounts ───────────────────────────────────────────
  private socialAccounts: Map<string, SocialAccountEntity> = new Map();

  public async updateSocialAccount(account: Partial<SocialAccountEntity>): Promise<SocialAccountEntity> {
    const user_id = account.user_id || '';
    const platform = account.platform || '';
    const channel_id = account.channel_id || '';
    const key = `${user_id}_${platform}_${channel_id}`;
    const existing = this.socialAccounts.get(key) || {
      id: `soc_${nanoid(10)}`,
      user_id,
      platform,
      channel_id,
      channel_name: account.channel_name || '',
      access_token: account.access_token || '',
      created_at: new Date(),
    };
    const updated: SocialAccountEntity = {
      ...existing,
      ...account,
      updated_at: new Date(),
    };
    this.socialAccounts.set(key, updated);
    this.scheduleSave();
    return updated;
  }

  public async listSocialAccounts(user_id: string): Promise<SocialAccountEntity[]> {
    return Array.from(this.socialAccounts.values()).filter(a => a.user_id === user_id && a.is_active !== false);
  }

  public async deleteSocialAccount(user_id: string, platform: string, channel_id?: string): Promise<boolean> {
    let deleted = false;
    for (const [key, a] of Array.from(this.socialAccounts.entries())) {
      if (a.user_id === user_id && a.platform === platform && (!channel_id || a.channel_id === channel_id)) {
        this.socialAccounts.delete(key);
        deleted = true;
      }
    }
    if (deleted) this.scheduleSave();
    return deleted;
  }
}

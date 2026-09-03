import { Firestore } from '@google-cloud/firestore';
import { nanoid } from 'nanoid';
import {
  IDatabaseProvider,
} from './IDatabaseProvider.js';
import {
  UserEntity,
  SeriesEntity,
  EpisodeEntity,
  FlowAccountEntity,
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

function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as any;
  if (Array.isArray(obj)) {
    return obj.map(item => (item === undefined ? null : sanitizeForFirestore(item))) as any;
  }
  if (typeof obj === 'object') {
    if (obj instanceof Date || Buffer.isBuffer(obj)) return obj;
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean;
  }
  return obj;
}

export class FirestoreProvider implements IDatabaseProvider {
  private db!: Firestore;
  private readCache = new Map<string, { data: any; expiresAt: number }>();

  private getCached<T>(key: string): T | null {
    const entry = this.readCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.readCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: any, ttlMs = 10000): void {
    if (data === null || data === undefined) return;
    this.readCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    // Cap cache size
    if (this.readCache.size > 2000) {
      const oldestKey = this.readCache.keys().next().value;
      if (oldestKey) this.readCache.delete(oldestKey);
    }
  }

  private invalidateCachePrefix(prefix: string): void {
    for (const key of this.readCache.keys()) {
      if (key.startsWith(prefix)) {
        this.readCache.delete(key);
      }
    }
  }

  public async initialize(): Promise<void> {
    const projectId = process.env.FIRESTORE_PROJECT_ID || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const databaseId = process.env.FIRESTORE_DATABASE_ID || 'shine-db';
    const keyFilename = process.env.FIRESTORE_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;

    const firestoreOptions: any = {
      ignoreUndefinedProperties: true,
    };
    if (projectId) firestoreOptions.projectId = projectId;
    if (databaseId) firestoreOptions.databaseId = databaseId;
    if (keyFilename) firestoreOptions.keyFilename = keyFilename;

    this.db = new Firestore(firestoreOptions);
    Logger.info(`[FirestoreProvider] Initialized Firestore connection (Project: ${projectId || 'ADC/default'}, DB: ${databaseId}) with In-Memory Acceleration Cache`);
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
    await this.db.collection('users').doc(id).set(created, { merge: true });
    this.readCache.delete(`user:${id}`);
    return created;
  }

  public async getUserByEmail(email: string): Promise<UserEntity | null> {
    if (!email) return null;
    const snapshot = await this.db.collection('users').where('email', '==', email.trim().toLowerCase()).limit(1).get();
    if (snapshot.empty) {
      // Fallback: search exact case
      const exactSnap = await this.db.collection('users').where('email', '==', email.trim()).limit(1).get();
      if (exactSnap.empty) return null;
      return exactSnap.docs[0].data() as UserEntity;
    }
    return snapshot.docs[0].data() as UserEntity;
  }

  public async getUserById(id: string): Promise<UserEntity | null> {
    const cacheKey = `user:${id}`;
    const cached = this.getCached<UserEntity>(cacheKey);
    if (cached) return cached;

    const doc = await this.db.collection('users').doc(id).get();
    if (!doc.exists) return null;
    const user = doc.data() as UserEntity;
    this.setCache(cacheKey, user, 30000);
    return user;
  }

  public async countUsers(): Promise<number> {
    const snapshot = await this.db.collection('users').count().get();
    return snapshot.data().count;
  }

  public async getUsers(filter?: {
    search?: string;
    tier?: string;
    role?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    const usersRef = this.db.collection('users');
    const snapshot = await usersRef.get();
    let list: UserEntity[] = [];

    snapshot.forEach(doc => {
      const data = doc.data() as UserEntity;
      list.push(data);
    });

    // Apply filtering
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

    // Sort descending by created_at
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
    await this.db.collection('users').doc(userId).delete();
    this.readCache.delete(`user:${userId}`);
    return true;
  }

  public async updateUser(user: UserEntity): Promise<UserEntity> {
    await this.db.collection('users').doc(user.id).set(user, { merge: true });
    this.readCache.delete(`user:${user.id}`);
    const updated = await this.getUserById(user.id);
    return updated || user;
  }

  public async updateUserPreferences(userId: string, prefs: { theme?: string; language?: string }): Promise<UserEntity | null> {
    const docRef = this.db.collection('users').doc(userId);
    const updates: any = {};
    if (prefs.theme) updates.theme = prefs.theme;
    if (prefs.language) updates.language = prefs.language;
    await docRef.set(updates, { merge: true });
    this.readCache.delete(`user:${userId}`);
    return this.getUserById(userId);
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
    const clean = sanitizeForFirestore(entity);
    await this.db.collection('chat_messages').doc(msgId).set(clean);
    return entity;
  }

  public async saveChatMessages(messages: ChatMessageEntity[]): Promise<void> {
    if (!messages || messages.length === 0) return;
    const batch = this.db.batch();
    for (const message of messages) {
      const msgId = message.id || `msg_${Date.now()}_${nanoid(6)}`;
      const entity: ChatMessageEntity = {
        ...message,
        id: msgId,
        created_at: message.created_at || new Date().toISOString(),
        timestamp: message.timestamp || Date.now(),
      };
      const clean = sanitizeForFirestore(entity);
      batch.set(this.db.collection('chat_messages').doc(msgId), clean);
    }
    await batch.commit();
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
    let query: any = this.db.collection('chat_messages').where('user_id', '==', filter.userId);

    if (filter.sessionId) {
      query = query.where('session_id', '==', filter.sessionId);
    }
    if (filter.seriesId) {
      query = query.where('series_id', '==', filter.seriesId);
    }
    if (filter.episodeId) {
      query = query.where('episode_id', '==', filter.episodeId);
    }
    if (filter.scope) {
      query = query.where('scope', '==', filter.scope);
    }

    const snapshot = await query.get();
    const allMessages: ChatMessageEntity[] = snapshot.docs.map((d: any) => d.data() as ChatMessageEntity);

    // Sort chronologically
    allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const total = allMessages.length;
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset || 0;

    let paginated: ChatMessageEntity[];
    if (offset > 0) {
      paginated = allMessages.slice(offset, offset + limit);
    } else {
      // Top latest history slice
      paginated = allMessages.slice(Math.max(0, total - limit));
    }

    return { messages: paginated, total };
  }

  public async deleteChatSession(userId: string, sessionId: string): Promise<boolean> {
    const snapshot = await this.db.collection('chat_messages')
      .where('user_id', '==', userId)
      .where('session_id', '==', sessionId)
      .get();

    if (snapshot.empty) return true;
    const batch = this.db.batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    return true;
  }

  // ==================== Credits & Deductions ====================
  public async deductCredits(
    userId: string,
    amount: number,
    activity: string,
    details?: string
  ): Promise<{ success: boolean; balance: number; transaction?: CreditTransactionEntity; error?: string }> {
    const userRef = this.db.collection('users').doc(userId);

    try {
      const result = await this.db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new Error('User not found');
        }

        const userData = userDoc.data() as UserEntity;
        const currentCredits = userData.credits || 0;
        if (currentCredits < amount) {
          throw new Error('Insufficient credits');
        }

        const newBalance = currentCredits - amount;
        transaction.update(userRef, { credits: newBalance });

        const txId = `tx_${nanoid(12)}`;
        const tx: CreditTransactionEntity = {
          id: txId,
          user_id: userId,
          amount: -amount,
          balance_after: newBalance,
          activity,
          details,
          status: 'Success',
          created_at: new Date().toISOString(),
        };

        const txRef = this.db.collection('credit_transactions').doc(txId);
        transaction.set(txRef, tx);

        return { success: true, balance: newBalance, transaction: tx };
      });

      return result;
    } catch (err: any) {
      return { success: false, balance: 0, error: err.message };
    }
  }

  public async getCreditHistory(userId?: string, limit = 50): Promise<CreditTransactionEntity[]> {
    let query: FirebaseFirestore.Query = this.db.collection('credit_transactions');
    if (userId) {
      query = query.where('user_id', '==', userId);
    }
    try {
      // High-speed native Firestore composite indexed query
      const snapshot = await query.orderBy('created_at', 'desc').limit(limit).get();
      return snapshot.docs.map(doc => doc.data() as CreditTransactionEntity);
    } catch {
      // Resilient fallback if composite index is currently provisioning or unindexed
      const snapshot = await query.get();
      const list = snapshot.docs.map(doc => doc.data() as CreditTransactionEntity);
      return list
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, limit);
    }
  }

  public async recordCreditTransaction(tx: CreditTransactionEntity): Promise<CreditTransactionEntity> {
    const id = tx.id || `tx_${nanoid(12)}`;
    const item: CreditTransactionEntity = {
      ...tx,
      id,
      created_at: tx.created_at || new Date().toISOString(),
    };
    await this.db.collection('credit_transactions').doc(id).set(item);
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
    // Prevent phantom global series from ever being created in DB
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
    await this.db.collection('series').doc(id).set(sanitizeForFirestore(created));
    this.invalidateCachePrefix('series:');
    return created;
  }

  public async getSeriesList(userId?: string, search?: string, status?: string): Promise<SeriesEntity[]> {
    const cacheKey = `series_list:${userId || 'all'}:${search || ''}:${status || ''}`;
    const cached = this.getCached<SeriesEntity[]>(cacheKey);
    if (cached) return cached;

    let query: FirebaseFirestore.Query = this.db.collection('series');
    if (userId) {
      query = query.where('user_id', '==', userId);
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    let list = snapshot.docs.map(doc => doc.data() as SeriesEntity);

    // Filter out phantom global or temp documents if previously persisted
    list = list.filter(s => s.id && s.id !== 'global' && !s.id.startsWith('wiz_') && !s.id.startsWith('temp_'));

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.synopsis && s.synopsis.toLowerCase().includes(q)) ||
        (s.genre && s.genre.toLowerCase().includes(q))
      );
    }

    const sorted = list.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    this.setCache(cacheKey, sorted, 15000);
    return sorted;
  }

  public async getSeriesById(id: string): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    const cacheKey = `series:${id}`;
    const cached = this.getCached<SeriesEntity>(cacheKey);
    if (cached) return cached;

    const doc = await this.db.collection('series').doc(id).get();
    if (!doc.exists) return null;
    const series = doc.data() as SeriesEntity;
    this.setCache(cacheKey, series, 15000);
    return series;
  }

  public async updateSeries(id: string, updates: Partial<SeriesEntity>): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    const now = new Date().toISOString();
    await this.db.collection('series').doc(id).set(sanitizeForFirestore({ ...updates, updated_at: now }), { merge: true });
    this.invalidateCachePrefix('series:');
    this.invalidateCachePrefix('series_list:');
    return this.getSeriesById(id);
  }

  public async deleteSeries(id: string): Promise<boolean> {
    const batch = this.db.batch();
    batch.delete(this.db.collection('series').doc(id));

    // Find all episodes belonging to this series
    const epSnap = await this.db.collection('episodes').where('series_id', '==', id).get();
    const episodeIds = epSnap.docs.map(doc => doc.id);
    epSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
      batch.delete(this.db.collection('timelines').doc(doc.id));
    });

    // Delete timeline versions of all episodes in series
    for (const epId of episodeIds) {
      const vers = await this.db.collection('timeline_versions').where('episode_id', '==', epId).get();
      vers.docs.forEach(doc => batch.delete(doc.ref));
    }

    // Delete chat messages associated with this series
    const msgs = await this.db.collection('chat_messages').where('series_id', '==', id).get();
    msgs.docs.forEach(doc => batch.delete(doc.ref));

    // Delete assets associated with this series
    const assets = await this.db.collection('assets').where('series_id', '==', id).get();
    assets.docs.forEach(doc => batch.delete(doc.ref));

    // Delete pipeline background jobs associated with this series
    const jobs = await this.db.collection('pipeline_jobs').where('series_id', '==', id).get();
    jobs.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();
    return true;
  }

  public async syncSeriesEpisodeCounters(seriesId: string): Promise<void> {
    if (!seriesId || seriesId === 'global' || seriesId.startsWith('wiz_') || seriesId.startsWith('temp_')) return;
    try {
      const epSnap = await this.db.collection('episodes').where('series_id', '==', seriesId).get();
      const episodes = epSnap.docs.map(d => d.data() as EpisodeEntity);
      const episode_count = episodes.length;
      const published_episode_count = episodes.filter(e => e.status === 'PUBLISHED').length;

      await this.db.collection('series').doc(seriesId).set(
        sanitizeForFirestore({
          episode_count,
          published_episode_count,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
      this.invalidateCachePrefix('series:');
      this.invalidateCachePrefix('series_list:');
    } catch (err: any) {
      Logger.warn(`[FirestoreProvider] Failed to sync series episode counters for ${seriesId}: ${err?.message}`);
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
    await this.db.collection('episodes').doc(id).set(sanitizeForFirestore(created));
    await this.syncSeriesEpisodeCounters(episode.series_id);
    return created;
  }

  public async getEpisodesBySeriesId(seriesId: string): Promise<EpisodeEntity[]> {
    const snapshot = await this.db.collection('episodes').where('series_id', '==', seriesId).get();
    const list = snapshot.docs.map(doc => doc.data() as EpisodeEntity);
    return list.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));
  }

  public async getEpisodeById(id: string): Promise<EpisodeEntity | null> {
    const doc = await this.db.collection('episodes').doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as EpisodeEntity;
  }

  public async updateEpisode(id: string, updates: Partial<EpisodeEntity>): Promise<EpisodeEntity | null> {
    const now = new Date().toISOString();
    await this.db.collection('episodes').doc(id).set(sanitizeForFirestore({ ...updates, updated_at: now }), { merge: true });
    const updated = await this.getEpisodeById(id);
    if (updated?.series_id && (updates.status !== undefined || updates.published_urls !== undefined || updates.published_platforms !== undefined)) {
      await this.syncSeriesEpisodeCounters(updated.series_id);
    }
    return updated;
  }

  public async deleteEpisode(id: string): Promise<boolean> {
    const ep = await this.getEpisodeById(id);
    const seriesId = ep?.series_id;

    const batch = this.db.batch();
    batch.delete(this.db.collection('episodes').doc(id));
    batch.delete(this.db.collection('timelines').doc(id));

    // Cascade delete timeline versions for this episode
    const vers = await this.db.collection('timeline_versions').where('episode_id', '==', id).get();
    vers.docs.forEach(doc => batch.delete(doc.ref));

    // Cascade delete chat messages for this episode
    const msgs = await this.db.collection('chat_messages').where('episode_id', '==', id).get();
    msgs.docs.forEach(doc => batch.delete(doc.ref));

    // Cascade delete pipeline jobs for this episode
    const jobs = await this.db.collection('pipeline_jobs').where('episode_id', '==', id).get();
    jobs.docs.forEach(doc => batch.delete(doc.ref));

    // Cascade delete assets for this episode
    const assets = await this.db.collection('assets').where('episode_id', '==', id).get();
    assets.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();
    if (seriesId) {
      await this.syncSeriesEpisodeCounters(seriesId);
    }
    return true;
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

    const historySnap = await this.db.collection('timeline_versions').where('episode_id', '==', episode_id).get();
    const version_number = historySnap.size + 1;
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

    // Save latest timeline and version document in independent writes to avoid bundling huge payloads into a single transaction/batch
    await this.db.collection('timelines').doc(episode_id).set(sanitizeForFirestore({
      episode_id,
      version_id,
      version_number,
      timeline_data: pureTimeline,
      updated_at: now,
    }));

    await this.db.collection('timeline_versions').doc(version_id).set(sanitizeForFirestore(versionDoc));

    // Cap timeline history to maximum 20 versions (delete older versions beyond top 19 existing in background)
    try {
      const allDocs = historySnap.docs.map(d => ({ ref: d.ref, data: d.data() }));
      allDocs.sort((a, b) => new Date(b.data.created_at || 0).getTime() - new Date(a.data.created_at || 0).getTime());
      if (allDocs.length >= 20) {
        const toDelete = allDocs.slice(19);
        for (const item of toDelete) {
          await item.ref.delete().catch(() => {});
        }
      }
    } catch (cleanErr) {
      Logger.warn(`[FirestoreProvider] Failed to clean up old timeline versions: ${cleanErr}`);
    }

    return { version_id, version_number, updated_at: now };
  }

  public async getLatestTimeline(episode_id: string): Promise<IProject | null> {
    const doc = await this.db.collection('timelines').doc(episode_id).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return normalizePureTimeline(data?.timeline_data || data);
  }

  public async getTimelineHistory(episode_id: string, limit = 20, offset = 0): Promise<{ total: number; history: TimelineSnapshotHistoryItem[] }> {
    const query = this.db.collection('timeline_versions').where('episode_id', '==', episode_id);
    try {
      const snapshot = await query.get();
      const list: TimelineSnapshotHistoryItem[] = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            version_id: data.id || doc.id,
            version_number: data.version_number || 1,
            label: data.label,
            author: data.author,
            change_summary: data.change_summary,
            created_at: data.created_at,
          };
        })
        .sort((a, b) => (b.version_number || 0) - (a.version_number || 0));
      return { total: list.length, history: list.slice(offset, offset + limit) };
    } catch {
      return { total: 0, history: [] };
    }
  }

  public async getTimelineVersion(episode_id: string, version_id: string): Promise<TimelineSnapshotVersion | null> {
    const doc = await this.db.collection('timeline_versions').doc(version_id).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return {
      version_id: data?.id || version_id,
      version_number: data?.version_number || 1,
      author: data?.author,
      change_summary: data?.change_summary,
      created_at: data?.created_at,
      timeline_data: normalizePureTimeline(data?.timeline_data || data),
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
    let query: FirebaseFirestore.Query = this.db.collection('flow_accounts');
    if (status) {
      query = query.where('status', '==', status);
    }
    const snapshot = await query.get();
    const list = snapshot.docs.map(doc => {
      const data = doc.data() as FlowAccountEntity;
      return { ...data, id: doc.id || data.id };
    });

    // Deduplicate strictly by email (case-insensitive)
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
    if (!email) throw new Error('Email is required for Flow account');

    // Query if document with this email already exists
    const snap = await this.db.collection('flow_accounts').where('email', '==', email).get();
    let docId = account.id;

    if (!snap.empty) {
      const firstDoc = snap.docs[0];
      docId = firstDoc.id;
      // Clean up any existing duplicate documents for this email
      if (snap.docs.length > 1) {
        const batch = this.db.batch();
        for (let i = 1; i < snap.docs.length; i++) {
          batch.delete(snap.docs[i].ref);
        }
        await batch.commit();
      }
    } else if (!docId) {
      docId = `flow_${email.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }

    const now = new Date().toISOString();
    const updated: FlowAccountEntity = {
      ...account,
      id: docId,
      email,
      last_synced_at: now,
    };
    await this.db.collection('flow_accounts').doc(docId).set(updated, { merge: true });
    return updated;
  }

  public async deleteFlowAccount(idOrEmail: string): Promise<boolean> {
    const doc = await this.db.collection('flow_accounts').doc(idOrEmail).get();
    if (doc.exists) {
      await doc.ref.delete();
    }
    const snap = await this.db.collection('flow_accounts').where('email', '==', idOrEmail).get();
    if (!snap.empty) {
      const batch = this.db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    return true;
  }

  // ==================== Assets ====================
  public async saveAsset(asset: AssetEntity): Promise<AssetEntity> {
    const id = asset.id || `ast_${nanoid(10)}`;
    const created: AssetEntity = {
      ...asset,
      id,
      created_at: asset.created_at || new Date().toISOString(),
    };
    await this.db.collection('assets').doc(id).set(created);
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
    let query: FirebaseFirestore.Query = this.db.collection('assets');
    if (filter?.user_id) query = query.where('user_id', '==', filter.user_id);
    if (filter?.series_id) query = query.where('series_id', '==', filter.series_id);
    if (filter?.episode_id) query = query.where('episode_id', '==', filter.episode_id);
    if (filter?.scene_id) query = query.where('scene_id', '==', filter.scene_id);
    if (filter?.type) query = query.where('type', '==', filter.type);
    if (filter?.character_id) query = query.where('character_id', '==', filter.character_id);

    const snapshot = await query.get();
    let list = snapshot.docs.map(doc => doc.data() as AssetEntity);

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
    const doc = await this.db.collection('assets').doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as AssetEntity;
  }

  public async deleteAsset(id: string): Promise<boolean> {
    await this.db.collection('assets').doc(id).delete();
    return true;
  }

  // ==================== System Settings ====================
  public async getSystemSetting<T = any>(key: string): Promise<T | null> {
    const doc = await this.db.collection('system_settings').doc(key).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return (data?.value !== undefined ? data.value : data) as T;
  }

  public async saveSystemSetting<T = any>(key: string, value: T): Promise<void> {
    await this.db.collection('system_settings').doc(key).set({ key, value, updated_at: new Date().toISOString() });
  }

  // ==================== Worker Telemetry & Monitoring ====================
  public async recordWorkerHeartbeat(heartbeat: WorkerHeartbeatEntity): Promise<void> {
    const id = heartbeat.worker_id || `worker_${nanoid(8)}`;
    const record: WorkerHeartbeatEntity = {
      ...heartbeat,
      worker_id: id,
      last_heartbeat: heartbeat.last_heartbeat || new Date().toISOString(),
    };
    await this.db.collection('worker_heartbeats').doc(id).set(record, { merge: true });
  }

  public async getWorkerNodes(): Promise<WorkerHeartbeatEntity[]> {
    const snap = await this.db.collection('worker_heartbeats').get();
    const now = Date.now();
    return snap.docs.map(doc => {
      const w = doc.data() as WorkerHeartbeatEntity;
      const ageMs = now - new Date(w.last_heartbeat || 0).getTime();
      const status = ageMs > 120000 ? 'OFFLINE' : w.status;
      return { ...w, status };
    });
  }

  public async recordWorkerJob(job: WorkerJobEntity): Promise<void> {
    const id = job.job_id || `job_${nanoid(10)}`;
    const record: WorkerJobEntity = {
      ...job,
      job_id: id,
      submitted_at: job.submitted_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await this.db.collection('worker_jobs').doc(id).set(sanitizeForFirestore(record), { merge: true });
  }

  public async getWorkerJobs(filter?: { status?: string; limit?: number }): Promise<WorkerJobEntity[]> {
    let query: FirebaseFirestore.Query = this.db.collection('worker_jobs');
    if (filter?.status) {
      query = query.where('status', '==', filter.status.toUpperCase());
    }
    const snap = await query.get();
    let list = snap.docs.map(doc => doc.data() as WorkerJobEntity);
    list.sort((a, b) => new Date(b.updated_at || b.submitted_at || 0).getTime() - new Date(a.updated_at || a.submitted_at || 0).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  public async getClusterMetrics(): Promise<ClusterMetricsSummary> {
    const workers = await this.getWorkerNodes();
    const activeWorkers = workers.filter(w => w.status === 'ONLINE' || w.status === 'BUSY' || w.status === 'IDLE');
    const jobs = await this.getWorkerJobs({ limit: 100 });
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
  public async savePipelineJob(job: any): Promise<any> {
    const id = job.id || `job_${nanoid(12)}`;
    const docRef = this.db.collection('pipeline_jobs').doc(id);
    const existing = (await docRef.get()).data() || {};
    const record = sanitizeForFirestore({
      ...existing,
      ...job,
      id,
      created_at: job.created_at || (existing as any).created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await docRef.set(record, { merge: true });
    return record;
  }

  public async getPipelineJobById(job_id: string): Promise<any | null> {
    const doc = await this.db.collection('pipeline_jobs').doc(job_id).get();
    return doc.exists ? (doc.data() as any) : null;
  }

  public async getPipelineJobs(filter?: { user_id?: string; series_id?: string; episode_id?: string; status?: string; limit?: number }): Promise<any[]> {
    let query: FirebaseFirestore.Query = this.db.collection('pipeline_jobs');
    if (filter?.user_id) query = query.where('user_id', '==', filter.user_id);
    if (filter?.series_id) query = query.where('series_id', '==', filter.series_id);
    if (filter?.episode_id) query = query.where('episode_id', '==', filter.episode_id);
    if (filter?.status) query = query.where('status', '==', filter.status.toLowerCase());

    const snap = await query.get();
    let list = snap.docs.map(doc => doc.data() as any);
    list.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  public async updatePipelineJob(job_id: string, patch: Partial<any>): Promise<any | null> {
    const docRef = this.db.collection('pipeline_jobs').doc(job_id);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const updated = sanitizeForFirestore({
      ...snap.data(),
      ...patch,
      updated_at: new Date().toISOString(),
    });
    await docRef.set(updated, { merge: true });
    return updated;
  }

  public async deletePipelineJob(job_id: string): Promise<boolean> {
    try {
      await this.db.collection('pipeline_jobs').doc(job_id).delete();
      return true;
    } catch {
      return false;
    }
  }

  public async findActivePipelineJob(series_id: string, episode_id: string, type?: string): Promise<any | null> {
    const jobs = await this.getPipelineJobs({ series_id, episode_id });
    return jobs.find(j => (j.status === 'running' || j.status === 'queued') && (!type || j.type === type)) || null;
  }

  // ─── Viral Trends Storage & Persistence ───────────────────────────────────

  public async getViralTrends(country: string, language: string): Promise<{ items: any[]; updated_at: Date } | null> {
    try {
      const cache_key = `${country.toUpperCase()}_${language.toLowerCase()}`;
      const snap = await this.db.collection('viral_trends').doc(cache_key).get();
      if (!snap.exists) return null;
      const data = snap.data() as any;
      return {
        items: data?.items || [],
        updated_at: data?.updated_at ? new Date(data.updated_at) : new Date(),
      };
    } catch {
      return null;
    }
  }

  public async saveViralTrends(country: string, language: string, items: any[]): Promise<void> {
    try {
      const cache_key = `${country.toUpperCase()}_${language.toLowerCase()}`;
      await this.db.collection('viral_trends').doc(cache_key).set({
        cache_key,
        country: country.toUpperCase(),
        language: language.toLowerCase(),
        items: items || [],
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch {
      // Non-blocking
    }
  }

  public async getAllCachedViralTrends(): Promise<Array<{ cache_key: string; country: string; language: string; items: any[]; updated_at: Date }>> {
    try {
      const snap = await this.db.collection('viral_trends').get();
      return snap.docs.map(doc => {
        const d = doc.data() as any;
        return {
          cache_key: doc.id,
          country: d.country,
          language: d.language,
          items: d.items || [],
          updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
        };
      });
    } catch {
      return [];
    }
  }

  // ─── Social Connected Accounts ───────────────────────────────────────────
  public async updateSocialAccount(account: Partial<SocialAccountEntity>): Promise<SocialAccountEntity> {
    const user_id = account.user_id || '';
    const platform = account.platform || '';
    const channel_id = account.channel_id || '';
    const docId = `${user_id}_${platform}_${channel_id}`;
    const ref = this.db.collection('social_accounts').doc(docId);
    const existingSnap = await ref.get();
    const existing = existingSnap.exists ? existingSnap.data() : {};

    const updated: any = {
      ...existing,
      ...sanitizeForFirestore(account),
      updated_at: new Date().toISOString(),
    };
    if (!existingSnap.exists) {
      updated.created_at = new Date().toISOString();
    }
    await ref.set(updated, { merge: true });
    return updated as SocialAccountEntity;
  }

  public async listSocialAccounts(user_id: string): Promise<SocialAccountEntity[]> {
    try {
      const snap = await this.db.collection('social_accounts').where('user_id', '==', user_id).get();
      return snap.docs.map(d => d.data() as SocialAccountEntity).filter(a => a.is_active !== false);
    } catch {
      return [];
    }
  }

  public async deleteSocialAccount(user_id: string, platform: string, channel_id?: string): Promise<boolean> {
    try {
      let query = this.db.collection('social_accounts').where('user_id', '==', user_id).where('platform', '==', platform);
      if (channel_id) {
        query = query.where('channel_id', '==', channel_id);
      }
      const snap = await query.get();
      const batch = this.db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return true;
    } catch {
      return false;
    }
  }
}

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
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
import { normalizePureTimeline } from '../utils/timeline.js';

export class SQLiteProvider implements IDatabaseProvider {
  private db!: Database.Database;
  private isFallback = false;

  // In-memory fallback stores if native bindings are unavailable
  private usersStore: UserEntity[] = [];
  private creditTxStore: CreditTransactionEntity[] = [];
  private chatMessagesStore: ChatMessageEntity[] = [];
  private seriesStore: SeriesEntity[] = [];
  private episodesStore: EpisodeEntity[] = [];
  private flowStore: FlowAccountEntity[] = [];
  private antigravityStore: AntigravityAccountEntity[] = [];
  private timelineSnapshotsStore: any[] = [];
  private systemSettingsStore: Map<string, any> = new Map();
  private workerHeartbeatsStore: Map<string, WorkerHeartbeatEntity> = new Map();
  private workerJobsStore: Map<string, WorkerJobEntity> = new Map();

  constructor() {
    try {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = path.join(dataDir, 'shine.db');
      this.db = new Database(dbPath);
    } catch (err: any) {
      console.warn('[SQLiteProvider] Native better-sqlite3 bindings unavailable (using in-memory fallback store).');
      this.isFallback = true;
    }
  }

  async initialize(): Promise<void> {
    if (this.isFallback || !this.db) {
      this.seedFallback();
      return;
    }

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          name TEXT,
          avatar_url TEXT,
          role TEXT DEFAULT 'user',
          tier TEXT DEFAULT 'FREE',
          credits INTEGER DEFAULT 100,
          theme TEXT DEFAULT 'dark',
          language TEXT DEFAULT 'en',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS series (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          genre TEXT NOT NULL,
          visual_style TEXT,
          visual_style_prompt TEXT,
          target_audience TEXT,
          country TEXT DEFAULT 'United State',
          language TEXT DEFAULT 'en-US',
          ratio TEXT DEFAULT '9:16',
          episode_count INTEGER DEFAULT 20,
          status TEXT DEFAULT 'DRAFT',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS episodes (
          id TEXT PRIMARY KEY,
          series_id TEXT NOT NULL,
          episode_number INTEGER NOT NULL,
          title TEXT,
          synopsis TEXT,
          duration INTEGER DEFAULT 90,
          scenes TEXT,
          script TEXT,
          thumbnail_url TEXT,
          cover_image TEXT,
          language_tracks TEXT,
          scene_core TEXT,
          conflict_escalation TEXT,
          cliffhanger_hook TEXT,
          status TEXT DEFAULT 'DRAFT',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(series_id) REFERENCES series(id)
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          scope TEXT DEFAULT 'global',
          series_id TEXT,
          episode_id TEXT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_calls TEXT,
          suggestions TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          timestamp INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session ON chat_messages(user_id, session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);

        CREATE TABLE IF NOT EXISTS flow_accounts (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          session_token TEXT NOT NULL,
          access_token TEXT,
          project_id TEXT,
          status TEXT DEFAULT 'ACTIVE',
          credits_remaining INTEGER DEFAULT 100,
          last_synced_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS antigravity_accounts (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          avatar TEXT,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          expires_at INTEGER,
          project_id TEXT,
          tier TEXT,
          status TEXT DEFAULT 'ACTIVE',
          error_message TEXT,
          rate_limit_reset_at INTEGER,
          request_count INTEGER DEFAULT 0,
          last_used_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS timeline_snapshots (
          id TEXT PRIMARY KEY,
          episode_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          label TEXT,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          author_avatar TEXT,
          change_summary TEXT,
          timeline_data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(episode_id) REFERENCES episodes(id)
        );

        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS credit_transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          activity TEXT NOT NULL,
          details TEXT,
          amount INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          status TEXT DEFAULT 'Success',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS pipeline_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          series_id TEXT NOT NULL,
          episode_id TEXT NOT NULL,
          session_id TEXT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT DEFAULT 'queued',
          progress INTEGER DEFAULT 0,
          current_step TEXT,
          step_progress TEXT,
          outputs TEXT,
          logs TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        );
      `);

      const userColumns = [
        "role TEXT DEFAULT 'user'",
        'avatar TEXT',
        'avatar_url TEXT',
        'api_key TEXT',
        'api_key_rotated_at TEXT',
        'two_factor_enabled INTEGER DEFAULT 0',
        'integrations TEXT',
        'connected_channels TEXT'
      ];
      for (const colDef of userColumns) {
        try {
          this.db.prepare(`ALTER TABLE users ADD COLUMN ${colDef}`).run();
        } catch {
          // column already exists
        }
      }

      const seriesColumns = [
        "language TEXT DEFAULT 'en-US'",
        "country TEXT DEFAULT 'United State'",
        "ratio TEXT DEFAULT '9:16'",
        "visual_style_prompt TEXT",
        "characters TEXT",
        "locations TEXT",
        "props TEXT",
        "master_plan TEXT",
        "chat_history TEXT"
      ];
      for (const colDef of seriesColumns) {
        try {
          this.db.prepare(`ALTER TABLE series ADD COLUMN ${colDef}`).run();
        } catch {
          // column already exists
        }
      }

      const episodeColumns = [
        'scenes TEXT',
        'script TEXT',
        'screenplay TEXT',
        'locations TEXT',
        'props TEXT',
        'thumbnail_url TEXT',
        'cover_image TEXT',
        'language_tracks TEXT',
        'scene_core TEXT',
        'conflict_escalation TEXT',
        'cliffhanger_hook TEXT',
        'dubbing_settings TEXT',
        'caption_settings TEXT',
        'caption_languages TEXT',
        'dubbing_languages TEXT',
      ];
      for (const colDef of episodeColumns) {
        try {
          this.db.prepare(`ALTER TABLE episodes ADD COLUMN ${colDef}`).run();
        } catch {
          // column already exists
        }
      }

    } catch (err: any) {
      console.warn('[SQLiteProvider] Native DB init error, switching to fallback:', err.message);
      this.isFallback = true;
      this.seedFallback();
    }
  }

  private seedFallback() {
    const now = new Date().toISOString();
    if (this.usersStore.length === 0) {
      
    }
  }

  async createUser(user: UserEntity): Promise<UserEntity> {
    if (this.isFallback) {
      user.role = user.role || 'user';
      user.theme = user.theme || 'dark';
      user.language = user.language || 'en';
      this.usersStore.push(user);
      return user;
    }
    try {
      this.db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, tier, credits, theme, language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        user.email,
        user.password_hash || '',
        user.name,
        user.role || 'user',
        user.tier,
        user.credits,
        user.theme || 'dark',
        user.language || 'en'
      );
    } catch {
      this.db.prepare(`
        INSERT INTO users (id, email, password_hash, name, tier, credits)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user.id, user.email, user.password_hash || '', user.name, user.tier, user.credits);
    }
    return (await this.getUserById(user.id))!;
  }

  async countUsers(): Promise<number> {
    if (this.isFallback) return this.usersStore.length;
    try {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
      return Number(row?.count || 0);
    } catch {
      return 0;
    }
  }

  private mapUserRow(row: any): UserEntity | null {
    if (!row) return null;
    let integrations: any[] = [];
    if (row.integrations) {
      try {
        integrations = typeof row.integrations === 'string' ? JSON.parse(row.integrations) : row.integrations;
      } catch {}
    }
    let connectedChannels: any[] = [];
    if (row.connected_channels) {
      try {
        connectedChannels = typeof row.connected_channels === 'string' ? JSON.parse(row.connected_channels) : row.connected_channels;
      } catch {}
    }
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      name: row.name,
      avatar: row.avatar || row.avatar_url || '',
      role: row.role || 'user',
      tier: row.tier || 'FREE',
      credits: Number(row.credits ?? 100),
      theme: row.theme || 'dark',
      language: row.language || 'en',
      api_key: row.api_key || '',
      api_key_rotated_at: row.api_key_rotated_at || '',
      two_factor_enabled: row.two_factor_enabled === 1 || row.two_factor_enabled === 'true' || row.two_factor_enabled === true,
      integrations,
      connected_channels: connectedChannels,
      created_at: row.created_at,
    };
  }

  async getUserByEmail(email: string): Promise<UserEntity | null> {
    if (this.isFallback) {
      return this.usersStore.find((u) => u.email === email) || null;
    }
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    return this.mapUserRow(row);
  }

  async getUserById(id: string): Promise<UserEntity | null> {
    if (this.isFallback) {
      return this.usersStore.find((u) => u.id === id) || null;
    }
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return this.mapUserRow(row);
  }

  async getUsers(filter?: {
    search?: string;
    tier?: string;
    role?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    let list: UserEntity[] = [];
    if (this.isFallback) {
      list = [...this.usersStore];
    } else {
      try {
        const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[];
        list = rows.map((r) => this.mapUserRow(r)!).filter(Boolean);
      } catch {
        list = [];
      }
    }

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

    const total = list.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 20;
    const paginated = list.slice(offset, offset + limit);

    return { users: paginated, total };
  }

  async deleteUser(userId: string): Promise<boolean> {
    if (this.isFallback) {
      this.usersStore = this.usersStore.filter(u => u.id !== userId);
      return true;
    }
    try {
      this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      return true;
    } catch {
      return false;
    }
  }

  async updateUserPreferences(userId: string, prefs: { theme?: string; language?: string }): Promise<UserEntity | null> {
    const user = await this.getUserById(userId);
    if (!user) return null;

    const newTheme = prefs.theme || user.theme || 'dark';
    const newLang = prefs.language || user.language || 'en';

    if (this.isFallback) {
      user.theme = newTheme;
      user.language = newLang;
      return user;
    }

    try {
      this.db.prepare('UPDATE users SET theme = ?, language = ? WHERE id = ?').run(newTheme, newLang, userId);
    } catch {}

    return (await this.getUserById(userId))!;
  }

  async updateUser(user: UserEntity): Promise<UserEntity> {
    if (this.isFallback) {
      const idx = this.usersStore.findIndex((u) => u.id === user.id);
      if (idx !== -1) {
        this.usersStore[idx] = { ...this.usersStore[idx], ...user };
        return this.usersStore[idx];
      }
      this.usersStore.push(user);
      return user;
    }

    const avatar = user.avatar || '';
    const integrationsJson = user.integrations ? (typeof user.integrations === 'string' ? user.integrations : JSON.stringify(user.integrations)) : '[]';
    const connectedChannelsJson = (user as any).connected_channels ? (typeof (user as any).connected_channels === 'string' ? (user as any).connected_channels : JSON.stringify((user as any).connected_channels)) : '[]';
    const twoFactor = user.two_factor_enabled ? 1 : 0;

    try {
      this.db.prepare(`
        UPDATE users 
        SET name = ?, email = ?, avatar = ?, avatar_url = ?, theme = ?, language = ?, credits = ?, tier = ?,
            role = ?, api_key = ?, api_key_rotated_at = ?, two_factor_enabled = ?, integrations = ?, connected_channels = ?
        WHERE id = ?
      `).run(
        user.name,
        user.email,
        avatar,
        avatar,
        user.theme || 'dark',
        user.language || 'en',
        user.credits ?? 100,
        user.tier || 'FREE',
        user.role || 'user',
        user.api_key || '',
        user.api_key_rotated_at || '',
        twoFactor,
        integrationsJson,
        connectedChannelsJson,
        user.id
      );
    } catch (e: any) {
      try {
        this.db.prepare(`
          UPDATE users 
          SET name = ?, email = ?, avatar = ?, avatar_url = ?
          WHERE id = ?
        `).run(user.name, user.email, avatar, avatar, user.id);
      } catch {
        this.db.prepare(`
          UPDATE users 
          SET name = ?, email = ?
          WHERE id = ?
        `).run(user.name, user.email, user.id);
      }
    }

    return (await this.getUserById(user.id)) || user;
  }

  // ==================== Chat History & Session Messages ====================
  async saveChatMessage(message: ChatMessageEntity): Promise<ChatMessageEntity> {
    const msgId = message.id || `msg_${Date.now()}_${nanoid(6)}`;
    const entity: ChatMessageEntity = {
      ...message,
      id: msgId,
      created_at: message.created_at || new Date().toISOString(),
      timestamp: message.timestamp || Date.now(),
    };

    if (this.isFallback) {
      this.chatMessagesStore.push(entity);
      return entity;
    }

    try {
      this.db.prepare(`
        INSERT INTO chat_messages (id, user_id, session_id, scope, series_id, episode_id, role, content, tool_calls, suggestions, created_at, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          tool_calls = excluded.tool_calls,
          suggestions = excluded.suggestions
      `).run(
        entity.id,
        entity.user_id,
        entity.session_id,
        entity.scope || 'global',
        entity.series_id || null,
        entity.episode_id || null,
        entity.role,
        entity.content,
        entity.tool_calls ? JSON.stringify(entity.tool_calls) : null,
        entity.suggestions ? JSON.stringify(entity.suggestions) : null,
        entity.created_at,
        entity.timestamp
      );
    } catch (e: any) {
      console.warn('[SQLiteProvider] Error saving chat message:', e.message);
    }

    return entity;
  }

  async saveChatMessages(messages: ChatMessageEntity[]): Promise<void> {
    if (!messages || messages.length === 0) return;
    for (const msg of messages) {
      await this.saveChatMessage(msg);
    }
  }

  async getChatMessages(filter: {
    userId: string;
    sessionId?: string;
    seriesId?: string;
    episodeId?: string;
    scope?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: ChatMessageEntity[]; total: number }> {
    if (this.isFallback) {
      let list = this.chatMessagesStore.filter(m => m.user_id === filter.userId);
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

    try {
      let sql = 'SELECT * FROM chat_messages WHERE user_id = ?';
      const params: any[] = [filter.userId];

      if (filter.sessionId) {
        sql += ' AND session_id = ?';
        params.push(filter.sessionId);
      }
      if (filter.seriesId) {
        sql += ' AND series_id = ?';
        params.push(filter.seriesId);
      }
      if (filter.episodeId) {
        sql += ' AND episode_id = ?';
        params.push(filter.episodeId);
      }
      if (filter.scope) {
        sql += ' AND scope = ?';
        params.push(filter.scope);
      }

      sql += ' ORDER BY timestamp ASC';

      const rows = this.db.prepare(sql).all(...params) as any[];
      const total = rows.length;
      const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
      const offset = filter.offset || 0;

      const sliceRows = offset > 0 ? rows.slice(offset, offset + limit) : rows.slice(Math.max(0, total - limit));

      const messages: ChatMessageEntity[] = sliceRows.map(r => ({
        id: r.id,
        user_id: r.user_id,
        session_id: r.session_id,
        scope: r.scope || 'global',
        series_id: r.series_id || undefined,
        episode_id: r.episode_id || undefined,
        role: r.role,
        content: r.content,
        tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        suggestions: r.suggestions ? JSON.parse(r.suggestions) : undefined,
        created_at: r.created_at,
        timestamp: Number(r.timestamp || 0),
      }));

      return { messages, total };
    } catch (e: any) {
      console.warn('[SQLiteProvider] Error fetching chat messages:', e.message);
      return { messages: [], total: 0 };
    }
  }

  async deleteChatSession(userId: string, sessionId: string): Promise<boolean> {
    if (this.isFallback) {
      this.chatMessagesStore = this.chatMessagesStore.filter(
        m => !(m.user_id === userId && m.session_id === sessionId)
      );
      return true;
    }
    try {
      this.db.prepare('DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?').run(userId, sessionId);
      return true;
    } catch {
      return false;
    }
  }

  async deductCredits(userId: string, amount: number, activity: string, details?: string): Promise<{ success: boolean; balance: number; transaction?: CreditTransactionEntity; error?: string }> {
    const user = await this.getUserById(userId);
    if (!user) {
      return { success: false, balance: 0, error: 'User not found' };
    }

    const currentCredits = user.credits ?? 0;
    if (currentCredits < amount) {
      return { success: false, balance: currentCredits, error: `Insufficient credits. Required: ${amount}, Available: ${currentCredits}` };
    }

    const newBalance = currentCredits - amount;
    user.credits = newBalance;
    await this.updateUser(user);

    const tx: CreditTransactionEntity = {
      id: `tx_${nanoid(10)}`,
      user_id: userId,
      activity,
      details: details || '',
      amount: -amount,
      balance_after: newBalance,
      status: 'Success',
      created_at: new Date().toISOString(),
    };

    await this.recordCreditTransaction(tx);
    return { success: true, balance: newBalance, transaction: tx };
  }

  async getCreditHistory(userId?: string, limit = 50): Promise<CreditTransactionEntity[]> {
    if (this.isFallback) {
      const list = userId ? this.creditTxStore.filter((t) => t.user_id === userId) : this.creditTxStore;
      return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, limit);
    }
    try {
      if (userId) {
        return this.db.prepare('SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as CreditTransactionEntity[];
      }
      return this.db.prepare('SELECT * FROM credit_transactions ORDER BY created_at DESC LIMIT ?').all(limit) as CreditTransactionEntity[];
    } catch {
      return [];
    }
  }

  async recordCreditTransaction(tx: CreditTransactionEntity): Promise<CreditTransactionEntity> {
    if (this.isFallback) {
      this.creditTxStore.unshift(tx);
      return tx;
    }
    try {
      this.db.prepare(`
        INSERT INTO credit_transactions (id, user_id, activity, details, amount, balance_after, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tx.id,
        tx.user_id,
        tx.activity,
        tx.details || '',
        tx.amount,
        tx.balance_after,
        tx.status || 'Success',
        tx.created_at || new Date().toISOString()
      );
    } catch {}
    return tx;
  }

  async createSeries(series: SeriesEntity): Promise<SeriesEntity> {
    if (!series.user_id) {
      throw new Error('user_id is required to create a series');
    }
    if (!series.title) {
      throw new Error('title is required to create a series');
    }
    if (series.id === 'global' || series.id?.startsWith('wiz_') || series.id?.startsWith('temp_')) {
      throw new Error('Cannot persist temporary or global session as database series');
    }
    if (this.isFallback) {
      this.seriesStore.push(series);
      return series;
    }
    this.db.prepare(`
      INSERT INTO series (id, user_id, title, genre, visual_style, visual_style_prompt, target_audience, episode_count, country, language, ratio, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      series.id,
      series.user_id,
      series.title,
      series.genre,
      series.visual_style || 'realistic',
      series.visual_style_prompt || '',
      series.target_audience || 'General',
      series.episode_count,
      series.country || 'United States',
      series.language || 'en-US',
      series.ratio || '9:16',
      series.status
    );
    return (await this.getSeriesById(series.id))!;
  }

  private formatSeriesRow(row: any): SeriesEntity | null {
    if (!row) return null;
    let characters = row.characters;
    if (typeof characters === 'string') {
      try { characters = JSON.parse(characters); } catch {}
    }
    let locations = row.locations;
    if (typeof locations === 'string') {
      try { locations = JSON.parse(locations); } catch {}
    }
    let props = row.props;
    if (typeof props === 'string') {
      try { props = JSON.parse(props); } catch {}
    }
    let masterPlan = row.master_plan;
    if (typeof masterPlan === 'string') {
      try { masterPlan = JSON.parse(masterPlan); } catch {}
    }
    return {
      ...row,
      characters: Array.isArray(characters) ? characters : [],
      locations: Array.isArray(locations) ? locations : [],
      props: Array.isArray(props) ? props : [],
      master_plan: masterPlan || undefined,
    };
  }

  async getSeriesById(id: string): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    if (this.isFallback) {
      return this.seriesStore.find((s) => s.id === id) || null;
    }
    const row = this.db.prepare('SELECT * FROM series WHERE id = ?').get(id) as any;
    return this.formatSeriesRow(row);
  }

  async getSeriesList(userId?: string, search?: string, status?: string): Promise<SeriesEntity[]> {
    if (this.isFallback) {
      let res = this.seriesStore.filter(s => s.id && s.id !== 'global' && !s.id.startsWith('wiz_') && !s.id.startsWith('temp_'));
      if (search) res = res.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()));
      if (status) res = res.filter((s) => s.status === status);
      return res;
    }
    let query = 'SELECT * FROM series WHERE 1=1';
    const params: any[] = [];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    if (search) {
      query += ' AND title LIKE ?';
      params.push(`%${search}%`);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows
      .map(r => this.formatSeriesRow(r)!)
      .filter(s => s && s.id && s.id !== 'global' && !s.id.startsWith('wiz_') && !s.id.startsWith('temp_'));
  }

  async updateSeries(id: string, updates: Partial<SeriesEntity>): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    if (this.isFallback) {
      const idx = this.seriesStore.findIndex(s => s.id === id);
      if (idx >= 0) {
        this.seriesStore[idx] = { ...this.seriesStore[idx], ...updates, updated_at: new Date().toISOString() };
        return this.seriesStore[idx];
      }
      return null;
    }
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      if (typeof val === 'object' && val !== null) {
        values.push(JSON.stringify(val));
      } else {
        values.push(val);
      }
    }
    if (fields.length === 0) return this.getSeriesById(id);
    values.push(id);
    this.db.prepare(`UPDATE series SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getSeriesById(id);
  }

  async deleteSeries(id: string): Promise<boolean> {
    if (this.isFallback) {
      const epIds = this.episodesStore.filter(e => e.series_id === id).map(e => e.id);
      this.timelineSnapshotsStore = this.timelineSnapshotsStore.filter(s => !epIds.includes(s.episode_id));
      this.chatMessagesStore = this.chatMessagesStore.filter(m => m.series_id !== id);
      this.episodesStore = this.episodesStore.filter(e => e.series_id !== id);
      const prevLen = this.seriesStore.length;
      this.seriesStore = this.seriesStore.filter(s => s.id !== id);
      return this.seriesStore.length < prevLen;
    }
    try {
      const episodes = this.db.prepare('SELECT id FROM episodes WHERE series_id = ?').all(id) as any[];
      for (const ep of episodes) {
        this.db.prepare('DELETE FROM timeline_snapshots WHERE episode_id = ?').run(ep.id);
      }
      this.db.prepare('DELETE FROM episodes WHERE series_id = ?').run(id);
      this.db.prepare('DELETE FROM chat_messages WHERE series_id = ?').run(id);
      this.db.prepare('DELETE FROM assets WHERE series_id = ?').run(id);
      this.db.prepare('DELETE FROM pipeline_jobs WHERE series_id = ?').run(id);
      const res = this.db.prepare('DELETE FROM series WHERE id = ?').run(id);
      return res.changes > 0;
    } catch {
      return false;
    }
  }

  private formatEpisodeRow(row: any): EpisodeEntity {
    if (!row) return row;
    let scenes = row.scenes;
    if (typeof scenes === 'string') {
      try { scenes = JSON.parse(scenes); } catch {}
    }
    let locations = row.locations;
    if (typeof locations === 'string') {
      try { locations = JSON.parse(locations); } catch {}
    }
    let props = row.props;
    if (typeof props === 'string') {
      try { props = JSON.parse(props); } catch {}
    }
    let language_tracks = row.language_tracks;
    if (typeof language_tracks === 'string') {
      try { language_tracks = JSON.parse(language_tracks); } catch {}
    }
    let render_versions = row.render_versions;
    if (typeof render_versions === 'string') {
      try { render_versions = JSON.parse(render_versions); } catch {}
    }
    let video_urls = row.video_urls;
    if (typeof video_urls === 'string') {
      try { video_urls = JSON.parse(video_urls); } catch {}
    }
    let dubbing_settings = row.dubbing_settings;
    if (typeof dubbing_settings === 'string') {
      try { dubbing_settings = JSON.parse(dubbing_settings); } catch {}
    }
    let caption_settings = row.caption_settings;
    if (typeof caption_settings === 'string') {
      try { caption_settings = JSON.parse(caption_settings); } catch {}
    }
    let caption_languages = row.caption_languages;
    if (typeof caption_languages === 'string') {
      try { caption_languages = JSON.parse(caption_languages); } catch {}
    }
    let dubbing_languages = row.dubbing_languages;
    if (typeof dubbing_languages === 'string') {
      try { dubbing_languages = JSON.parse(dubbing_languages); } catch {}
    }
    return {
      ...row,
      scenes: Array.isArray(scenes) ? scenes : [],
      locations: Array.isArray(locations) ? locations : [],
      props: Array.isArray(props) ? props : [],
      language_tracks: Array.isArray(language_tracks) ? language_tracks : [],
      dubbing_settings: typeof dubbing_settings === 'object' && dubbing_settings !== null ? dubbing_settings : {},
      caption_settings: typeof caption_settings === 'object' && caption_settings !== null ? caption_settings : {},
      caption_languages: Array.isArray(caption_languages) ? caption_languages : [],
      dubbing_languages: Array.isArray(dubbing_languages) ? dubbing_languages : [],
      render_versions: Array.isArray(render_versions) ? render_versions : [],
      video_urls: typeof video_urls === 'object' && video_urls !== null ? video_urls : {},
      thumbnail_url: row.thumbnail_url || row.cover_image || '',
      cover_image: row.cover_image || row.thumbnail_url || '',
    };
  }

  async createEpisode(episode: EpisodeEntity): Promise<EpisodeEntity> {
    if (this.isFallback) {
      this.episodesStore.push(episode);
      return episode;
    }
    this.db.prepare(`
      INSERT INTO episodes (id, series_id, episode_number, title, synopsis, duration, scenes, script, cover_image, scene_core, conflict_escalation, cliffhanger_hook, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      episode.id,
      episode.series_id,
      episode.episode_number,
      episode.title,
      episode.synopsis || '',
      episode.duration || 90,
      typeof episode.scenes === 'object' ? JSON.stringify(episode.scenes) : (episode.scenes || '[]'),
      episode.script || '',
      episode.cover_image || '',
      episode.scene_core || '',
      episode.conflict_escalation || '',
      episode.cliffhanger_hook || '',
      episode.status || 'DRAFT'
    );
    return episode;
  }

  async getEpisodesBySeriesId(seriesId: string): Promise<EpisodeEntity[]> {
    if (this.isFallback) {
      return this.episodesStore.filter((e) => e.series_id === seriesId);
    }
    const rows = this.db.prepare('SELECT * FROM episodes WHERE series_id = ? ORDER BY episode_number ASC').all(seriesId) as any[];
    return rows.map((r) => this.formatEpisodeRow(r));
  }

  async getEpisodeById(id: string): Promise<EpisodeEntity | null> {
    if (this.isFallback) {
      return this.episodesStore.find((e) => e.id === id) || null;
    }
    const ep = this.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as any;
    return ep ? this.formatEpisodeRow(ep) : null;
  }

  async updateEpisode(id: string, updates: Partial<EpisodeEntity>): Promise<EpisodeEntity | null> {
    if (this.isFallback) {
      const idx = this.episodesStore.findIndex((e) => e.id === id);
      if (idx >= 0) {
        this.episodesStore[idx] = { ...this.episodesStore[idx], ...updates };
        return this.episodesStore[idx];
      }
      return null;
    }
    const current = this.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as any;
    if (!current) return null;

    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, val] of Object.entries(updates)) {
      if (key === 'scenes' || key === 'locations' || key === 'props' || key === 'characters' || key === 'render_versions' || key === 'video_urls') {
        fields.push(`${key} = ?`);
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      } else if (key === 'language_tracks') {
        fields.push('language_tracks = ?');
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      } else if (key === 'dubbing_settings') {
        fields.push('dubbing_settings = ?');
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      } else if (key === 'caption_settings') {
        fields.push('caption_settings = ?');
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      } else if (key === 'caption_languages') {
        fields.push('caption_languages = ?');
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      } else if (key === 'dubbing_languages') {
        fields.push('dubbing_languages = ?');
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      } else if (key === 'thumbnail_url' || key === 'cover_image') {
        fields.push('thumbnail_url = ?', 'cover_image = ?');
        values.push(val, val);
      } else if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE episodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.getEpisodeById(id);
  }

  async deleteEpisode(id: string): Promise<boolean> {
    if (this.isFallback) {
      this.timelineSnapshotsStore = this.timelineSnapshotsStore.filter(s => s.episode_id !== id);
      this.chatMessagesStore = this.chatMessagesStore.filter(m => m.episode_id !== id);
      this.assetsStore = this.assetsStore.filter(a => a.episode_id !== id && (a as any).episodeId !== id);
      const prevLen = this.episodesStore.length;
      this.episodesStore = this.episodesStore.filter(e => e.id !== id);
      return this.episodesStore.length < prevLen;
    }
    try {
      this.db.prepare('DELETE FROM timeline_snapshots WHERE episode_id = ?').run(id);
      this.db.prepare('DELETE FROM chat_messages WHERE episode_id = ?').run(id);
      this.db.prepare('DELETE FROM pipeline_jobs WHERE episode_id = ?').run(id);
      this.assetsStore = this.assetsStore.filter(a => a.episode_id !== id && (a as any).episodeId !== id);
      const res = this.db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
      return res.changes > 0;
    } catch {
      return false;
    }
  }

  async getFlowAccounts(status?: string): Promise<FlowAccountEntity[]> {
    let list: FlowAccountEntity[] = [];
    if (this.isFallback) {
      list = status ? this.flowStore.filter((f) => f.status === status) : this.flowStore;
    } else {
      if (status) {
        list = this.db.prepare('SELECT * FROM flow_accounts WHERE status = ? ORDER BY credits_remaining DESC').all(status) as FlowAccountEntity[];
      } else {
        list = this.db.prepare('SELECT * FROM flow_accounts ORDER BY last_synced_at DESC, created_at DESC').all() as FlowAccountEntity[];
      }
    }
    const map = new Map<string, FlowAccountEntity>();
    for (const acc of list) {
      const emailKey = (acc.email || '').trim().toLowerCase();
      if (!emailKey) continue;
      if (!map.has(emailKey)) {
        map.set(emailKey, acc);
      }
    }
    return Array.from(map.values());
  }

  async upsertFlowAccount(account: FlowAccountEntity): Promise<FlowAccountEntity> {
    const email = (account.email || '').trim();
    if (this.isFallback) {
      const idx = this.flowStore.findIndex((f) => f.email?.toLowerCase() === email.toLowerCase());
      if (idx >= 0) this.flowStore[idx] = { ...this.flowStore[idx], ...account, email };
      else this.flowStore.push({ ...account, email });
      return account;
    }
    this.db.prepare(`
      INSERT INTO flow_accounts (id, email, session_token, access_token, project_id, status, credits_remaining, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        session_token = excluded.session_token,
        access_token = excluded.access_token,
        project_id = excluded.project_id,
        status = excluded.status,
        last_synced_at = CURRENT_TIMESTAMP
    `).run(account.id, email, account.session_token, account.access_token || '', account.project_id || '', account.status, account.credits_remaining);
    return account;
  }

  async deleteFlowAccount(idOrEmail: string): Promise<boolean> {
    this.flowStore = this.flowStore.filter((f) => f.id !== idOrEmail && f.email !== idOrEmail);
    if (this.isFallback) return true;
    try {
      this.db.prepare('DELETE FROM flow_accounts WHERE id = ? OR email = ?').run(idOrEmail, idOrEmail);
      return true;
    } catch {
      return true;
    }
  }

  async getAntigravityAccounts(status?: string): Promise<AntigravityAccountEntity[]> {
    let list: AntigravityAccountEntity[] = [];
    if (this.isFallback) {
      list = status ? this.antigravityStore.filter((f) => f.status === status) : this.antigravityStore;
    } else {
      if (status) {
        list = this.db.prepare('SELECT * FROM antigravity_accounts WHERE status = ? ORDER BY request_count ASC, updated_at DESC').all(status) as AntigravityAccountEntity[];
      } else {
        list = this.db.prepare('SELECT * FROM antigravity_accounts ORDER BY updated_at DESC, created_at DESC').all() as AntigravityAccountEntity[];
      }
    }
    const map = new Map<string, AntigravityAccountEntity>();
    for (const acc of list) {
      const emailKey = (acc.email || '').trim().toLowerCase();
      if (!emailKey) continue;
      if (!map.has(emailKey)) {
        map.set(emailKey, acc);
      }
    }
    return Array.from(map.values());
  }

  async upsertAntigravityAccount(account: AntigravityAccountEntity): Promise<AntigravityAccountEntity> {
    const email = (account.email || '').trim();
    const id = account.id || nanoid();
    const preparedAccount: AntigravityAccountEntity = {
      ...account,
      id,
      email,
      status: account.status || 'ACTIVE',
      request_count: account.request_count || 0,
      updated_at: new Date().toISOString(),
    };

    if (this.isFallback) {
      const idx = this.antigravityStore.findIndex((f) => f.email?.toLowerCase() === email.toLowerCase());
      if (idx >= 0) this.antigravityStore[idx] = { ...this.antigravityStore[idx], ...preparedAccount };
      else this.antigravityStore.push(preparedAccount);
      return preparedAccount;
    }

    this.db.prepare(`
      INSERT INTO antigravity_accounts (
        id, email, name, avatar, access_token, refresh_token,
        expires_at, project_id, tier, status, error_message,
        rate_limit_reset_at, request_count, last_used_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        name = COALESCE(excluded.name, antigravity_accounts.name),
        avatar = COALESCE(excluded.avatar, antigravity_accounts.avatar),
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, antigravity_accounts.refresh_token),
        expires_at = excluded.expires_at,
        project_id = COALESCE(excluded.project_id, antigravity_accounts.project_id),
        tier = COALESCE(excluded.tier, antigravity_accounts.tier),
        status = excluded.status,
        error_message = excluded.error_message,
        rate_limit_reset_at = excluded.rate_limit_reset_at,
        request_count = excluded.request_count,
        last_used_at = excluded.last_used_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      preparedAccount.id,
      email,
      preparedAccount.name || null,
      preparedAccount.avatar || null,
      preparedAccount.access_token,
      preparedAccount.refresh_token,
      preparedAccount.expires_at || null,
      preparedAccount.project_id || null,
      preparedAccount.tier || null,
      preparedAccount.status,
      preparedAccount.error_message || null,
      preparedAccount.rate_limit_reset_at || null,
      preparedAccount.request_count || 0,
      preparedAccount.last_used_at || null
    );
    return preparedAccount;
  }

  async deleteAntigravityAccount(idOrEmail: string): Promise<boolean> {
    this.antigravityStore = this.antigravityStore.filter((f) => f.id !== idOrEmail && f.email !== idOrEmail);
    if (this.isFallback) return true;
    try {
      this.db.prepare('DELETE FROM antigravity_accounts WHERE id = ? OR email = ?').run(idOrEmail, idOrEmail);
      return true;
    } catch {
      return true;
    }
  }

  async saveTimeline(
    episode_id: string,
    timeline_data: IProject,
    author: { id: string; name: string; avatar?: string },
    change_summary = 'Timeline updated'
  ): Promise<{ version_id: string; version_number: number; updated_at: string }> {
    const version_id = `ver_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();
    const history = await this.getTimelineHistory(episode_id, 1, 0);
    const version_number = history.total + 1;
    const label = `v1.${version_number} - ${change_summary}`;
    const pureTimeline = normalizePureTimeline(timeline_data);
    const serializedData = JSON.stringify(pureTimeline);

    if (this.isFallback) {
      this.timelineSnapshotsStore.unshift({
        id: version_id,
        episode_id,
        version_number,
        label,
        author_id: author.id || 'usr_default',
        author_name: author.name || 'Editor',
        author_avatar: author.avatar || '',
        change_summary,
        timeline_data: serializedData,
        created_at: now,
      });

      // Prune fallback snapshots to max 20 per episode
      const epSnaps = this.timelineSnapshotsStore.filter(s => s.episode_id === episode_id);
      if (epSnaps.length > 20) {
        const excess = epSnaps.slice(20).map(s => s.id);
        this.timelineSnapshotsStore = this.timelineSnapshotsStore.filter(s => !excess.includes(s.id));
      }

      return { version_id, version_number, updated_at: now };
    }

    this.db.prepare(`
      INSERT INTO timeline_snapshots (id, episode_id, version_number, label, author_id, author_name, author_avatar, change_summary, timeline_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      version_id,
      episode_id,
      version_number,
      label,
      author.id || 'usr_default',
      author.name || 'Editor',
      author.avatar || '',
      change_summary,
      serializedData,
      now
    );

    // Prune sqlite database snapshots to keep only top 20 latest versions
    try {
      this.db.prepare(`
        DELETE FROM timeline_snapshots 
        WHERE episode_id = ? AND id NOT IN (
          SELECT id FROM timeline_snapshots WHERE episode_id = ? ORDER BY version_number DESC LIMIT 20
        )
      `).run(episode_id, episode_id);
    } catch {}

    return { version_id, version_number, updated_at: now };
  }

  async getLatestTimeline(episodeId: string): Promise<IProject | null> {
    if (this.isFallback) {
      const snap = this.timelineSnapshotsStore.find((s) => s.episode_id === episodeId);
      if (!snap) return null;
      return normalizePureTimeline(snap.timeline_data);
    }

    const row = this.db.prepare(
      'SELECT * FROM timeline_snapshots WHERE episode_id = ? ORDER BY version_number DESC LIMIT 1'
    ).get(episodeId) as any;

    if (!row) return null;
    return normalizePureTimeline(row.timeline_data);
  }

  async getTimelineHistory(episodeId: string, limit = 20, offset = 0): Promise<{ total: number; history: TimelineSnapshotHistoryItem[] }> {
    if (this.isFallback) {
      const snaps = this.timelineSnapshotsStore.filter((s) => s.episode_id === episodeId);
      const paged = snaps.slice(offset, offset + limit).map((s) => ({
        version_id: s.id,
        version_number: s.version_number,
        label: s.label,
        author: {
          userId: s.author_id,
          name: s.author_name,
          avatar: s.author_avatar,
        },
        change_summary: s.change_summary,
        created_at: s.created_at,
      }));
      return { total: snaps.length, history: paged };
    }

    const totalRow = this.db!.prepare('SELECT COUNT(*) as count FROM timeline_snapshots WHERE episode_id = ?').get(episodeId) as { count?: number };
    const total = totalRow?.count || 0;

    const rows = this.db!.prepare(
      'SELECT * FROM timeline_snapshots WHERE episode_id = ? ORDER BY version_number DESC LIMIT ? OFFSET ?'
    ).all(episodeId, limit, offset) as Array<{
      id: string;
      version_number: number;
      label?: string;
      author_id?: string;
      author_name?: string;
      author_avatar?: string;
      change_summary?: string;
      created_at: string;
    }>;

    const history: TimelineSnapshotHistoryItem[] = rows.map((r) => ({
      version_id: r.id,
      version_number: r.version_number,
      label: r.label,
      author: {
        userId: r.author_id,
        name: r.author_name,
        avatar: r.author_avatar,
      },
      change_summary: r.change_summary,
      created_at: r.created_at,
    }));

    return { total, history };
  }

  async getTimelineVersion(episodeId: string, versionId: string): Promise<TimelineSnapshotVersion | null> {
    if (this.isFallback) {
      const snap = this.timelineSnapshotsStore.find((s) => s.episode_id === episodeId && s.id === versionId);
      if (!snap) return null;
      return {
        version_id: snap.id,
        version_number: snap.version_number,
        author: { userId: snap.author_id, name: snap.author_name },
        change_summary: snap.change_summary,
        created_at: snap.created_at,
        timeline_data: normalizePureTimeline(snap.timeline_data),
      };
    }

    const row = this.db!.prepare('SELECT * FROM timeline_snapshots WHERE episode_id = ? AND id = ?').get(episodeId, versionId) as {
      id: string;
      version_number: number;
      author_id?: string;
      author_name?: string;
      change_summary?: string;
      created_at: string;
      timeline_data: string;
    } | undefined;
    if (!row) return null;
    return {
      version_id: row.id,
      version_number: row.version_number,
      author: { userId: row.author_id, name: row.author_name },
      change_summary: row.change_summary,
      created_at: row.created_at,
      timeline_data: normalizePureTimeline(row.timeline_data),
    };
  }

  async restoreTimelineVersion(
    episode_id: string,
    version_id: string,
    author: { id: string; name: string; avatar?: string },
    reason = 'Restored version'
  ): Promise<RestoreTimelineResult> {
    const version = await this.getTimelineVersion(episode_id, version_id);
    if (!version) throw new Error('Version snapshot not found');

    const saveRes = await this.saveTimeline(
      episode_id,
      version.timeline_data,
      author,
      `Restored from ${version.version_id}: ${reason}`
    );

    return {
      success: true,
      restored_from_version_id: version_id,
      new_version_id: saveRes.version_id,
      new_version_number: saveRes.version_number,
      active_timeline: version.timeline_data,
      created_at: saveRes.updated_at,
    };
  }

  private assetsStore: any[] = [];

  async saveAsset(asset: any): Promise<any> {
    const idx = this.assetsStore.findIndex((a) => a.id === asset.id);
    if (idx !== -1) {
      this.assetsStore[idx] = { ...this.assetsStore[idx], ...asset };
      return this.assetsStore[idx];
    } else {
      this.assetsStore.unshift(asset);
      return asset;
    }
  }

  async getAssets(filter?: { userId?: string; user_id?: string; seriesId?: string; series_id?: string; episodeId?: string; episode_id?: string; sceneId?: string; scene_id?: string; type?: string; characterId?: string; character_id?: string; search?: string }): Promise<any[]> {
    let filtered = [...this.assetsStore];
    const uId = filter?.userId || filter?.user_id;
    if (uId) filtered = filtered.filter(a => a.userId === uId || a.user_id === uId);
    const sId = filter?.seriesId || filter?.series_id;
    if (sId) filtered = filtered.filter(a => a.seriesId === sId || a.series_id === sId);
    const epId = filter?.episodeId || filter?.episode_id;
    if (epId) filtered = filtered.filter(a => (a as any).episodeId === epId || a.episode_id === epId);
    const scId = filter?.sceneId || filter?.scene_id;
    if (scId) filtered = filtered.filter(a => (a as any).sceneId === scId || a.scene_id === scId);
    if (filter?.type && filter.type !== 'all') filtered = filtered.filter(a => a.type?.toLowerCase() === filter.type?.toLowerCase());
    const cId = filter?.characterId || filter?.character_id;
    if (cId) filtered = filtered.filter(a => a.characterId === cId || a.character_id === cId);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter(a => a.name?.toLowerCase().includes(q) || a.categoryLabel?.toLowerCase().includes(q) || a.prompt?.toLowerCase().includes(q));
    }
    return filtered;
  }

  async getAssetById(id: string): Promise<AssetEntity | null> {
    const a = this.assetsStore.find(item => item.id === id);
    return a ? { ...a } : null;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const prevLen = this.assetsStore.length;
    this.assetsStore = this.assetsStore.filter((a) => a.id !== id);
    return this.assetsStore.length < prevLen;
  }

  async getSystemSetting<T = any>(key: string): Promise<T | null> {
    if (this.isFallback) {
      return this.systemSettingsStore.has(key) ? this.systemSettingsStore.get(key) : null;
    }
    try {
      const row = this.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as any;
      if (!row) return null;
      return JSON.parse(row.value);
    } catch {
      return this.systemSettingsStore.has(key) ? this.systemSettingsStore.get(key) : null;
    }
  }

  async saveSystemSetting<T = any>(key: string, value: T): Promise<void> {
    this.systemSettingsStore.set(key, value);
    if (this.isFallback) return;

    try {
      this.db.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(key, JSON.stringify(value));
    } catch {}
  }

  // ==================== Worker Telemetry & Monitoring ====================
  async recordWorkerHeartbeat(heartbeat: WorkerHeartbeatEntity): Promise<void> {
    const id = heartbeat.worker_id || (heartbeat as any).workerId || `worker_${nanoid(8)}`;
    this.workerHeartbeatsStore.set(id, {
      ...heartbeat,
      worker_id: id,
      last_heartbeat: heartbeat.last_heartbeat || (heartbeat as any).lastHeartbeat || new Date().toISOString(),
    });
  }

  async getWorkerNodes(options?: { activeOnly?: boolean }): Promise<WorkerHeartbeatEntity[]> {
    const now = Date.now();
    const result: WorkerHeartbeatEntity[] = [];

    for (const [id, w] of Array.from(this.workerHeartbeatsStore.entries())) {
      const raw: any = w;
      const last = raw.last_heartbeat || raw.lastHeartbeat || raw.timestamp || 0;
      const ageMs = last ? (now - new Date(last).getTime()) : Infinity;
      const status = ageMs > 90000 ? 'OFFLINE' : (raw.status || 'ONLINE');

      // Auto-prune dead workers older than 10 minutes
      if (ageMs > 10 * 60 * 1000) {
        this.workerHeartbeatsStore.delete(id);
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

  async pruneOfflineWorkers(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, w] of Array.from(this.workerHeartbeatsStore.entries())) {
      const raw: any = w;
      const last = raw.last_heartbeat || raw.lastHeartbeat || raw.timestamp || 0;
      const ageMs = last ? (now - new Date(last).getTime()) : Infinity;
      if (ageMs > 90000 || raw.status === 'OFFLINE') {
        this.workerHeartbeatsStore.delete(id);
        count++;
      }
    }
    return count;
  }

  async recordWorkerJob(job: WorkerJobEntity): Promise<void> {
    const id = job.job_id || (job as any).jobId || `job_${nanoid(10)}`;
    const existing = this.workerJobsStore.get(id) || {};
    const updated: WorkerJobEntity = {
      ...existing,
      ...job,
      job_id: id,
      submitted_at: job.submitted_at || (job as any).submittedAt || (existing as any).submitted_at || (existing as any).submittedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workerJobsStore.set(id, updated);
  }

  async getWorkerJobs(filter?: { status?: string; limit?: number }): Promise<WorkerJobEntity[]> {
    let list = Array.from(this.workerJobsStore.values());
    if (filter?.status) {
      const targetStatus = filter.status.toUpperCase();
      list = list.filter(j => j.status?.toUpperCase() === targetStatus);
    }
    list.sort((a, b) => new Date(b.updated_at || (b as any).updatedAt || b.submitted_at || (b as any).submittedAt || 0).getTime() - new Date(a.updated_at || (a as any).updatedAt || a.submitted_at || (a as any).submittedAt || 0).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  async getClusterMetrics(): Promise<ClusterMetricsSummary> {
    const workers = await this.getWorkerNodes();
    const activeWorkers = workers.filter(w => w.status === 'ONLINE' || w.status === 'BUSY' || w.status === 'IDLE');
    const jobs = Array.from(this.workerJobsStore.values());
    const activeJobs = jobs.filter(j => j.status === 'RENDERING' || j.status === 'COMPOSITING');
    const queuedJobs = jobs.filter(j => j.status === 'QUEUED');
    const completedJobs = jobs.filter(j => j.status === 'COMPLETED');
    const failedJobs = jobs.filter(j => j.status === 'FAILED');

    const avgCpu = activeWorkers.length > 0
      ? Math.round(activeWorkers.reduce((acc, w) => acc + (w.cpu_usage_pct || (w as any).cpuUsagePct || 0), 0) / activeWorkers.length)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE BACKGROUND JOBS
  // ═══════════════════════════════════════════════════════════════════════════
  private pipelineJobsStore: Map<string, any> = new Map();

  async savePipelineJob(job: any): Promise<any> {
    const jobData = {
      ...job,
      created_at: job.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (this.isFallback || !this.db) {
      this.pipelineJobsStore.set(job.id, jobData);
      return jobData;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO pipeline_jobs (
          id, user_id, series_id, episode_id, session_id, type, title, status,
          progress, current_step, step_progress, outputs, logs, error, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        jobData.id,
        jobData.user_id,
        jobData.series_id,
        jobData.episode_id,
        jobData.session_id || null,
        jobData.type,
        jobData.title,
        jobData.status || 'queued',
        jobData.progress || 0,
        jobData.current_step || '',
        JSON.stringify(jobData.step_progress || {}),
        JSON.stringify(jobData.outputs || {}),
        JSON.stringify(jobData.logs || []),
        jobData.error || null,
        jobData.created_at,
        jobData.updated_at,
        jobData.completed_at || null
      );
      return jobData;
    } catch (err: any) {
      this.pipelineJobsStore.set(job.id, jobData);
      return jobData;
    }
  }

  async getPipelineJobById(jobId: string): Promise<any | null> {
    if (this.isFallback || !this.db) {
      return this.pipelineJobsStore.get(jobId) || null;
    }

    try {
      const row = this.db.prepare('SELECT * FROM pipeline_jobs WHERE id = ?').get(jobId) as Record<string, any> | undefined;
      if (!row) return this.pipelineJobsStore.get(jobId) || null;
      return {
        ...row,
        step_progress: typeof row.step_progress === 'string' ? JSON.parse(row.step_progress) : (row.step_progress || {}),
        outputs: typeof row.outputs === 'string' ? JSON.parse(row.outputs) : (row.outputs || {}),
        logs: typeof row.logs === 'string' ? JSON.parse(row.logs) : (row.logs || []),
      };
    } catch (err: any) {
      return this.pipelineJobsStore.get(jobId) || null;
    }
  }

  async getPipelineJobs(filter?: { userId?: string; user_id?: string; seriesId?: string; series_id?: string; episodeId?: string; episode_id?: string; status?: string; limit?: number }): Promise<any[]> {
    const uid = filter?.userId || filter?.user_id;
    const sid = filter?.seriesId || filter?.series_id;
    const eid = filter?.episodeId || filter?.episode_id;

    if (this.isFallback || !this.db) {
      let list = Array.from(this.pipelineJobsStore.values());
      if (uid) list = list.filter(j => j.user_id === uid);
      if (sid) list = list.filter(j => j.series_id === sid);
      if (eid) list = list.filter(j => j.episode_id === eid);
      if (filter?.status) list = list.filter(j => j.status?.toLowerCase() === filter.status?.toLowerCase());
      list.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
      if (filter?.limit) list = list.slice(0, filter.limit);
      return list;
    }

    try {
      const conditions: string[] = [];
      const params: any[] = [];
      if (uid) { conditions.push('user_id = ?'); params.push(uid); }
      if (sid) { conditions.push('series_id = ?'); params.push(sid); }
      if (eid) { conditions.push('episode_id = ?'); params.push(eid); }
      if (filter?.status) { conditions.push('status = ?'); params.push(filter.status); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filter?.limit ? `LIMIT ${filter.limit}` : '';
      const rows = this.db.prepare(`SELECT * FROM pipeline_jobs ${where} ORDER BY updated_at DESC ${limit}`).all(...params);

      return rows.map((row: any) => ({
        ...row,
        step_progress: typeof row.step_progress === 'string' ? JSON.parse(row.step_progress) : (row.step_progress || {}),
        outputs: typeof row.outputs === 'string' ? JSON.parse(row.outputs) : (row.outputs || {}),
        logs: typeof row.logs === 'string' ? JSON.parse(row.logs) : (row.logs || []),
      }));
    } catch (err: any) {
      return Array.from(this.pipelineJobsStore.values());
    }
  }

  async updatePipelineJob(jobId: string, patch: Partial<any>): Promise<any | null> {
    const existing = await this.getPipelineJobById(jobId);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    return await this.savePipelineJob(updated);
  }

  async deletePipelineJob(jobId: string): Promise<boolean> {
    this.pipelineJobsStore.delete(jobId);
    if (!this.db) return true;
    try {
      this.db.prepare('DELETE FROM pipeline_jobs WHERE id = ?').run(jobId);
      return true;
    } catch {
      return false;
    }
  }

  async findActivePipelineJob(seriesId: string, episodeId: string, type?: string): Promise<any | null> {
    const jobs = await this.getPipelineJobs({ seriesId, episodeId });
    const active = jobs.find(j => (j.status === 'running' || j.status === 'queued') && (!type || j.type === type));
    return active || null;
  }

  // ─── Viral Trends Storage & Persistence ───────────────────────────────────
  private viralTrendsStore: Map<string, { country: string; language: string; items: any[]; updated_at: Date }> = new Map();

  async getViralTrends(country: string, language: string): Promise<{ items: any[]; updated_at: Date } | null> {
    const key = `${country.toUpperCase()}_${language.toLowerCase()}`;
    const found = this.viralTrendsStore.get(key);
    return found ? { items: found.items, updated_at: found.updated_at } : null;
  }

  async saveViralTrends(country: string, language: string, items: any[]): Promise<void> {
    const key = `${country.toUpperCase()}_${language.toLowerCase()}`;
    this.viralTrendsStore.set(key, {
      country: country.toUpperCase(),
      language: language.toLowerCase(),
      items: items || [],
      updated_at: new Date(),
    });
  }

  async getAllCachedViralTrends(): Promise<Array<{ cache_key: string; country: string; language: string; items: any[]; updated_at: Date }>> {
    return Array.from(this.viralTrendsStore.entries()).map(([cache_key, val]) => ({
      cache_key,
      country: val.country,
      language: val.language,
      items: val.items,
      updated_at: val.updated_at,
    }));
  }

  // ─── Social Connected Accounts ───────────────────────────────────────────
  private socialAccountsStore: Map<string, SocialAccountEntity> = new Map();

  async updateSocialAccount(account: Partial<SocialAccountEntity>): Promise<SocialAccountEntity> {
    const user_id = account.user_id || '';
    const platform = account.platform || '';
    const channel_id = account.channel_id || '';
    const key = `${user_id}_${platform}_${channel_id}`;
    const existing = this.socialAccountsStore.get(key) || {
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
    this.socialAccountsStore.set(key, updated);
    return updated;
  }

  async listSocialAccounts(user_id: string): Promise<SocialAccountEntity[]> {
    return Array.from(this.socialAccountsStore.values()).filter(a => a.user_id === user_id && a.is_active !== false);
  }

  async deleteSocialAccount(user_id: string, platform: string, channel_id?: string): Promise<boolean> {
    let deleted = false;
    for (const [key, a] of Array.from(this.socialAccountsStore.entries())) {
      if (a.user_id === user_id && a.platform === platform && (!channel_id || a.channel_id === channel_id)) {
        this.socialAccountsStore.delete(key);
        deleted = true;
      }
    }
    return deleted;
  }
}

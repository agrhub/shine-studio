import mongoose from 'mongoose';
import { nanoid } from 'nanoid';
import {
  IDatabaseProvider
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
import { normalizePureTimeline } from '../utils/timeline.js';

const ChatMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true, index: true },
  session_id: { type: String, required: true, index: true },
  scope: { type: String, default: 'global' },
  series_id: String,
  episode_id: String,
  role: { type: String, required: true },
  content: { type: String, required: true },
  tool_calls: mongoose.Schema.Types.Mixed,
  suggestions: mongoose.Schema.Types.Mixed,
  created_at: { type: String, default: () => new Date().toISOString() },
  timestamp: { type: Number, index: true },
});
ChatMessageSchema.index({ user_id: 1, session_id: 1, timestamp: 1 });
export const ChatMessageModel = mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema);

const WorkerHeartbeatSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true },
  workerName: String,
  serviceName: String,
  region: String,
  status: String,
  cpuUsagePct: Number,
  memoryUsageMb: Number,
  activeJobsCount: Number,
  completedJobsCount: Number,
  failedJobsCount: Number,
  lastHeartbeat: { type: Date, default: Date.now },
  metadata: mongoose.Schema.Types.Mixed,
});
const WorkerHeartbeatModel = mongoose.models.WorkerHeartbeat || mongoose.model('WorkerHeartbeat', WorkerHeartbeatSchema);

const WorkerJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  workerId: String,
  workerName: String,
  serviceName: String,
  seriesId: String,
  seriesTitle: String,
  episodeId: String,
  progress: Number,
  status: String,
  downloadUrl: String,
  outputUrl: String,
  error: String,
  renderTimeMs: Number,
  fileSize: Number,
  submittedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const WorkerJobModel = mongoose.models.WorkerJob || mongoose.model('WorkerJob', WorkerJobSchema);

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password_hash: String,
  name: String,
  avatar: String,
  role: { type: String, default: 'user' },
  api_key: String,
  api_key_rotated_at: String,
  two_factor_enabled: { type: Boolean, default: false },
  integrations: [mongoose.Schema.Types.Mixed],
  connected_channels: [mongoose.Schema.Types.Mixed],
  tier: { type: String, default: 'FREE' },
  credits: { type: Number, default: 100 },
  theme: { type: String, default: 'dark' },
  language: { type: String, default: 'en' },
  created_at: { type: Date, default: Date.now }
});

const SeriesSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  title: { type: String, required: true },
  genre: { type: String, required: true },
  visual_style: String,
  visual_style_prompt: String,
  synopsis: String,
  description: String,
  target_audience: String,
  country: String,
  language: String,
  ratio: String,
  viral_hook: String,
  master_plan: { type: mongoose.Schema.Types.Mixed },
  characters: [mongoose.Schema.Types.Mixed],
  locations: [mongoose.Schema.Types.Mixed],
  props: [mongoose.Schema.Types.Mixed],
  chat_history: [mongoose.Schema.Types.Mixed],
  episode_count: { type: Number, default: 20 },
  status: { type: String, default: 'DRAFT' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const EpisodeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  series_id: { type: String, required: true },
  episode_number: { type: Number, required: true },
  title: String,
  synopsis: String,
  screenplay: String,
  scene_core: String,
  conflict_escalation: String,
  phase: String,
  scenes: [mongoose.Schema.Types.Mixed],
  locations: [mongoose.Schema.Types.Mixed],
  props: [mongoose.Schema.Types.Mixed],
  languageTracks: [mongoose.Schema.Types.Mixed],
  script: String,
  thumbnail_url: String,
  cover_image: String,
  duration: { type: Number, default: 90 },
  status: { type: String, default: 'DRAFT' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  strict: false,
});

const FlowAccountSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  session_token: { type: String, required: true },
  access_token: String,
  project_id: String,
  status: { type: String, default: 'ACTIVE' },
  credits_remaining: { type: Number, default: 100 },
  last_synced_at: { type: Date, default: Date.now }
});

const TimelineSnapshotSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  episode_id: { type: String, required: true, index: true },
  version_number: { type: Number, required: true },
  label: String,
  author_id: { type: String, required: true },
  author_name: { type: String, required: true },
  author_avatar: String,
  change_summary: String,
  timeline_data: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const SystemSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updated_at: { type: Date, default: Date.now }
});

const CreditTransactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true, index: true },
  activity: { type: String, required: true },
  details: String,
  amount: { type: Number, required: true },
  balance_after: { type: Number, required: true },
  status: { type: String, default: 'Success' },
  created_at: { type: Date, default: Date.now }
});

const SocialAccountSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  platform: { type: String, required: true },
  channel_id: { type: String, required: true },
  channel_name: { type: String, required: true },
  channel_avatar_url: { type: String },
  access_token: { type: String, required: true },
  refresh_token: { type: String },
  token_expires_at: { type: Date },
  scopes: { type: [String], default: [] },
  is_active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const AssetSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: { type: String, default: 'usr_default' },
  name: { type: String, required: true },
  type: { type: String, required: true },
  ext: String,
  size: String,
  size_bytes: Number,
  category_label: String,
  category_color: String,
  s3_key: String,
  url: { type: String, required: true },
  thumbnail: String,
  series_id: String,
  episode_id: String,
  scene_id: String,
  character_id: String,
  prompt: String,
  provider: String,
  aspect: String,
  is_video: Boolean,
  is_audio: Boolean,
  synth_id_verified: Boolean,
  synth_id_hash: String,
  synth_id_metadata: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now }
});

SocialAccountSchema.index({ user_id: 1, platform: 1, channel_id: 1 }, { unique: true });
// export const SocialAccountModel = mongoose.models.SocialAccount || mongoose.model('SocialAccount', SocialAccountSchema);

const AIAccountSchema = new mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  avatar_url: { type: String },
  account_type: { type: String, required: true },
  status: { type: String, default: 'READY' },
  flow_st: { type: String },
  flow_at: { type: String },
  flow_at_expires_at: { type: Date },
  project_id: { type: String },
  credits: { type: Number, default: 0 },
  error_message: { type: String },
  last_fingerprint: { type: Map, of: String },
  service_keys: { type: Map, of: String },
  is_active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const ViralTrendSchema = new mongoose.Schema({
  cache_key: { type: String, required: true, unique: true, index: true },
  country: { type: String, required: true, index: true },
  language: { type: String, required: true, index: true },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  updated_at: { type: Date, default: Date.now, index: true }
});

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
export const SeriesModel = mongoose.models.Series || mongoose.model('Series', SeriesSchema);
export const EpisodeModel = mongoose.models.Episode || mongoose.model('Episode', EpisodeSchema);
export const FlowAccountModel = mongoose.models.FlowAccount || mongoose.model('FlowAccount', FlowAccountSchema);
export const TimelineSnapshotModel = mongoose.models.TimelineSnapshot || mongoose.model('TimelineSnapshot', TimelineSnapshotSchema);
export const SystemSettingModel = mongoose.models.SystemSetting || mongoose.model('SystemSetting', SystemSettingSchema);
export const CreditTransactionModel = mongoose.models.CreditTransaction || mongoose.model('CreditTransaction', CreditTransactionSchema);
export const SocialAccountModel = mongoose.models.SocialAccount || mongoose.model('SocialAccount', SocialAccountSchema);
export const AssetModel = mongoose.models.Asset || mongoose.model('Asset', AssetSchema);
export const AIAccountModel = mongoose.models.AIAccount || mongoose.model('AIAccount', AIAccountSchema);
export const ViralTrendModel = mongoose.models.ViralTrend || mongoose.model('ViralTrend', ViralTrendSchema);
export const AIAccount = AIAccountModel;
export const SocialAccount = SocialAccountModel;
export const Asset = AssetModel;
export const ViralTrend = ViralTrendModel;

import { EnvConfig } from '@/config/env.js';

import dns from 'dns';

export class MongoDBProvider implements IDatabaseProvider {
  private mongoUri: string;

  constructor() {
    this.mongoUri = EnvConfig.mongoUri;
  }

  async initialize(): Promise<void> {
    if (mongoose.connection.readyState < 1) {
      try {
        // Fix Node.js Windows SRV lookup issue (querySrv ECONNREFUSED)
        if (this.mongoUri.startsWith('mongodb+srv://')) {
          try {
            dns.setServers(['8.8.8.8', '1.1.1.1']);
          } catch {}
        }

        console.log('[MongoDBProvider] url:', this.mongoUri);
        await mongoose.connect(this.mongoUri, {
          serverSelectionTimeoutMS: 5000,
        });
        console.log('[MongoDBProvider] Connected to MongoDB at:', this.mongoUri);
      } catch (err: any) {
        // Disconnect immediately to stop Mongoose buffering
        try { await mongoose.disconnect(); } catch {}
        throw err;
      }
    }
  }

  async createUser(user: UserEntity): Promise<UserEntity> {
    const created = await UserModel.create(user);
    return created.toObject() as any;
  }

  async getUserByEmail(email: string): Promise<UserEntity | null> {
    return (await UserModel.findOne({ email }).lean()) as any;
  }

  async getUserById(id: string): Promise<UserEntity | null> {
    return (await UserModel.findOne({ id }).lean()) as any;
  }

  async countUsers(): Promise<number> {
    return await UserModel.countDocuments();
  }

  async getUsers(filter?: {
    search?: string;
    tier?: string;
    role?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    const query: any = {};
    if (filter?.search) {
      const regex = new RegExp(filter.search.trim(), 'i');
      query.$or = [{ name: regex }, { email: regex }, { id: regex }];
    }
    if (filter?.tier) {
      query.tier = new RegExp(`^${filter.tier.trim()}$`, 'i');
    }
    if (filter?.role) {
      query.role = new RegExp(`^${filter.role.trim()}$`, 'i');
    }
    if (filter?.status) {
      query.status = new RegExp(`^${filter.status.trim()}$`, 'i');
    }

    const total = await UserModel.countDocuments(query);
    const limit = filter?.limit || 20;
    const offset = filter?.offset || 0;
    const users = (await UserModel.find(query).sort({ created_at: -1 }).skip(offset).limit(limit).lean()) as any[];

    return { users, total };
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await UserModel.deleteOne({ id: userId });
    return result.deletedCount > 0;
  }

  async updateUserPreferences(userId: string, prefs: { theme?: string; language?: string }): Promise<UserEntity | null> {
    const updated = await UserModel.findOneAndUpdate({ id: userId }, { $set: prefs }, { new: true, returnDocument: 'after' }).lean();
    return updated as any;
  }

  async updateUser(user: UserEntity): Promise<UserEntity> {
    const updated = await UserModel.findOneAndUpdate({ id: user.id }, { $set: user }, { new: true, returnDocument: 'after', upsert: true }).lean();
    return updated as any;
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
    await ChatMessageModel.findOneAndUpdate(
      { id: msgId },
      { $set: entity },
      { upsert: true, returnDocument: 'after' }
    );
    return entity;
  }

  async saveChatMessages(messages: ChatMessageEntity[]): Promise<void> {
    if (!messages || messages.length === 0) return;
    const ops = messages.map(m => {
      const msgId = m.id || `msg_${Date.now()}_${nanoid(6)}`;
      const entity = {
        ...m,
        id: msgId,
        created_at: m.created_at || new Date().toISOString(),
        timestamp: m.timestamp || Date.now(),
      };
      return {
        updateOne: {
          filter: { id: msgId },
          update: { $set: entity },
          upsert: true,
        },
      };
    });
    await ChatMessageModel.bulkWrite(ops);
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
    const q: any = { user_id: filter.userId };
    if (filter.sessionId) q.session_id = filter.sessionId;
    if (filter.seriesId) q.series_id = filter.seriesId;
    if (filter.episodeId) q.episode_id = filter.episodeId;
    if (filter.scope) q.scope = filter.scope;

    const total = await ChatMessageModel.countDocuments(q);
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset || 0;

    let rows: any[];
    if (offset > 0) {
      rows = await ChatMessageModel.find(q).sort({ timestamp: 1 }).skip(offset).limit(limit).lean();
    } else {
      // Top latest history slice
      const skipCount = Math.max(0, total - limit);
      rows = await ChatMessageModel.find(q).sort({ timestamp: 1 }).skip(skipCount).limit(limit).lean();
    }

    return { messages: rows as any, total };
  }

  async deleteChatSession(userId: string, sessionId: string): Promise<boolean> {
    const res = await ChatMessageModel.deleteMany({ user_id: userId, session_id: sessionId });
    return (res?.deletedCount || 0) > 0;
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
    const filter: any = {};
    if (userId) filter.user_id = userId;
    return (await CreditTransactionModel.find(filter).sort({ created_at: -1 }).limit(limit).lean()) as any;
  }

  async recordCreditTransaction(tx: CreditTransactionEntity): Promise<CreditTransactionEntity> {
    const created = await CreditTransactionModel.create(tx);
    return created.toObject() as any;
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
    const created = await SeriesModel.create(series);
    return created.toObject() as any;
  }

  async getSeriesList(userId?: string, search?: string, status?: string): Promise<SeriesEntity[]> {
    const filter: any = {
      id: { $nin: ['global', /^wiz_/, /^temp_/] }
    };
    if (userId) filter.user_id = userId;
    if (search) filter.title = { $regex: search, $options: 'i' };
    if (status) filter.status = status;
    return (await SeriesModel.find(filter).sort({ created_at: -1 }).lean()) as any;
  }

  async getSeriesById(id: string): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    return (await SeriesModel.findOne({ id }).lean()) as any;
  }

  async updateSeries(id: string, updates: Partial<SeriesEntity>): Promise<SeriesEntity | null> {
    if (!id || id === 'global' || id.startsWith('wiz_') || id.startsWith('temp_')) return null;
    const updated = await SeriesModel.findOneAndUpdate({ id }, { $set: { ...updates, updated_at: new Date() } }, { new: true, returnDocument: 'after' }).lean();
    return updated as any;
  }

  async deleteSeries(id: string): Promise<boolean> {
    try {
      const episodes = await EpisodeModel.find({ series_id: id }).lean();
      const epIds = episodes.map((e: any) => e.id);

      if (epIds.length > 0) {
        await TimelineSnapshotModel.deleteMany({ episode_id: { $in: epIds } });
        await ChatMessageModel.deleteMany({ episode_id: { $in: epIds } });
        await WorkerJobModel.deleteMany({ episodeId: { $in: epIds } });
      }

      await EpisodeModel.deleteMany({ series_id: id });
      await ChatMessageModel.deleteMany({ series_id: id });
      await AssetModel.deleteMany({ series_id: id });
      await WorkerJobModel.deleteMany({ seriesId: id });

      const res = await SeriesModel.deleteOne({ id });
      return (res?.deletedCount || 0) > 0;
    } catch {
      return false;
    }
  }

  private async syncSeriesEpisodeCounters(seriesId: string): Promise<void> {
    if (!seriesId || seriesId === 'global' || seriesId.startsWith('wiz_') || seriesId.startsWith('temp_')) return;
    try {
      const episodes = (await EpisodeModel.find({ series_id: seriesId }).lean()) as any[];
      const episode_count = episodes.length;
      const published_episode_count = episodes.filter(e => e.status === 'PUBLISHED').length;

      await SeriesModel.findOneAndUpdate(
        { id: seriesId },
        {
          $set: {
            episode_count,
            published_episode_count,
            updated_at: new Date(),
          },
        }
      );
    } catch (err: any) {
      console.warn(`[MongoDBProvider] Failed to sync series episode counters for ${seriesId}:`, err?.message);
    }
  }

  async createEpisode(episode: EpisodeEntity): Promise<EpisodeEntity> {
    const created = await EpisodeModel.create(episode);
    if (episode.series_id) {
      await this.syncSeriesEpisodeCounters(episode.series_id);
    }
    return created.toObject() as any;
  }

  async getEpisodesBySeriesId(seriesId: string): Promise<EpisodeEntity[]> {
    return (await EpisodeModel.find({ series_id: seriesId }).sort({ episode_number: 1 }).lean()) as any;
  }

  async getEpisodeById(id: string): Promise<EpisodeEntity | null> {
    const ep = await EpisodeModel.findOne({ id }).lean();
    return ep as any;
  }

  async updateEpisode(id: string, updates: Partial<EpisodeEntity>): Promise<EpisodeEntity | null> {
    const updated = (await EpisodeModel.findOneAndUpdate(
      { id }, 
      { $set: { ...updates, updated_at: new Date().toISOString() } }, 
      { new: true, returnDocument: 'after' }
    ).lean()) as any;
    if (updated?.series_id && (updates.status !== undefined || updates.published_urls !== undefined || updates.published_platforms !== undefined)) {
      await this.syncSeriesEpisodeCounters(updated.series_id);
    }
    return updated;
  }

  async deleteEpisode(id: string): Promise<boolean> {
    try {
      const ep = (await EpisodeModel.findOne({ id }).lean()) as any;
      const seriesId = ep?.series_id;
      await TimelineSnapshotModel.deleteMany({ episode_id: id });
      await ChatMessageModel.deleteMany({ episode_id: id });
      await WorkerJobModel.deleteMany({ episodeId: id });
      await AssetModel.deleteMany({ episode_id: id });
      const res = await EpisodeModel.deleteOne({ id });
      if (seriesId) {
        await this.syncSeriesEpisodeCounters(seriesId);
      }
      return (res?.deletedCount || 0) > 0;
    } catch {
      return false;
    }
  }

  async getFlowAccounts(status?: string): Promise<FlowAccountEntity[]> {
    if (mongoose.connection.readyState < 1) return [];
    const filter: any = {};
    if (status) filter.status = status;
    return (await FlowAccountModel.find(filter).sort({ credits_remaining: -1 }).lean()) as any;
  }

  async upsertFlowAccount(account: FlowAccountEntity): Promise<FlowAccountEntity> {
    if (mongoose.connection.readyState < 1) return account;
    const { id, ...updateFields } = account;
    const updated = await FlowAccountModel.findOneAndUpdate(
      { email: account.email },
      {
        $set: updateFields,
        $setOnInsert: { id: id || `flow_${Date.now()}` },
      },
      { upsert: true, new: true, returnDocument: 'after' }
    ).lean();
    return updated as any;
  }

  async deleteFlowAccount(idOrEmail: string): Promise<boolean> {
    if (mongoose.connection.readyState < 1) return true;
    const isObjectId = mongoose.Types.ObjectId.isValid(idOrEmail);
    const filter = isObjectId
      ? { $or: [{ _id: idOrEmail }, { id: idOrEmail }, { email: idOrEmail }] }
      : { $or: [{ id: idOrEmail }, { email: idOrEmail }] };
    await FlowAccountModel.deleteMany(filter);
    await AIAccountModel.deleteMany(filter);
    return true;
  }

  async saveTimeline(
    episode_id: string,
    timeline_data: IProject,
    author: { id: string; name: string; avatar?: string },
    change_summary = 'Timeline updated'
  ): Promise<{ version_id: string; version_number: number; updated_at: string }> {
    const version_id = `ver_${Math.random().toString(36).substring(2, 10)}`;
    const history = await this.getTimelineHistory(episode_id, 1, 0);
    const version_number = history.total + 1;
    const label = `v1.${version_number} - ${change_summary}`;
    const pureTimeline = normalizePureTimeline(timeline_data);
    const serializedData = JSON.stringify(pureTimeline);

    const doc = await TimelineSnapshotModel.create({
      id: version_id,
      episode_id,
      version_number,
      label,
      author_id: author.id || 'usr_default',
      author_name: author.name || 'Editor',
      author_avatar: author.avatar || '',
      change_summary,
      timeline_data: serializedData,
      created_at: new Date(),
    });

    // Prune older snapshots beyond top 20 latest versions
    try {
      const excessSnaps = await TimelineSnapshotModel.find({ episode_id })
        .sort({ version_number: -1 })
        .skip(20)
        .select('_id')
        .lean();
      if (excessSnaps.length > 0) {
        await TimelineSnapshotModel.deleteMany({ _id: { $in: excessSnaps.map((s: any) => s._id) } });
      }
    } catch {}

    return { version_id, version_number, updated_at: doc.created_at.toISOString() };
  }

  async getLatestTimeline(episodeId: string): Promise<IProject | null> {
    const snap: any = await TimelineSnapshotModel.findOne({ episode_id: episodeId }).sort({ version_number: -1 }).lean();
    if (!snap) return null;
    return normalizePureTimeline(snap.timeline_data);
  }

  async getTimelineHistory(episodeId: string, limit = 20, offset = 0): Promise<{ total: number; history: TimelineSnapshotHistoryItem[] }> {
    const total = await TimelineSnapshotModel.countDocuments({ episode_id: episodeId });
    const docs: Array<{
      id: string;
      version_number: number;
      label?: string;
      author_id?: string;
      author_name?: string;
      author_avatar?: string;
      change_summary?: string;
      created_at?: Date | string;
    }> = await TimelineSnapshotModel.find({ episode_id: episodeId })
      .sort({ version_number: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const history: TimelineSnapshotHistoryItem[] = docs.map((r) => ({
      version_id: r.id,
      version_number: r.version_number,
      label: r.label,
      author: {
        userId: r.author_id,
        name: r.author_name,
        avatar: r.author_avatar,
      },
      change_summary: r.change_summary,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : (typeof r.created_at === 'string' ? r.created_at : new Date().toISOString()),
    }));

    return { total, history };
  }

  async getTimelineVersion(episodeId: string, versionId: string): Promise<TimelineSnapshotVersion | null> {
    const doc: any = await TimelineSnapshotModel.findOne({ episode_id: episodeId, id: versionId }).lean();
    if (!doc) return null;
    return {
      version_id: doc.id,
      version_number: doc.version_number,
      author: { userId: doc.author_id, name: doc.author_name },
      change_summary: doc.change_summary,
      created_at: doc.created_at?.toISOString ? doc.created_at.toISOString() : doc.created_at,
      timeline_data: normalizePureTimeline(doc.timeline_data),
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

  async saveAsset(asset: any): Promise<any> {
    if (mongoose.connection.readyState < 1) return asset;
    const doc = await AssetModel.findOneAndUpdate(
      { id: asset.id },
      { $set: { ...asset, created_at: asset.created_at || new Date() } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    return doc;
  }

  async getAssets(filter?: { user_id?: string; series_id?: string; episode_id?: string; scene_id?: string; type?: string; character_id?: string; search?: string }): Promise<any[]> {
    if (mongoose.connection.readyState < 1) return [];
    const query: any = {};
    if (filter?.user_id) query.user_id = filter.user_id;
    if (filter?.series_id) query.series_id = filter.series_id;
    if (filter?.episode_id) query.episode_id = filter.episode_id;
    if (filter?.scene_id) query.scene_id = filter.scene_id;
    if (filter?.type && filter.type !== 'all') query.type = filter.type;
    if (filter?.character_id) query.character_id = filter.character_id;
    if (filter?.search) {
      query.$or = [
        { name: { $regex: filter.search, $options: 'i' } },
        { category_label: { $regex: filter.search, $options: 'i' } },
        { prompt: { $regex: filter.search, $options: 'i' } },
      ];
    }
    const docs = await AssetModel.find(query).sort({ created_at: -1 }).lean();
    return docs;
  }

  async getAssetById(id: string): Promise<AssetEntity | null> {
    if (mongoose.connection.readyState < 1) return null;
    const a = await AssetModel.findOne({ id }).lean();
    return a as any;
  }

  async deleteAsset(id: string): Promise<boolean> {
    if (mongoose.connection.readyState < 1) return false;
    const res = await AssetModel.deleteOne({ id });
    return res.deletedCount > 0;
  }

  async getSystemSetting<T = any>(key: string): Promise<T | null> {
    if (mongoose.connection.readyState < 1) return null;
    const doc = await SystemSettingModel.findOne({ key }).lean();
    return doc ? (doc as any).value : null;
  }

  async saveSystemSetting<T = any>(key: string, value: T): Promise<void> {
    if (mongoose.connection.readyState < 1) return;
    await SystemSettingModel.findOneAndUpdate(
      { key },
      { $set: { key, value, updated_at: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  // ==================== Worker Telemetry & Monitoring ====================
  async recordWorkerHeartbeat(heartbeat: WorkerHeartbeatEntity): Promise<void> {
    if (mongoose.connection.readyState < 1) return;
    const id = heartbeat.worker_id || `worker_${nanoid(8)}`;
    await WorkerHeartbeatModel.findOneAndUpdate(
      { workerId: id },
      { $set: { ...heartbeat, worker_id: id, workerId: id, last_heartbeat: new Date(), lastHeartbeat: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  async getWorkerNodes(): Promise<WorkerHeartbeatEntity[]> {
    if (mongoose.connection.readyState < 1) return [];
    const docs = await WorkerHeartbeatModel.find({}).lean();
    const now = Date.now();
    return docs.map((w: any) => {
      const lastHeartbeatStr = w.last_heartbeat || w.lastHeartbeat ? new Date(w.last_heartbeat || w.lastHeartbeat).toISOString() : new Date().toISOString();
      const ageMs = now - new Date(lastHeartbeatStr).getTime();
      const status = ageMs > 120000 ? 'OFFLINE' : (w.status || 'ONLINE');
      return {
        worker_id: w.worker_id || w.workerId,
        worker_name: w.worker_name || w.workerName || w.worker_id || w.workerId,
        service_name: w.service_name || w.serviceName || 'shine-render-worker',
        region: w.region || 'us-central1',
        status,
        cpu_usage_pct: w.cpu_usage_pct ?? w.cpuUsagePct,
        memory_usage_mb: w.memory_usage_mb ?? w.memoryUsageMb,
        active_jobs_count: w.active_jobs_count ?? w.activeJobsCount,
        completed_jobs_count: w.completed_jobs_count ?? w.completedJobsCount,
        failed_jobs_count: w.failed_jobs_count ?? w.failedJobsCount,
        last_heartbeat: lastHeartbeatStr,
        metadata: w.metadata,
      };
    });
  }

  async recordWorkerJob(job: WorkerJobEntity): Promise<void> {
    if (mongoose.connection.readyState < 1) return;
    const id = job.job_id || `job_${nanoid(10)}`;
    await WorkerJobModel.findOneAndUpdate(
      { jobId: id },
      { $set: { ...job, job_id: id, jobId: id, updated_at: new Date(), updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  async getWorkerJobs(filter?: { status?: string; limit?: number }): Promise<WorkerJobEntity[]> {
    if (mongoose.connection.readyState < 1) return [];
    const query: any = {};
    if (filter?.status) query.status = filter.status.toUpperCase();
    let q = WorkerJobModel.find(query).sort({ updatedAt: -1, submittedAt: -1 });
    if (filter?.limit) q = q.limit(filter.limit);
    const docs = await q.lean();
    return docs.map((j: any): WorkerJobEntity => ({
      job_id: j.job_id || j.jobId,
      worker_id: j.worker_id || j.workerId,
      worker_name: j.worker_name || j.workerName,
      service_name: j.service_name || j.serviceName || 'shine-render-worker',
      series_id: j.series_id || j.seriesId,
      series_title: j.series_title || j.seriesTitle,
      episode_id: j.episode_id || j.episodeId,
      progress: j.progress || 0,
      status: j.status || 'QUEUED',
      download_url: j.download_url || j.downloadUrl,
      output_url: j.output_url || j.outputUrl,
      error: j.error,
      render_time_ms: j.render_time_ms ?? j.renderTimeMs,
      file_size: j.file_size ?? j.fileSize,
      submitted_at: j.submitted_at ? new Date(j.submitted_at).toISOString() : new Date().toISOString(),
      updated_at: j.updated_at ? new Date(j.updated_at).toISOString() : new Date().toISOString(),
    }));
  }

  async getClusterMetrics(): Promise<ClusterMetricsSummary> {
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
  private memoryPipelineJobs: Map<string, any> = new Map();

  async savePipelineJob(job: any): Promise<any> {
    const item = {
      ...job,
      created_at: job.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.memoryPipelineJobs.set(job.id, item);
    return item;
  }

  async getPipelineJobById(job_id: string): Promise<any | null> {
    return this.memoryPipelineJobs.get(job_id) || null;
  }

  async getPipelineJobs(filter?: { user_id?: string; series_id?: string; episode_id?: string; status?: string; limit?: number }): Promise<any[]> {
    let list = Array.from(this.memoryPipelineJobs.values());
    if (filter?.user_id) list = list.filter(j => j.user_id === filter.user_id);
    if (filter?.series_id) list = list.filter(j => j.series_id === filter.series_id);
    if (filter?.episode_id) list = list.filter(j => j.episode_id === filter.episode_id);
    if (filter?.status) list = list.filter(j => j.status?.toLowerCase() === filter.status?.toLowerCase());
    list.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);
    return list;
  }

  async updatePipelineJob(job_id: string, patch: Partial<any>): Promise<any | null> {
    const existing = await this.getPipelineJobById(job_id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.memoryPipelineJobs.set(job_id, updated);
    return updated;
  }

  async deletePipelineJob(job_id: string): Promise<boolean> {
    return this.memoryPipelineJobs.delete(job_id);
  }

  async findActivePipelineJob(series_id: string, episode_id: string, type?: string): Promise<any | null> {
    const jobs = await this.getPipelineJobs({ series_id, episode_id });
    return jobs.find(j => (j.status === 'running' || j.status === 'queued') && (!type || j.type === type)) || null;
  }

  // ─── Viral Trends Storage & Persistence ───────────────────────────────────

  async getViralTrends(country: string, language: string): Promise<{ items: any[]; updated_at: Date } | null> {
    try {
      const cache_key = `${country.toUpperCase()}_${language.toLowerCase()}`;
      const doc = await ViralTrendModel.findOne({ cache_key }).lean();
      if (!doc) return null;
      return {
        items: (doc as any).items || [],
        updated_at: (doc as any).updated_at || new Date(),
      };
    } catch (err: any) {
      return null;
    }
  }

  async saveViralTrends(country: string, language: string, items: any[]): Promise<void> {
    try {
      const cleanCountry = country.toUpperCase();
      const cleanLang = language.toLowerCase();
      const cache_key = `${cleanCountry}_${cleanLang}`;
      await ViralTrendModel.findOneAndUpdate(
        { cache_key },
        {
          cache_key,
          country: cleanCountry,
          language: cleanLang,
          items: items || [],
          updated_at: new Date(),
        },
        { upsert: true, new: true }
      );
    } catch (err: any) {
      // Non-blocking error
    }
  }

  async getAllCachedViralTrends(): Promise<Array<{ cache_key: string; country: string; language: string; items: any[]; updated_at: Date }>> {
    try {
      const docs = await ViralTrendModel.find({}).lean();
      return docs.map((d: any) => ({
        cache_key: d.cache_key,
        country: d.country,
        language: d.language,
        items: d.items || [],
        updated_at: d.updated_at || new Date(),
      }));
    } catch (err: any) {
      return [];
    }
  }

  // ─── Social Connected Accounts ───────────────────────────────────────────
  async updateSocialAccount(account: Partial<SocialAccountEntity>, options?: { upsert?: boolean }): Promise<SocialAccountEntity> {
    const doc = await SocialAccountModel.findOneAndUpdate(
      { user_id: account.user_id, platform: account.platform, channel_id: account.channel_id },
      {
        $set: {
          ...account,
          updated_at: new Date(),
        },
        $setOnInsert: {
          connectedAt: new Date(),
        },
      },
      { upsert: options?.upsert !== false, new: true }
    ).lean();
    return doc as any;
  }

  async listSocialAccounts(userId: string): Promise<SocialAccountEntity[]> {
    const docs = await SocialAccountModel.find({ userId, isActive: { $ne: false } }).select('-accessToken -refreshToken').lean();
    return docs as any;
  }

  async deleteSocialAccount(userId: string, platform: string, channelId?: string): Promise<boolean> {
    const query: any = { userId, platform };
    if (channelId) query.channelId = channelId;
    const res = await SocialAccountModel.deleteMany(query);
    return res.deletedCount > 0;
  }
}

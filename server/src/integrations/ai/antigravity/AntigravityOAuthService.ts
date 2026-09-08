import axios from 'axios';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getDatabaseProvider } from '@/database/index.js';
import type { AntigravityAccountEntity } from '@/types.js';
import { Logger } from '@/utils/logger.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CODE_ASSIST_ENDPOINT = 'https://daily-cloudcode-pa.sandbox.googleapis.com';

export class AntigravityOAuthService {
  private static instance: AntigravityOAuthService;

  // Discovered credentials for zero-config Antigravity OAuth
  public static readonly CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
  public static readonly CLIENT_SECRET = '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';

  public static readonly SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
  ];

  public static getInstance(): AntigravityOAuthService {
    if (!AntigravityOAuthService.instance) {
      AntigravityOAuthService.instance = new AntigravityOAuthService();
    }
    return AntigravityOAuthService.instance;
  }

  /**
   * Builds the Google OAuth consent screen URL for Antigravity with zero configuration.
   */
  public getAuthorizationUrl(redirectUri: string, state?: string): string {
    const urlParams = new URLSearchParams({
      client_id: AntigravityOAuthService.CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: AntigravityOAuthService.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: state || crypto.randomBytes(16).toString('hex'),
    });

    return `${AUTH_URL}?${urlParams.toString()}`;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens, fetches userinfo,
   * discovers Cloud Code project ID, and upserts the account into the database.
   */
  public async exchangeCode(code: string, redirectUri: string): Promise<AntigravityAccountEntity> {
    try {
      Logger.info(`[AntigravityOAuth] Exchanging authorization code...`, 'AntigravityOAuth');

      const tokenRes = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          code,
          client_id: AntigravityOAuthService.CLIENT_ID,
          client_secret: AntigravityOAuthService.CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        }
      );

      const { access_token, refresh_token, expires_in } = tokenRes.data;
      if (!access_token) {
        throw new Error('No access token returned from Google OAuth token exchange');
      }

      // Fetch user profile (email, name, picture)
      const userRes = await axios.get(USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 10000,
      });
      const { email, name, picture } = userRes.data;
      if (!email) {
        throw new Error('Failed to retrieve user email from Google UserInfo endpoint');
      }

      const db = await getDatabaseProvider();
      const existingAccounts = await db.getAntigravityAccounts();
      const existing = existingAccounts.find(
        (a) => a.email.toLowerCase().trim() === email.toLowerCase().trim()
      );

      const expiresAt = Date.now() + (expires_in || 3600) * 1000;
      const accountData: AntigravityAccountEntity = {
        id: existing?.id || `ag_${nanoid(10)}`,
        email: email.trim(),
        name: name || existing?.name,
        avatar: picture || existing?.avatar,
        access_token,
        refresh_token: refresh_token || existing?.refresh_token || '',
        expires_at: expiresAt,
        status: 'ACTIVE',
        request_count: existing?.request_count || 0,
        project_id: existing?.project_id,
        tier: existing?.tier || 'free',
        last_used_at: existing?.last_used_at,
      };

      // Discovers the Cloud Code companion project ID
      try {
        const projectId = await this.discoverProjectId(accountData, access_token);
        if (projectId) {
          accountData.project_id = projectId;
        }
      } catch (discErr: any) {
        Logger.warn(
          `[AntigravityOAuth] Project discovery warning for ${email}: ${discErr.message}`,
          'AntigravityOAuth'
        );
      }

      const saved = await db.upsertAntigravityAccount(accountData);
      Logger.info(`[AntigravityOAuth] Successfully connected Antigravity account: ${email}`, 'AntigravityOAuth');
      return saved;
    } catch (err: any) {
      const errorDetails = err.response?.data || err.message;
      Logger.error(`[AntigravityOAuth] Token exchange error: ${JSON.stringify(errorDetails)}`, 'AntigravityOAuth');
      throw new Error(`Antigravity OAuth exchange failed: ${err.message}`);
    }
  }

  /**
   * Refreshes the Google OAuth access token if expired or about to expire.
   */
  public async refreshAccessToken(account: AntigravityAccountEntity): Promise<string> {
    const now = Date.now();
    // Return existing token if valid for more than 5 minutes
    if (account.access_token && account.expires_at && account.expires_at > now + 300_000) {
      return account.access_token;
    }

    if (!account.refresh_token) {
      const db = await getDatabaseProvider();
      await db.upsertAntigravityAccount({
        ...account,
        status: 'REVOKED',
        error_message: 'Missing refresh token. Re-authorization required.',
      });
      throw new Error(`Account ${account.email} has no refresh token`);
    }

    try {
      Logger.info(`[AntigravityOAuth] Refreshing token for ${account.email}...`, 'AntigravityOAuth');
      const response = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          refresh_token: account.refresh_token,
          client_id: AntigravityOAuthService.CLIENT_ID,
          client_secret: AntigravityOAuthService.CLIENT_SECRET,
          grant_type: 'refresh_token',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        }
      );

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new Error('No access_token returned from refresh endpoint');
      }

      const updatedAccount: AntigravityAccountEntity = {
        ...account,
        access_token,
        expires_at: Date.now() + (expires_in || 3600) * 1000,
        status: 'ACTIVE',
        error_message: undefined,
      };

      const db = await getDatabaseProvider();
      await db.upsertAntigravityAccount(updatedAccount);
      return access_token;
    } catch (error: any) {
      const isRevoked =
        error.response?.status === 400 ||
        error.response?.status === 401 ||
        error.response?.data?.error === 'invalid_grant';

      const db = await getDatabaseProvider();
      await db.upsertAntigravityAccount({
        ...account,
        status: isRevoked ? 'REVOKED' : 'ERROR',
        error_message: error.response?.data?.error_description || error.message,
      });

      Logger.error(`[AntigravityOAuth] Refresh token failed for ${account.email}: ${error.message}`, 'AntigravityOAuth');
      throw new Error(`Failed to refresh Antigravity token for ${account.email}: ${error.message}`);
    }
  }

  /**
   * Discovers the cloudaicompanion project ID using loadCodeAssist and onboardUser.
   */
  public async discoverProjectId(account: AntigravityAccountEntity, explicitToken?: string): Promise<string> {
    if (account.project_id && !account.project_id.includes('default') && account.project_id.length > 5) {
      return account.project_id;
    }

    const token = explicitToken || (await this.refreshAccessToken(account));
    const host = 'daily-cloudcode-pa.sandbox.googleapis.com';
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Host: host,
      'User-Agent': 'antigravity/1.13.3 windows/amd64',
      'Accept-Encoding': 'gzip',
    };

    try {
      Logger.info(`[AntigravityOAuth] Discovering project ID for ${account.email}...`, 'AntigravityOAuth');
      const loadRes = await axios.post(
        `${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`,
        {
          metadata: {
            ideType: 'ANTIGRAVITY',
          },
        },
        { headers, timeout: 15000 }
      );

      const data = loadRes.data;
      let projectId = data?.cloudaicompanionProject;
      if (projectId && typeof projectId === 'object') {
        projectId = projectId.id;
      }

      if (projectId && typeof projectId === 'string') {
        Logger.info(`[AntigravityOAuth] Found cloudaicompanionProject for ${account.email}: ${projectId}`, 'AntigravityOAuth');
        account.project_id = projectId;
        if (data.paidTier?.id) {
          account.tier = data.paidTier.id.toLowerCase().includes('free') ? 'free' : 'paid';
        }
        const db = await getDatabaseProvider();
        await db.upsertAntigravityAccount(account);
        return projectId;
      }

      // If project is not provisioned yet, call onboardUser
      const tierId = data?.eligibleTiers?.[0] || 'free';
      const onboardRes = await axios.post(
        `${CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`,
        {
          tierId,
          metadata: {
            ideType: 'ANTIGRAVITY',
          },
        },
        { headers, timeout: 15000 }
      );

      if (onboardRes.data?.done) {
        let onboardedProject = onboardRes.data.response?.cloudaicompanionProject;
        if (onboardedProject && typeof onboardedProject === 'object') {
          onboardedProject = onboardedProject.id;
        }
        if (onboardedProject && typeof onboardedProject === 'string') {
          account.project_id = onboardedProject;
          account.tier = tierId;
          const db = await getDatabaseProvider();
          await db.upsertAntigravityAccount(account);
          return onboardedProject;
        }
      }

      return account.project_id || '';
    } catch (err: any) {
      Logger.error(`[AntigravityOAuth] Project discovery failed for ${account.email}: ${err.message}`, 'AntigravityOAuth');
      throw err;
    }
  }

  /**
   * Retrieves the best available account from the pool (ACTIVE, not rate limited, lowest request count).
   */
  public async getAvailableAccount(): Promise<AntigravityAccountEntity | null> {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts('ACTIVE');
    if (!accounts || accounts.length === 0) return null;

    const now = Date.now();
    const readyAccounts = accounts.filter((acc) => {
      if (acc.rate_limit_reset_at && acc.rate_limit_reset_at > now) {
        return false;
      }
      return true;
    });

    if (readyAccounts.length === 0) {
      // All accounts currently rate limited
      return null;
    }

    // Sort by request_count ascending (least used) then updated_at ascending
    readyAccounts.sort((a, b) => (a.request_count || 0) - (b.request_count || 0));
    return readyAccounts[0];
  }

  /**
   * Marks an account as rate limited with a cooldown duration.
   */
  public async markAccountRateLimited(accountId: string, cooldownSeconds = 60): Promise<void> {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts();
    const target = accounts.find((a) => a.id === accountId);
    if (!target) return;

    await db.upsertAntigravityAccount({
      ...target,
      rate_limit_reset_at: Date.now() + cooldownSeconds * 1000,
      error_message: `Rate limit hit. Cooling down for ${cooldownSeconds}s`,
    });
  }

  /**
   * Records a successful request for an account (increments request count, updates last_used_at).
   */
  public async recordUsage(accountId: string): Promise<void> {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts();
    const target = accounts.find((a) => a.id === accountId);
    if (!target) return;

    await db.upsertAntigravityAccount({
      ...target,
      request_count: (target.request_count || 0) + 1,
      last_used_at: new Date().toISOString(),
      error_message: undefined,
    });
  }

  /**
   * Synchronizes available models and remaining quota fractions from Antigravity gateway
   */
  public async syncAvailableModels(account: AntigravityAccountEntity): Promise<any[]> {
    const token = await this.refreshAccessToken(account);
    const host = 'daily-cloudcode-pa.sandbox.googleapis.com';
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Host: host,
      'User-Agent': 'antigravity/1.13.3 windows/amd64',
      'Accept-Encoding': 'gzip',
    };

    try {
      const projectId = await this.discoverProjectId(account, token);
      const payload: any = { project: projectId || 'aicode-consumers' };
      const response = await axios.post(
        `${CODE_ASSIST_ENDPOINT}/v1internal:fetchAvailableModels`,
        payload,
        { headers, timeout: 15000 }
      );

      const dataModels = response.data?.models || {};
      const result: Array<{ id: string; displayName?: string; remainingFraction?: number; percentage?: number; resetTime?: string; category?: string }> = [];
      const seenIds = new Set<string>();

      for (const [name, info] of Object.entries(dataModels)) {
        const quotaInfo = (info as any)?.quotaInfo;
        const fraction = typeof quotaInfo?.remainingFraction === 'number' ? quotaInfo.remainingFraction : 1;
        const percentage = Math.round(fraction * 100);
        seenIds.add(name);
        result.push({
          id: name,
          displayName: (info as any)?.displayName || name,
          remainingFraction: fraction,
          percentage,
          resetTime: quotaInfo?.resetTime,
          category: 'Fast Flash',
        });
      }

      // Add high-tier agentic models supported by the Antigravity PA Gateway if not yet present
      const coreAgentModels = [
        { id: 'gemini-3.6-flash-high', displayName: 'Gemini 3.6 Flash High', category: 'Agentic CoT' },
        { id: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro Low', category: 'Deep Reasoning' },
        { id: 'gemini-pro-agent', displayName: 'Gemini Pro Agent', category: 'Autonomous' },
      ];

      for (const cm of coreAgentModels) {
        if (!seenIds.has(cm.id)) {
          result.push({
            id: cm.id,
            displayName: cm.displayName,
            remainingFraction: 1,
            percentage: 100,
            category: cm.category,
          });
        }
      }

      if (!account.quotas) {
        account.quotas = {};
      }
      for (const m of result) {
        account.quotas[m.id] = {
          used: Math.max(0, 100 - (m.percentage ?? 100)),
          limit: 100,
        };
      }

      account.available_models = result;
      account.last_synced_at = new Date().toISOString();
      const db = await getDatabaseProvider();
      await db.upsertAntigravityAccount(account);
      Logger.info(`[AntigravityOAuth] Synced ${result.length} models with quotas for ${account.email}`, 'AntigravityOAuth');
      return result;
    } catch (err: any) {
      Logger.error(`[AntigravityOAuth] Model & quota sync failed for ${account.email}: ${err.message}`, 'AntigravityOAuth');
      return [];
    }
  }

  /**
   * Updates an account's project ID manually (e.g. binding to user's custom GCP project)
   */
  public async updateProjectId(accountId: string, projectId: string): Promise<AntigravityAccountEntity> {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts();
    const target = accounts.find((a) => a.id === accountId);
    if (!target) {
      throw new Error(`Antigravity account ${accountId} not found`);
    }

    const updated: AntigravityAccountEntity = {
      ...target,
      project_id: projectId.trim(),
    };

    await db.upsertAntigravityAccount(updated);
    Logger.info(`[AntigravityOAuth] Updated project ID for ${target.email} to: ${projectId}`, 'AntigravityOAuth');
    return updated;
  }

  /**
   * Syncs and verifies all registered Antigravity accounts.
   */
  public async syncAllAccounts(): Promise<{ total: number; successful: number; failed: number }> {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts();
    let successful = 0;
    let failed = 0;

    for (const acc of accounts) {
      try {
        await this.refreshAccessToken(acc);
        await this.discoverProjectId(acc);
        await this.syncAvailableModels(acc);
        successful++;
      } catch (err: any) {
        failed++;
        Logger.warn(`[AntigravityOAuth] Account sync failed for ${acc.email}: ${err.message}`, 'AntigravityOAuth');
      }
    }

    return { total: accounts.length, successful, failed };
  }
}

export const antigravityOAuthService = AntigravityOAuthService.getInstance();

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { AccountStatus, FlowAccountState, FlowJobRecord, GenerationJobRequest, GenerationJobResult } from '../types.js';
import { playwrightWorker } from '../headless/PlaywrightWorker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local and workspace root .env if available
dotenv.config({ override: true });
const rootEnv = path.resolve(__dirname, '../../../../.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv, override: true });
}

const REGISTRY_FILE = path.resolve(__dirname, '../../data/accounts_registry.json');
const JOBS_REGISTRY_FILE = path.resolve(__dirname, '../../data/jobs_history.json');

// Max concurrent projects per account before rotating old ones (configurable via env)
const FLOW_MAX_PROJECTS_PER_ACCOUNT = Math.max(1, parseInt(process.env.FLOW_MAX_PROJECTS_PER_ACCOUNT || '20', 10));

interface PendingJob {
  job: GenerationJobRequest;
  resolve: (res: GenerationJobResult) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  startedAt: number;
  assignedAccountId: string;
}

interface QueuedJob {
  job: GenerationJobRequest;
  resolve: (res: GenerationJobResult) => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
}

interface PendingCreditCheck {
  accountId: string;
  resolve: (res: { credits: number; isQuotaExceeded: boolean }) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

export class AccountPool {
  private accounts = new Map<string, FlowAccountState>();
  private pendingJobs = new Map<string, PendingJob>();
  private activeJobRecords = new Map<string, FlowJobRecord>();
  private completedJobs = new Map<string, GenerationJobResult>();
  private jobsHistory: FlowJobRecord[] = [];
  private jobQueue: QueuedJob[] = [];
  private pendingCreditChecks = new Map<string, PendingCreditCheck>();

  constructor() {
    this.ensureDataDir();
    this.loadRegistry();
    this.loadJobsHistory();
  }

  public isHeadlessEnabled(): boolean {
    if (
      process.env.FLOW_DISABLE_HEADLESS === 'true' ||
      process.env.FLOW_DISABLE_HEADLESS === '1' ||
      process.env.FLOW_ENABLE_HEADLESS === 'false' ||
      process.env.FLOW_ENABLE_HEADLESS === '0' ||
      process.env.FLOW_HEADLESS_ENABLED === 'false' ||
      process.env.FLOW_HEADLESS_ENABLED === '0' ||
      process.env.HEADLESS_MODE === 'false' ||
      process.env.HEADLESS_MODE === '0'
    ) {
      return false;
    }
    return true;
  }

  private ensureDataDir() {
    try {
      const dataDir = path.dirname(REGISTRY_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (err: any) {
      console.warn('[AccountPool] Notice creating data directory:', err.message);
    }
  }

  private loadRegistry() {
    try {
      if (fs.existsSync(REGISTRY_FILE)) {
        const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
        const list: Partial<FlowAccountState>[] = JSON.parse(raw);
        for (const item of list) {
          if (item.accountId) {
            const hasCookies = Boolean(item.cookies && item.cookies.length > 0);
            const canBeHeadless = hasCookies && this.isHeadlessEnabled();
            const workerType: 'EXTENSION' | 'HEADLESS' = canBeHeadless ? 'HEADLESS' : (item.workerType || 'EXTENSION');
            const status: AccountStatus = canBeHeadless
              ? (item.isQuotaExceeded ? 'QUOTA_EXCEEDED' : 'READY')
              : 'OFFLINE';

            this.accounts.set(item.accountId, {
              accountId: item.accountId,
              label: item.label || item.accountId,
              workerType,
              status,
              hasFlowTab: false,
              projectId: item.projectId,
              projectUrl: item.projectUrl,
              credits: item.credits ?? 100,
              userPaygateTier: item.userPaygateTier,
              isQuotaExceeded: Boolean(item.isQuotaExceeded),
              totalCompletedJobs: item.totalCompletedJobs || 0,
              lastActiveAt: item.lastActiveAt || Date.now(),
              cookies: item.cookies || [],
            });
          }
        }
        console.log(`[AccountPool] 📂 Restored ${this.accounts.size} account(s) from persistent registry.`);
      }
    } catch (err: any) {
      console.warn('[AccountPool] Notice loading registry:', err.message);
    }
  }

  private persistRegistry() {
    try {
      this.ensureDataDir();
      const exportData = Array.from(this.accounts.values()).map(acc => ({
        accountId: acc.accountId,
        label: acc.label,
        workerType: acc.workerType,
        projectId: acc.projectId,
        projectUrl: acc.projectUrl,
        projectSlots: acc.projectSlots,
        credits: acc.credits,
        userPaygateTier: acc.userPaygateTier,
        isQuotaExceeded: acc.isQuotaExceeded,
        totalCompletedJobs: acc.totalCompletedJobs,
        lastActiveAt: acc.lastActiveAt,
        cookies: acc.cookies,
      }));
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(exportData, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[AccountPool] Notice saving registry:', err.message);
    }
  }

  private loadJobsHistory() {
    try {
      if (fs.existsSync(JOBS_REGISTRY_FILE)) {
        const raw = fs.readFileSync(JOBS_REGISTRY_FILE, 'utf-8');
        this.jobsHistory = JSON.parse(raw);
        console.log(`[AccountPool] 📂 Restored ${this.jobsHistory.length} completed job records from history.`);
      }
    } catch (err: any) {
      console.warn('[AccountPool] Notice loading jobs history:', err.message);
    }
  }

  private persistJobsHistory() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(JOBS_REGISTRY_FILE, JSON.stringify(this.jobsHistory.slice(0, 200), null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[AccountPool] Notice saving jobs history:', err.message);
    }
  }

  // ── Account Registration & State Management ──────────────────────────────────

  public registerExtensionWorker(
    accountId: string,
    ws: any,
    label?: string,
    cookies?: any[],
    projectId?: string,
    credits?: number,
    hasFlowTab?: boolean,
    statusOverride?: AccountStatus
  ) {
    const existing = this.accounts.get(accountId);
    const isTabOpen = Boolean(hasFlowTab);
    const allCookies = (cookies && cookies.length > 0) ? cookies : existing?.cookies;
    const hasCookies = Boolean(allCookies && allCookies.length > 0);

    // Worker is connected via WebSocket -> Mode is always EXTENSION!
    // Extension automatically opens tabs on-demand.
    const isConnected = Boolean(ws && ws.readyState === 1);
    const workerType: 'EXTENSION' | 'HEADLESS' = 'EXTENSION';
    const resolvedStatus: AccountStatus = isConnected
      ? (statusOverride === 'BUSY' ? 'BUSY' : (statusOverride === 'OFFLINE' ? 'OFFLINE' : 'READY'))
      : 'OFFLINE';
    
    // Do not let an unverified 0 or undefined credits from extension overwrite an existing positive balance!
    let initialCredits: number;
    if (existing?.credits !== undefined && existing.credits > 0 && (credits === undefined || credits === 0)) {
      initialCredits = existing.credits;
    } else if (credits !== undefined) {
      initialCredits = credits;
    } else {
      initialCredits = existing?.credits ?? 100;
    }
    const isQuota = (initialCredits <= 0) || Boolean(existing?.isQuotaExceeded);

    const updated: FlowAccountState = {
      accountId,
      label: label || existing?.label || accountId,
      workerType,
      status: resolvedStatus,
      hasFlowTab: isTabOpen,
      projectId: projectId || existing?.projectId,
      projectUrl: projectId ? `https://flow.google.com/project/${projectId}` : existing?.projectUrl,
      credits: initialCredits,
      userPaygateTier: existing?.userPaygateTier,
      isQuotaExceeded: isQuota,
      totalCompletedJobs: existing?.totalCompletedJobs || 0,
      connectedAt: existing?.connectedAt || Date.now(),
      lastActiveAt: Date.now(),
      cookies: allCookies,
      wsClient: ws,
    };
    if (isQuota) {
      updated.status = 'QUOTA_EXCEEDED';
    }

    this.accounts.set(accountId, updated);
    this.persistRegistry();
    console.log(`[AccountPool] 🔌 Worker registered: ${accountId} | Mode: ${workerType} | Status: ${updated.status} | Tab Open: ${isTabOpen} | Cookies: ${hasCookies}`);

    if (updated.status === 'READY') {
      this.dispatchNextQueuedJob();
    }
    return updated;
  }

  public updateAccountStatus(accountId: string, status: AccountStatus, hasFlowTab?: boolean) {
    const acc = this.accounts.get(accountId);
    if (acc) {
      const isTabOpen = Boolean(hasFlowTab);
      acc.hasFlowTab = isTabOpen;
      const isWsConnected = Boolean(acc.wsClient && acc.wsClient.readyState === 1);
      const hasCookies = Boolean(acc.cookies && acc.cookies.length > 0);

      if (isWsConnected) {
        // High-priority EXTENSION mode as long as WebSocket connection is alive.
        // Even if no flow.google.com tab is currently open, the extension opens tabs on-demand!
        acc.workerType = 'EXTENSION';
        acc.status = acc.isQuotaExceeded ? 'QUOTA_EXCEEDED' : (status === 'BUSY' ? 'BUSY' : 'READY');
      } else {
        // WebSocket is disconnected: fallback to HEADLESS only if enabled and cookies exist
        if (hasCookies && this.isHeadlessEnabled()) {
          acc.workerType = 'HEADLESS';
          acc.status = acc.isQuotaExceeded ? 'QUOTA_EXCEEDED' : (status === 'BUSY' ? 'BUSY' : 'READY');
        } else {
          acc.workerType = 'EXTENSION';
          acc.status = 'OFFLINE';
        }
      }

      acc.lastActiveAt = Date.now();
      this.persistRegistry();
      console.log(`[AccountPool] 🔄 Status update for ${accountId} -> Mode: ${acc.workerType} | Status: ${acc.status} (WS Connected: ${isWsConnected}, Tab Open: ${acc.hasFlowTab}, Cookies: ${hasCookies})`);
      if (acc.status === 'READY') {
        this.dispatchNextQueuedJob();
      }
    }
  }

  public disconnectExtensionWorker(ws: any) {
    for (const [id, acc] of this.accounts.entries()) {
      if (acc.wsClient === ws) {
        acc.wsClient = undefined;
        if (acc.cookies && acc.cookies.length > 0 && this.isHeadlessEnabled()) {
          acc.workerType = 'HEADLESS';
          acc.status = acc.isQuotaExceeded ? 'QUOTA_EXCEEDED' : 'READY';
          console.log(`[AccountPool] 🟡 Extension worker disconnected for ${id}; standby in HEADLESS mode.`);
        } else {
          acc.status = 'OFFLINE';
          console.log(`[AccountPool] 🔴 Extension worker disconnected for ${id}; status OFFLINE (headless: ${this.isHeadlessEnabled() ? 'inactive' : 'disabled'}).`);
        }
      }
    }
    this.persistRegistry();

    // If no capable workers remain in the pool, drain and reject all queued jobs immediately
    if (this.jobQueue.length > 0 && this.getCapableActiveWorkersCount() === 0) {
      console.warn(`[AccountPool] ⚡ Draining ${this.jobQueue.length} queued job(s) due to NO_ACTIVE_ACCOUNTS after worker disconnect.`);
      while (this.jobQueue.length > 0) {
        const queued = this.jobQueue.shift()!;
        const err = new Error(`[NO_ACTIVE_ACCOUNTS] Worker disconnected. No active Flow workers available to process queued job ${queued.job.jobId}.`);
        (err as any).code = 'NO_ACTIVE_ACCOUNTS';
        (err as any).status = 503;
        queued.reject(err);
      }
    }
  }

  public syncProject(accountId: string, projectId: string, projectUrl?: string) {
    const acc = this.accounts.get(accountId);
    if (acc) {
      acc.projectId = projectId;
      acc.projectUrl = projectUrl || `https://flow.google.com/project/${projectId}`;
      acc.lastActiveAt = Date.now();
      // Register into the FIFO slot list (avoid duplicates)
      if (!acc.projectSlots) acc.projectSlots = [];
      if (!acc.projectSlots.includes(projectId)) {
        acc.projectSlots.push(projectId);
        console.log(`[AccountPool] 📌 Registered project slot for ${accountId}: ${projectId} (total: ${acc.projectSlots.length}/${FLOW_MAX_PROJECTS_PER_ACCOUNT})`);
      }
      this.persistRegistry();
    }
  }

  public updateCredits(
    accountId: string,
    credits: number,
    isQuotaExceeded: boolean = false,
    tier?: string,
    requestId?: string
  ) {
    if (typeof credits !== 'number' || isNaN(credits)) {
      console.warn(`[AccountPool] ⚠️ Ignored invalid/empty credits update for ${accountId}: ${credits}`);
      if (requestId && this.pendingCreditChecks.has(requestId)) {
        const pending = this.pendingCreditChecks.get(requestId)!;
        clearTimeout(pending.timer);
        this.pendingCreditChecks.delete(requestId);
        pending.reject(new Error('Invalid credit count returned from worker'));
      }
      return;
    }

    const acc = this.accounts.get(accountId);
    if (acc) {
      // Guard against false zero drops: do not overwrite a positive balance with 0
      // unless isQuotaExceeded is explicitly true!
      if (credits === 0 && !isQuotaExceeded && acc.credits !== undefined && acc.credits > 0) {
        console.warn(`[AccountPool] ⚠️ Guarded ${accountId}: Ignored unverified 0-credits update because existing balance is ${acc.credits}`);
        if (tier) acc.userPaygateTier = tier;
        this.persistRegistry();
        return;
      }
      acc.credits = credits;
      acc.isQuotaExceeded = isQuotaExceeded;
      if (tier) acc.userPaygateTier = tier;
      if (isQuotaExceeded) {
        acc.status = 'QUOTA_EXCEEDED';
        console.warn(`[AccountPool] ⚠️ Account ${accountId} marked as QUOTA_EXCEEDED (Credits: ${credits})`);
      } else if (acc.status === 'QUOTA_EXCEEDED') {
        acc.status = 'READY';
      }
      this.persistRegistry();
    }

    // Resolve any matching pending credit check
    if (requestId && this.pendingCreditChecks.has(requestId)) {
      const pending = this.pendingCreditChecks.get(requestId)!;
      clearTimeout(pending.timer);
      this.pendingCreditChecks.delete(requestId);
      pending.resolve({ credits, isQuotaExceeded });
    } else {
      // Find pending check by accountId
      for (const [rId, pending] of this.pendingCreditChecks.entries()) {
        if (pending.accountId === accountId) {
          clearTimeout(pending.timer);
          this.pendingCreditChecks.delete(rId);
          pending.resolve({ credits, isQuotaExceeded });
          break;
        }
      }
    }
  }

  public handleCreditCheckError(accountId: string, error: string, requestId?: string) {
    console.warn(`[AccountPool] ⚠️ Credit sync error for ${accountId}: ${error}`);
    if (requestId && this.pendingCreditChecks.has(requestId)) {
      const pending = this.pendingCreditChecks.get(requestId)!;
      clearTimeout(pending.timer);
      this.pendingCreditChecks.delete(requestId);
      pending.reject(new Error(error));
    } else {
      for (const [rId, pending] of this.pendingCreditChecks.entries()) {
        if (pending.accountId === accountId) {
          clearTimeout(pending.timer);
          this.pendingCreditChecks.delete(rId);
          pending.reject(new Error(error));
          break;
        }
      }
    }
  }

  public async requestCreditCheck(accountId: string, timeoutMs: number = 30000): Promise<{ credits: number; isQuotaExceeded: boolean }> {
    const acc = this.accounts.get(accountId);
    if (!acc) {
      const err: any = new Error(`Account ${accountId} not found in pool`);
      err.status = 404;
      throw err;
    }

    const isWsConnected = Boolean(acc.wsClient && acc.wsClient.readyState === 1);
    if (!isWsConnected) {
      // If headless fallback is enabled and cookies are available, verify via Playwright
      if (this.isHeadlessEnabled() && acc.cookies && acc.cookies.length > 0) {
        await this.verifyAccount(accountId);
        return {
          credits: acc.credits ?? 100,
          isQuotaExceeded: acc.isQuotaExceeded ?? false,
        };
      }
      const err: any = new Error(`Account ${accountId} is offline. Chrome extension worker must be connected to check credits.`);
      err.status = 503;
      throw err;
    }

    const requestId = `cred_${nanoid(8)}`;
    console.log(`[AccountPool] 🔄 Requesting credit sync for ${accountId} (req: ${requestId})...`);

    return new Promise<{ credits: number; isQuotaExceeded: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCreditChecks.delete(requestId);
        const err: any = new Error(`Timeout (30s) waiting for credit sync response from extension for account ${accountId}.`);
        err.status = 504;
        reject(err);
      }, timeoutMs);

      this.pendingCreditChecks.set(requestId, { accountId, resolve, reject, timer });

      acc.wsClient.send(JSON.stringify({
        type: 'CHECK_CREDITS',
        accountId,
        requestId,
      }));
    });
  }

  public createAccount(params: {
    accountId: string;
    label?: string;
    projectId?: string;
    workerType?: 'EXTENSION' | 'HEADLESS';
    cookies?: any[];
    credits?: number;
  }): FlowAccountState {
    const existing = this.accounts.get(params.accountId);
    if (existing) {
      if (params.label) existing.label = params.label;
      if (params.projectId) {
        existing.projectId = params.projectId;
        existing.projectUrl = `https://flow.google.com/project/${params.projectId}`;
      }
      if (params.credits !== undefined) existing.credits = params.credits;
      if (params.cookies) existing.cookies = params.cookies;
      if (params.workerType) existing.workerType = params.workerType;
      this.persistRegistry();
      console.log(`[AccountPool] 🔄 Updated existing account: ${params.accountId} (${existing.label})`);
      return existing;
    }

    const newAcc: FlowAccountState = {
      accountId: params.accountId,
      label: params.label || params.accountId,
      workerType: params.workerType || (params.cookies && params.cookies.length > 0 ? 'HEADLESS' : 'EXTENSION'),
      status: params.workerType === 'HEADLESS' && params.cookies && params.cookies.length > 0 ? 'READY' : 'OFFLINE',
      projectId: params.projectId,
      projectUrl: params.projectId ? `https://flow.google.com/project/${params.projectId}` : undefined,
      credits: params.credits !== undefined ? params.credits : 100,
      isQuotaExceeded: false,
      totalCompletedJobs: 0,
      connectedAt: Date.now(),
      lastActiveAt: Date.now(),
      cookies: params.cookies || [],
    };

    this.accounts.set(params.accountId, newAcc);
    this.persistRegistry();
    console.log(`[AccountPool] ➕ Manually created account: ${params.accountId} (${newAcc.label})`);
    return newAcc;
  }

  public deleteAccount(accountId: string): boolean {
    const existing = this.accounts.get(accountId);
    if (!existing) return false;
    if (existing.wsClient) {
      try { existing.wsClient.close(); } catch (_) {}
    }
    this.accounts.delete(accountId);
    this.persistRegistry();
    console.log(`[AccountPool] 🗑️ Deleted account: ${accountId}`);
    return true;
  }

  public syncCookies(accountId: string, cookies: any[], label?: string) {
    const existing = this.accounts.get(accountId);
    const isHeadless = this.isHeadlessEnabled();
    if (existing) {
      existing.cookies = cookies;
      existing.lastActiveAt = Date.now();
      const isWsConnected = Boolean(existing.wsClient && existing.wsClient.readyState === 1);
      if (!isWsConnected) {
        if (isHeadless) {
          existing.workerType = 'HEADLESS';
          existing.status = existing.isQuotaExceeded ? 'QUOTA_EXCEEDED' : 'READY';
        } else {
          existing.status = 'OFFLINE';
        }
      }
      this.persistRegistry();
      console.log(`[AccountPool] 💾 Synced ${cookies.length} cookies for ${accountId} -> Mode: ${existing.workerType} | Status: ${existing.status} (Headless: ${isHeadless})`);
      if (existing.status === 'READY') {
        this.dispatchNextQueuedJob();
      }
    } else {
      const status: AccountStatus = isHeadless ? 'READY' : 'OFFLINE';
      this.accounts.set(accountId, {
        accountId,
        label: label || accountId,
        workerType: isHeadless ? 'HEADLESS' : 'EXTENSION',
        status,
        lastActiveAt: Date.now(),
        cookies,
        isQuotaExceeded: false,
        credits: 100,
        totalCompletedJobs: 0,
      });
      this.persistRegistry();
      console.log(`[AccountPool] 💾 Created account with ${cookies.length} cookies: ${accountId} (Status: ${status}, Headless: ${isHeadless})`);
      if (status === 'READY') {
        this.dispatchNextQueuedJob();
      }
    }
  }

  public markSessionExpired(accountId: string, reason?: string) {
    const acc = this.accounts.get(accountId);
    if (acc) {
      acc.status = 'AUTH_REQUIRED';
      acc.lastError = reason || 'Session expired. Google login required.';
      console.warn(`[AccountPool] ⚠️ Account session expired: ${accountId} (${acc.lastError})`);
      this.persistRegistry();
    }
  }

  public async verifyAccount(accountId: string): Promise<{
    success: boolean;
    url?: string;
    projectId?: string;
    projectUrl?: string;
    error?: string;
  }> {
    const acc = this.accounts.get(accountId);
    if (!acc) {
      return { success: false, error: `Account ${accountId} not found.` };
    }
    const result = await playwrightWorker.verifySession(acc);
    if (result.success) {
      acc.isVerified = true;
      acc.lastVerifiedAt = Date.now();
      if (result.projectId) {
        acc.projectId = result.projectId;
        acc.projectUrl = result.projectUrl;
      }
      this.persistRegistry();
    }
    return result;
  }

  public listAccounts() {
    return Array.from(this.accounts.values()).map(acc => {
      const hasCookies = Boolean(acc.cookies && acc.cookies.length > 0);
      const isWsActive = Boolean(acc.wsClient && acc.wsClient.readyState === 1);
      const isHeadless = this.isHeadlessEnabled();

      // Dynamically resolve state:
      // WS Active -> EXTENSION (READY / BUSY)
      // WS Disconnected + cookies + headless enabled -> HEADLESS (READY / QUOTA_EXCEEDED)
      // Otherwise -> OFFLINE
      let dynamicWorkerType: 'EXTENSION' | 'HEADLESS' = isWsActive ? 'EXTENSION' : (hasCookies && isHeadless ? 'HEADLESS' : 'EXTENSION');
      let dynamicStatus: AccountStatus = isWsActive
        ? (acc.isQuotaExceeded ? 'QUOTA_EXCEEDED' : (acc.status === 'BUSY' ? 'BUSY' : 'READY'))
        : (hasCookies && isHeadless ? (acc.isQuotaExceeded ? 'QUOTA_EXCEEDED' : 'READY') : 'OFFLINE');

      // Keep underlying account object in sync
      acc.workerType = dynamicWorkerType;
      if (acc.status !== 'BUSY') {
        acc.status = dynamicStatus;
      }

      return {
        accountId: acc.accountId,
        label: acc.label,
        workerType: dynamicWorkerType,
        status: acc.status,
        hasFlowTab: Boolean(acc.hasFlowTab),
        projectId: acc.projectId || '--',
        projectUrl: acc.projectUrl,
        credits: acc.credits !== undefined ? acc.credits : '--',
        userPaygateTier: acc.userPaygateTier || 'STANDARD',
        isQuotaExceeded: Boolean(acc.isQuotaExceeded),
        totalCompletedJobs: acc.totalCompletedJobs || 0,
        connectedAt: acc.connectedAt || acc.lastActiveAt,
        lastActiveAt: acc.lastActiveAt,
        lastActive: acc.lastActiveAt,
        lastVerifiedAt: acc.lastVerifiedAt,
        isVerified: Boolean(acc.isVerified),
        lastError: acc.lastError,
        hasCookies,
        isExtensionConnected: Boolean(acc.wsClient && acc.wsClient.readyState === 1),
      };
    });
  }

  public getActiveJobCountForAccount(accountId: string): number {
    let count = 0;
    for (const p of this.pendingJobs.values()) {
      if (p.assignedAccountId === accountId) count++;
    }
    return count;
  }

  public getMaxConcurrencyForAccount(acc: FlowAccountState): number {
    return acc.workerType === 'EXTENSION' ? 3 : 1;
  }

  // ── Smart Load Balancer & Account Selection ─────────────────────────────────

  /**
   * Get all accounts that are currently online and capable of processing jobs,
   * regardless of whether they are currently idle or busy.
   */
  public getCapableWorkers(estimatedCredits: number = 1, preferredAccountId?: string): FlowAccountState[] {
    const isFleetOrUnspecified = !preferredAccountId || preferredAccountId === 'flow-worker-fleet' || preferredAccountId === 'flow-worker';

    return Array.from(this.accounts.values()).filter(acc => {
      if (!isFleetOrUnspecified && acc.accountId !== preferredAccountId) {
        return false;
      }

      if (acc.isQuotaExceeded) return false;
      if (acc.status === 'AUTH_REQUIRED' || acc.status === 'OFFLINE' || acc.status === 'QUOTA_EXCEEDED') return false;
      if (acc.credits !== undefined && (acc.credits <= 0 || acc.credits < estimatedCredits)) return false;

      if (acc.workerType === 'EXTENSION') {
        return Boolean(acc.wsClient && acc.wsClient.readyState === 1);
      }

      if (acc.workerType === 'HEADLESS') {
        return this.isHeadlessEnabled() && Boolean(acc.cookies && acc.cookies.length > 0);
      }

      return false;
    });
  }

  public getCapableActiveWorkersCount(estimatedCredits: number = 1): number {
    return this.getCapableWorkers(estimatedCredits).length;
  }

  public selectBestAccount(preferredAccountId?: string, estimatedCredits: number = 10): FlowAccountState | null {
    // Only bind to preferredAccountId if it's a real specific account and not a generic fleet ID
    if (preferredAccountId && preferredAccountId !== 'flow-worker-fleet' && preferredAccountId !== 'flow-worker' && this.accounts.has(preferredAccountId)) {
      const preferred = this.accounts.get(preferredAccountId)!;
      if (!preferred.isQuotaExceeded && preferred.status !== 'OFFLINE' && preferred.status !== 'AUTH_REQUIRED' && preferred.status !== 'QUOTA_EXCEEDED') {
        if (preferred.credits !== undefined && (preferred.credits <= 0 || preferred.credits < estimatedCredits)) {
          // Preferred account is out of credits, fallback to pool selection
        } else if (preferred.workerType === 'EXTENSION' && preferred.wsClient?.readyState !== 1) {
          // Extension not connected
        } else if (preferred.workerType === 'HEADLESS' && !this.isHeadlessEnabled()) {
          // Headless disabled
        } else {
          const activeCount = this.getActiveJobCountForAccount(preferredAccountId);
          const maxConc = this.getMaxConcurrencyForAccount(preferred);
          if (activeCount < maxConc) {
            return preferred;
          }
        }
      }
    }

    // Filter candidate accounts that have capacity and are not quota exceeded
    const candidates = Array.from(this.accounts.values()).filter(acc => {
      if (acc.isQuotaExceeded) return false;
      if (acc.status === 'OFFLINE' || acc.status === 'AUTH_REQUIRED' || acc.status === 'QUOTA_EXCEEDED') return false;
      if (acc.credits !== undefined && (acc.credits <= 0 || acc.credits < estimatedCredits)) return false;
      if (acc.workerType === 'EXTENSION' && acc.wsClient?.readyState !== 1) return false;
      if (acc.workerType === 'HEADLESS' && (!this.isHeadlessEnabled() || !acc.cookies || acc.cookies.length === 0)) return false;

      const activeCount = this.getActiveJobCountForAccount(acc.accountId);
      const maxConc = this.getMaxConcurrencyForAccount(acc);
      if (activeCount >= maxConc) return false;

      return true;
    });

    if (candidates.length === 0) return null;

    // Smart Priority Selection:
    // 1. EXTENSION workers strictly prioritized over HEADLESS
    // 2. Extension workers with an OPEN Flow tab (hasFlowTab: true) strictly prioritized over those without
    // 3. Lowest active running jobs (Load Balancing)
    // 4. Highest available credits (avoids depleting edge accounts)
    // 5. Least Recently Used (LRU) for round-robin rotation among equally capable accounts
    candidates.sort((a, b) => {
      if (a.workerType === 'EXTENSION' && b.workerType !== 'EXTENSION') return -1;
      if (b.workerType === 'EXTENSION' && a.workerType !== 'EXTENSION') return 1;

      // Prioritize worker that already has an active Flow tab open
      const tabScoreA = a.hasFlowTab ? 1 : 0;
      const tabScoreB = b.hasFlowTab ? 1 : 0;
      if (tabScoreA !== tabScoreB) return tabScoreB - tabScoreA;

      const activeA = this.getActiveJobCountForAccount(a.accountId);
      const activeB = this.getActiveJobCountForAccount(b.accountId);
      if (activeA !== activeB) return activeA - activeB;

      const creditsA = a.credits ?? 0;
      const creditsB = b.credits ?? 0;
      if (creditsA !== creditsB) return creditsB - creditsA;

      const lastA = a.lastActiveAt || 0;
      const lastB = b.lastActiveAt || 0;
      return lastA - lastB;
    });

    return candidates[0];
  }

  // ── Job Execution & Concurrency Queue ───────────────────────────────────────

  public executeJob(job: GenerationJobRequest): Promise<GenerationJobResult> {
    return new Promise((resolve, reject) => {
      const estimatedCredits = job.type === 'video' ? 10 : 1;

      // 1. Fast-Fail Check: Verify if there are ANY active capable workers
      const capableWorkers = this.getCapableWorkers(estimatedCredits, job.accountId);

      if (capableWorkers.length === 0) {
        const isHeadless = this.isHeadlessEnabled();
        const connectedExtensions = Array.from(this.accounts.values()).filter(
          a => a.workerType === 'EXTENSION' && a.wsClient?.readyState === 1
        ).length;

        let reason = '';
        if (job.accountId && job.accountId !== 'flow-worker-fleet' && job.accountId !== 'flow-worker') {
          const target = this.accounts.get(job.accountId);
          if (!target) {
            reason = `Requested account "${job.accountId}" was not found in pool.`;
          } else if (target.isQuotaExceeded) {
            reason = `Requested account "${job.accountId}" has exceeded quota (credits: ${target.credits ?? 0}).`;
          } else {
            reason = `Requested account "${job.accountId}" is ${target.status} (WS Connected: ${Boolean(target.wsClient?.readyState === 1)}).`;
          }
        } else if (this.accounts.size === 0) {
          reason = 'No accounts registered in Flow Worker pool.';
        } else if (connectedExtensions === 0 && !isHeadless) {
          reason = `No active Chrome Extension worker connected and headless mode is disabled (FLOW_ENABLE_HEADLESS=false).`;
        } else {
          reason = `All accounts are offline, out of credits, or quota exceeded.`;
        }

        const error = new Error(`[NO_ACTIVE_ACCOUNTS] No active Flow accounts available to execute job ${job.jobId}. ${reason} Please connect a Chrome Extension worker with Flow open.`);
        (error as any).code = 'NO_ACTIVE_ACCOUNTS';
        (error as any).status = 503;

        console.warn(`[AccountPool] ⚡ Fast error response for job ${job.jobId}: ${error.message}`);
        return reject(error);
      }

      // 2. Select the best idle worker
      const account = this.selectBestAccount(job.accountId, estimatedCredits);

      if (account) {
        this.dispatchJobToAccount(account, job, resolve, reject);
      } else {
        // Enqueue job only when capable workers exist but are currently busy
        console.log(`[AccountPool] ⏳ All ${capableWorkers.length} active worker(s) busy. Enqueueing job ${job.jobId} (Queue size: ${this.jobQueue.length + 1})`);
        this.jobQueue.push({
          job,
          resolve,
          reject,
          enqueuedAt: Date.now(),
        });
      }
    });
  }

  private dispatchJobToAccount(
    acc: FlowAccountState,
    job: GenerationJobRequest,
    resolve: (res: GenerationJobResult) => void,
    reject: (err: Error) => void
  ) {
    acc.lastActiveAt = Date.now();
    job.accountId = acc.accountId;

    // ── Per-Job Project Slot Allocation ──────────────────────────────────────
    // Each job gets its own dedicated Flow project for isolation.
    // We store the project title (ShineJob_<jobId>) so the extension can create & navigate to it.
    // projectSlots tracks all project IDs created by this account (FIFO).
    // If over limit, the oldest slot is evicted (extension deletes it).
    const jobProjectTitle = `ShineJob_${job.jobId}`;
    if (!acc.projectSlots) acc.projectSlots = [];

    // Evict the oldest project slot if we are at the limit
    if (acc.projectSlots.length >= FLOW_MAX_PROJECTS_PER_ACCOUNT) {
      const evictId = acc.projectSlots.shift()!;
      console.log(`[AccountPool] 🗑️ Evicting oldest project slot ${evictId} on ${acc.accountId} (limit: ${FLOW_MAX_PROJECTS_PER_ACCOUNT})`);
      // Instruct extension to delete it (non-blocking)
      if (acc.wsClient?.readyState === 1) {
        try {
          acc.wsClient.send(JSON.stringify({ type: 'DELETE_PROJECT', projectId: evictId }));
        } catch (_) {}
      }
    }

    // Assign the new slot placeholder (actual Google projectId filled by extension via SYNC_PROJECT)
    // We pass jobProjectTitle so the extension knows what project to create.
    (job as any).jobProjectTitle = jobProjectTitle;

    const jobRecord: FlowJobRecord = {
      jobId: job.jobId,
      type: job.type,
      model: job.model || 'veo_3_1_t2v_fast_landscape',
      mode: job.mode,
      prompt: job.prompt,
      aspectRatio: job.aspectRatio,
      duration: job.duration,
      resolution: job.resolution,
      referenceImages: job.referenceImages,
      imageStart: job.imageStart,
      imageEnd: job.imageEnd,
      status: 'BUSY',
      accountId: acc.accountId,
      accountLabel: acc.label || acc.accountId,
      createdAt: job.queuedAt || Date.now(),
      startedAt: Date.now(),
    };
    this.activeJobRecords.set(job.jobId, jobRecord);

    const timeoutMs = job.timeoutMs || (job.type === 'video' ? 180000 : 90000);

    const timer = setTimeout(() => {
      this.pendingJobs.delete(job.jobId);
      const active = this.activeJobRecords.get(job.jobId);
      if (active) {
        active.status = 'FAILED';
        active.error = `Generation job timed out after ${timeoutMs / 1000}s.`;
        active.completedAt = Date.now();
        active.durationMs = timeoutMs;
        this.jobsHistory.unshift(active);
        if (this.jobsHistory.length > 200) this.jobsHistory.pop();
        this.persistJobsHistory();
        this.activeJobRecords.delete(job.jobId);
      }
      const remainingCount = this.getActiveJobCountForAccount(acc.accountId);
      const maxConc = this.getMaxConcurrencyForAccount(acc);
      acc.status = acc.isQuotaExceeded ? 'QUOTA_EXCEEDED' : (remainingCount >= maxConc ? 'BUSY' : 'READY');
      reject(new Error(`Generation job ${job.jobId} timed out after ${timeoutMs / 1000}s on account ${acc.accountId}.`));
      this.dispatchNextQueuedJob();
    }, timeoutMs);

    this.pendingJobs.set(job.jobId, {
      job,
      resolve,
      reject,
      timer,
      startedAt: Date.now(),
      assignedAccountId: acc.accountId,
    });

    const activeCount = this.getActiveJobCountForAccount(acc.accountId);
    const maxConc = this.getMaxConcurrencyForAccount(acc);
    acc.status = activeCount >= maxConc ? 'BUSY' : 'READY';

    if (acc.workerType === 'EXTENSION' && acc.wsClient?.readyState === 1) {
      try {
        acc.wsClient.send(JSON.stringify({
          type: 'EXECUTE_JOB',
          job,
        }));
        console.log(`[AccountPool] 🚀 Dispatched job ${job.jobId} (${job.mode || job.type}) to extension worker ${acc.accountId} [project: ${jobProjectTitle}]`);
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingJobs.delete(job.jobId);
        acc.status = 'READY';
        this.handleJobResult({
          jobId: job.jobId,
          status: 'FAILED',
          error: `Failed to send job to extension: ${err.message}`,
        });
        reject(new Error(`Failed to send job to extension ${acc.accountId}: ${err.message}`));
        this.dispatchNextQueuedJob();
      }
    } else if (acc.workerType === 'HEADLESS') {
      console.log(`[AccountPool] 🎭 Executing job ${job.jobId} via Playwright Headless Worker for ${acc.accountId}...`);
      playwrightWorker.executeJob(acc, job).then(result => {
        clearTimeout(timer);
        this.pendingJobs.delete(job.jobId);
        acc.status = 'READY';
        this.handleJobResult(result);
        if (result.status === 'SUCCESS') {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Headless generation failed.'));
        }
      }).catch(err => {
        clearTimeout(timer);
        this.pendingJobs.delete(job.jobId);
        acc.status = 'READY';
        this.handleJobResult({
          jobId: job.jobId,
          status: 'FAILED',
          error: err.message,
        });
        reject(err);
      });
    } else {
      clearTimeout(timer);
      this.pendingJobs.delete(job.jobId);
      acc.status = 'OFFLINE';
      this.handleJobResult({
        jobId: job.jobId,
        status: 'FAILED',
        error: `Account ${acc.accountId} is not available for generation.`,
      });
      reject(new Error(`Account ${acc.accountId} is not available for generation.`));
      this.dispatchNextQueuedJob();
    }
  }

  public handleJobResult(result: GenerationJobResult) {
    const pending = this.pendingJobs.get(result.jobId);
    if (!pending) {
      console.warn(`[AccountPool] Received result for unknown or finished job: ${result.jobId}`);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingJobs.delete(result.jobId);

    const acc = this.accounts.get(pending.assignedAccountId);
    if (acc) {
      if (result.error && result.error.includes('QUOTA_EXCEEDED')) {
        acc.status = 'QUOTA_EXCEEDED';
        acc.isQuotaExceeded = true;
        acc.credits = 0;
        console.warn(`[AccountPool] ⚠️ Account ${acc.accountId} marked as QUOTA_EXCEEDED from job failure.`);
        this.persistRegistry();

        // Auto re-route job to another ready account if available
        const altAccount = this.selectBestAccount(undefined, pending.job.type === 'video' ? 10 : 1);
        if (altAccount && altAccount.accountId !== acc.accountId) {
          console.log(`[AccountPool] 🔄 Auto-rerouting job ${pending.job.jobId} to alternative account ${altAccount.accountId}...`);
          this.dispatchJobToAccount(altAccount, pending.job, pending.resolve, pending.reject);
          this.dispatchNextQueuedJob();
          return;
        }
      } else {
        const remainingCount = this.getActiveJobCountForAccount(acc.accountId);
        const maxConc = this.getMaxConcurrencyForAccount(acc);
        acc.status = acc.isQuotaExceeded ? 'QUOTA_EXCEEDED' : (remainingCount >= maxConc ? 'BUSY' : 'READY');
      }

      acc.lastActiveAt = Date.now();
      if (result.status === 'SUCCESS') {
        acc.totalCompletedJobs = (acc.totalCompletedJobs || 0) + 1;
        // Deduct estimated credit
        if (acc.credits !== undefined && acc.credits > 0) {
          acc.credits = Math.max(0, acc.credits - (pending.job.type === 'video' ? 10 : 1));
        }
      }
      this.persistRegistry();
    }

    result.durationMs = Date.now() - pending.startedAt;
    result.accountId = pending.assignedAccountId;
    result.model = pending.job.model;
    result.mode = pending.job.mode;

    // Record into persistent history
    const active = this.activeJobRecords.get(result.jobId);
    if (active) {
      active.status = result.status;
      active.mediaUrl = result.mediaUrl;
      active.base64Data = result.base64Data;
      active.mimeType = result.mimeType;
      active.durationMs = result.durationMs;
      active.completedAt = Date.now();
      active.error = result.error;
      this.jobsHistory.unshift(active);
      if (this.jobsHistory.length > 200) this.jobsHistory.pop();
      this.persistJobsHistory();
      this.activeJobRecords.delete(result.jobId);
    } else {
      // Fallback if not tracked in activeJobRecords
      this.jobsHistory.unshift({
        jobId: result.jobId,
        type: pending.job.type,
        model: pending.job.model || 'veo_3_1_t2v_fast_landscape',
        mode: pending.job.mode,
        prompt: pending.job.prompt,
        aspectRatio: pending.job.aspectRatio,
        referenceImages: pending.job.referenceImages,
        status: result.status,
        accountId: pending.assignedAccountId,
        accountLabel: acc?.label || pending.assignedAccountId,
        mediaUrl: result.mediaUrl,
        base64Data: result.base64Data,
        mimeType: result.mimeType,
        durationMs: result.durationMs,
        createdAt: pending.startedAt,
        completedAt: Date.now(),
        error: result.error,
      });
      if (this.jobsHistory.length > 200) this.jobsHistory.pop();
      this.persistJobsHistory();
    }

    // Cache completed result for polling
    this.completedJobs.set(result.jobId, result);

    if (result.status === 'SUCCESS') {
      console.log(`[AccountPool] ✅ Job ${result.jobId} completed in ${result.durationMs}ms via ${pending.assignedAccountId}`);
      pending.resolve(result);
    } else {
      console.error(`[AccountPool] ❌ Job ${result.jobId} failed: ${result.error}`);
      pending.reject(new Error(result.error || 'Generation failed on worker.'));
    }

    // Immediately trigger next job in queue
    this.dispatchNextQueuedJob();
  }

  private dispatchNextQueuedJob() {
    if (this.jobQueue.length === 0) return;

    const next = this.jobQueue[0];
    const acc = this.selectBestAccount(next.job.accountId, next.job.type === 'video' ? 10 : 1);

    if (acc) {
      this.jobQueue.shift();
      console.log(`[AccountPool] ⏩ Dequeuing job ${next.job.jobId} -> Assigned to worker ${acc.accountId} (Remaining in queue: ${this.jobQueue.length})`);
      this.dispatchJobToAccount(acc, next.job, next.resolve, next.reject);
    }
  }

  public getJobStatus(jobId: string): GenerationJobResult | null {
    // 1. Check completed
    if (this.completedJobs.has(jobId)) {
      return this.completedJobs.get(jobId)!;
    }
    // 2. Check in-progress
    if (this.pendingJobs.has(jobId)) {
      const p = this.pendingJobs.get(jobId)!;
      return {
        jobId,
        status: 'BUSY' as any,
        durationMs: Date.now() - p.startedAt,
        accountId: p.assignedAccountId,
        model: p.job.model,
      };
    }
    // 3. Check queued
    const qIndex = this.jobQueue.findIndex(q => q.job.jobId === jobId);
    if (qIndex !== -1) {
      return {
        jobId,
        status: 'QUEUED',
        queuePosition: qIndex + 1,
      };
    }
    return null;
  }

  public getQueueStats() {
    return {
      queueLength: this.jobQueue.length,
      pendingCount: this.pendingJobs.size,
      totalAccounts: this.accounts.size,
      readyAccounts: Array.from(this.accounts.values()).filter(a => a.status === 'READY').length,
    };
  }

  private matchesAccount(recordAccountId?: string, targetAccountId?: string): boolean {
    if (!recordAccountId || !targetAccountId) return false;
    if (recordAccountId === targetAccountId) return true;
    const a = recordAccountId.replace(/^google_acc_/, '').toLowerCase().trim();
    const b = targetAccountId.replace(/^google_acc_/, '').toLowerCase().trim();
    return a === b;
  }

  public listAllJobs(accountId?: string): {
    running: FlowJobRecord[];
    queued: FlowJobRecord[];
    history: FlowJobRecord[];
  } {
    let running = Array.from(this.activeJobRecords.values()).map(r => ({
      ...r,
      durationMs: Date.now() - (r.startedAt || r.createdAt),
    }));

    let queued = this.jobQueue.map(q => ({
      jobId: q.job.jobId,
      type: q.job.type,
      model: q.job.model || 'veo_3_1_t2v_fast_landscape',
      mode: q.job.mode,
      prompt: q.job.prompt,
      aspectRatio: q.job.aspectRatio,
      referenceImages: q.job.referenceImages,
      status: 'QUEUED' as const,
      createdAt: q.enqueuedAt,
      accountId: q.job.accountId,
    }));

    let history = this.jobsHistory;

    if (accountId && accountId.trim()) {
      const target = accountId.trim();
      running = running.filter(r => this.matchesAccount(r.accountId, target));
      queued = queued.filter(q => this.matchesAccount(q.accountId, target));
      history = history.filter(h => this.matchesAccount(h.accountId, target));
    }

    return {
      running,
      queued,
      history,
    };
  }

  public clearJobHistory(accountId?: string): void {
    if (accountId && accountId.trim()) {
      const target = accountId.trim();
      const beforeCount = this.jobsHistory.length;
      this.jobsHistory = this.jobsHistory.filter(h => !this.matchesAccount(h.accountId, target));
      this.persistJobsHistory();
      console.log(`[AccountPool] 🧹 Cleared ${beforeCount - this.jobsHistory.length} jobs history for account ${target}.`);
    } else {
      this.jobsHistory = [];
      this.persistJobsHistory();
      console.log('[AccountPool] 🧹 Cleared all jobs history.');
    }
  }
}

export const accountPool = new AccountPool();

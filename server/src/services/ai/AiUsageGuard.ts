import { AsyncLocalStorage } from 'async_hooks';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import { AiKind, getPlan } from '@/config/plans.js';

/**
 * Central guard for AI spend. Every model call (router, direct Gemini calls,
 * ADK chatbot) goes through `assertAllowed` + `record`, so limits apply no
 * matter which route or background job triggered the call.
 *
 *  - Per-user daily caps by kind, from the user's plan (config/plans.ts)
 *  - Users with 0 credits cannot trigger AI work at all
 *  - Global daily USD budget (estimated from unit costs), set by admins
 *
 * The acting user comes from AsyncLocalStorage, populated by requireAuth, so
 * background work started inside a request still carries that user.
 */

export interface AiRequestContext {
  userId: string;
  role: string;
}

const als = new AsyncLocalStorage<AiRequestContext>();

export function runWithAiContext<T>(ctx: AiRequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getAiContext(): AiRequestContext | undefined {
  return als.getStore();
}

export interface AiCostGuardrails {
  /** Max estimated spend across all users per UTC day (0 = unlimited). */
  dailyBudgetUsd: number;
  /** Estimated USD cost per call, by kind. */
  unitCostUsd: Record<AiKind, number>;
  /** Admin switch: block all non-admin AI calls immediately. */
  aiDisabled: boolean;
  lowResProxyMode: boolean;
}

export const DEFAULT_GUARDRAILS: AiCostGuardrails = {
  dailyBudgetUsd: 50,
  unitCostUsd: { TEXT: 0.002, IMAGE: 0.04, VIDEO: 0.5, MUSIC: 0.06, VOICE: 0.01 },
  aiDisabled: false,
  lowResProxyMode: false,
};

const GUARDRAILS_KEY = 'ai_cost_guardrails';
const PRIVILEGED = new Set(['admin', 'owner', 'superadmin', 'system']);

export class AiLimitError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Counts = Record<AiKind, number>;
interface DayUsage {
  date: string;
  spendUsd: number;
  calls: Counts;
  users: Record<string, Counts>;
}

const emptyCounts = (): Counts => ({ TEXT: 0, IMAGE: 0, VIDEO: 0, MUSIC: 0, VOICE: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const usageKey = (date: string) => `ai_usage_${date}`;

class AiUsageGuardImpl {
  private usage: DayUsage | null = null;
  private loading: Promise<DayUsage> | null = null;
  private guardrails: { value: AiCostGuardrails; loadedAt: number } | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  async getGuardrails(): Promise<AiCostGuardrails> {
    if (this.guardrails && Date.now() - this.guardrails.loadedAt < 30_000) return this.guardrails.value;
    let stored: Partial<AiCostGuardrails> | null = null;
    try {
      const db = await getDatabaseProvider();
      stored = await db.getSystemSetting<Partial<AiCostGuardrails>>(GUARDRAILS_KEY);
    } catch (err: any) {
      Logger.warn(`[AiUsageGuard] Could not load guardrails: ${err?.message}`);
    }
    const value: AiCostGuardrails = {
      ...DEFAULT_GUARDRAILS,
      ...(stored || {}),
      unitCostUsd: { ...DEFAULT_GUARDRAILS.unitCostUsd, ...(stored?.unitCostUsd || {}) },
    };
    this.guardrails = { value, loadedAt: Date.now() };
    return value;
  }

  async saveGuardrails(patch: Partial<AiCostGuardrails>): Promise<AiCostGuardrails> {
    const current = await this.getGuardrails();
    const next: AiCostGuardrails = {
      ...current,
      ...patch,
      unitCostUsd: { ...current.unitCostUsd, ...(patch.unitCostUsd || {}) },
    };
    const db = await getDatabaseProvider();
    await db.saveSystemSetting(GUARDRAILS_KEY, next);
    this.guardrails = { value: next, loadedAt: Date.now() };
    return next;
  }

  /** Today's usage, loaded from the DB once per day (survives restarts / scale-to-zero). */
  async getUsage(): Promise<DayUsage> {
    const date = today();
    if (this.usage?.date === date) return this.usage;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      let stored: DayUsage | null = null;
      try {
        const db = await getDatabaseProvider();
        stored = await db.getSystemSetting<DayUsage>(usageKey(date));
      } catch (err: any) {
        Logger.warn(`[AiUsageGuard] Could not load usage: ${err?.message}`);
      }
      this.usage = stored?.date === date ? stored : { date, spendUsd: 0, calls: emptyCounts(), users: {} };
      return this.usage;
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  /**
   * Throws AiLimitError when the call must not run. Without `kind`, only the
   * account-level checks run (kill switch, budget, credits) — used as an early
   * HTTP pre-check so clients get a proper 402/429 instead of a generic 500.
   */
  async assertAllowed(kind?: AiKind): Promise<void> {
    const ctx = getAiContext();
    const privileged = !!ctx && PRIVILEGED.has(ctx.role);
    const [guardrails, usage] = await Promise.all([this.getGuardrails(), this.getUsage()]);

    if (guardrails.aiDisabled && !privileged) {
      throw new AiLimitError('AI generation is temporarily disabled by the administrator.', 503, 'AI_DISABLED');
    }

    const projected = usage.spendUsd + (kind ? guardrails.unitCostUsd[kind] || 0 : 0);
    if (guardrails.dailyBudgetUsd > 0 && (kind ? projected > guardrails.dailyBudgetUsd : projected >= guardrails.dailyBudgetUsd) && !privileged) {
      throw new AiLimitError('The studio has reached its daily AI budget. Please try again tomorrow.', 429, 'AI_DAILY_BUDGET_EXCEEDED');
    }

    // Background jobs with no user (e.g. trend seeding) are bounded only by the global budget.
    if (!ctx || privileged) return;

    const db = await getDatabaseProvider();
    const user = await db.getUserById(ctx.userId);
    if (!user) {
      throw new AiLimitError('User account not found.', 401, 'USER_NOT_FOUND');
    }
    if ((user.credits ?? 0) <= 0) {
      throw new AiLimitError('You have no AI credits left. Upgrade your plan or wait for the monthly refill.', 402, 'INSUFFICIENT_CREDITS');
    }

    if (!kind) return;
    const limit = getPlan(user.tier).dailyAiLimits[kind];
    const used = usage.users[ctx.userId]?.[kind] || 0;
    if (limit >= 0 && used >= limit) {
      throw new AiLimitError(
        `Daily ${kind.toLowerCase()} generation limit reached for your plan (${limit}/day).`,
        429,
        'AI_USER_DAILY_LIMIT'
      );
    }
  }

  /** Records a completed call against the user and the global budget. */
  async record(kind: AiKind): Promise<void> {
    const [guardrails, usage] = await Promise.all([this.getGuardrails(), this.getUsage()]);
    usage.calls[kind] = (usage.calls[kind] || 0) + 1;
    usage.spendUsd = Math.round((usage.spendUsd + (guardrails.unitCostUsd[kind] || 0)) * 10_000) / 10_000;
    const ctx = getAiContext();
    if (ctx) {
      const counts = (usage.users[ctx.userId] ||= emptyCounts());
      counts[kind] = (counts[kind] || 0) + 1;
    }
    this.scheduleSave();
  }

  /** Guard + run + record. Failed calls are not counted. */
  async track<T>(kind: AiKind, fn: () => Promise<T>): Promise<T> {
    await this.assertAllowed(kind);
    const result = await fn();
    await this.record(kind);
    return result;
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      if (!this.usage) return;
      try {
        const db = await getDatabaseProvider();
        await db.saveSystemSetting(usageKey(this.usage.date), this.usage);
      } catch (err: any) {
        Logger.warn(`[AiUsageGuard] Could not persist usage: ${err?.message}`);
      }
    }, 2_000);
    this.saveTimer.unref?.();
  }

  /** Test helper. */
  resetForTests() {
    this.usage = null;
    this.guardrails = null;
  }
}

export const aiUsageGuard = new AiUsageGuardImpl();

/**
 * Express middleware: account-level AI pre-check for mutating requests on AI
 * routes. Per-kind limits are still enforced at the model call itself.
 */
export async function aiPrecheck(req: any, res: any, next: any) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  try {
    await aiUsageGuard.assertAllowed();
    next();
  } catch (err) {
    if (err instanceof AiLimitError) {
      return res.status(err.status).json({ code: err.status, data: null, message: err.message, error: err.code });
    }
    next(err);
  }
}

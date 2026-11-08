import { getDatabaseProvider } from '@/database/index.js';
import { EnvConfig } from '@/config/env.js';
import { getStudioConfig } from '@/services/StudioConfigCache.js';

export type CreditTaskKey =
  | 'scriptGeneration'
  | 'characterAnchors'
  | 'sceneImage'
  | 'videoGeneration'
  | 'voiceoverTts'
  | 'bgmMusic'
  | 'videoRender'
  | 'cliffhangerHook'
  | 'subtitleTranslate';

type CreditResult = { success: boolean; balance: number; error?: string };

export class CreditService {
  /**
   * Credit price of a task: admin-configured rate (Settings → saved under the
   * "studio_config" system setting) or the env/default rate.
   */
  static async getRate(taskKey: CreditTaskKey): Promise<number> {
    const defaults = EnvConfig.defaultCreditRates as Record<CreditTaskKey, number>;
    let configured: unknown;
    try {
      configured = ((await getStudioConfig()) as any)?.creditRates?.[taskKey];
    } catch {
      configured = undefined;
    }
    const rate = Number(configured ?? defaults[taskKey] ?? 10);
    return Number.isFinite(rate) && rate >= 0 ? rate : defaults[taskKey] ?? 10;
  }

  static async deductUserCredits(
    user_id: string | undefined,
    taskKey: CreditTaskKey,
    activityName: string,
    details: string
  ): Promise<CreditResult> {
    if (!user_id) throw new Error('user_id is required for credit transactions');
    const db = await getDatabaseProvider();
    return db.deductCredits(user_id, await this.getRate(taskKey), activityName, details);
  }

  static async refundUserCredits(
    user_id: string | undefined,
    taskKey: CreditTaskKey,
    activityName: string,
    details: string
  ): Promise<CreditResult> {
    if (!user_id) throw new Error('user_id is required for credit transactions');
    const db = await getDatabaseProvider();
    return db.refundCredits(user_id, await this.getRate(taskKey), activityName, details);
  }
}

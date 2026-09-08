import { getDatabaseProvider } from '@/database/index.js';

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

export class CreditService {
  static async deductUserCredits(
    user_id: string | undefined,
    taskKey: CreditTaskKey,
    activityName: string,
    details: string
  ): Promise<{ success: boolean; balance: number; error?: string }> {
    if (!user_id) {
      throw new Error('user_id is required for credit transactions');
    }
    const db = await getDatabaseProvider();
    const effectiveUserId = user_id;

    // Fetch dynamic rates configured by Admin
    let amount = 10;
    try {
      const studioConfig = await db.getSystemSetting<any>('studio_infrastructure_config');
      const rates = studioConfig?.creditRates || {};
      const defaultRates: Record<CreditTaskKey, number> = {
        scriptGeneration: 15,
        characterAnchors: 10,
        sceneImage: 15,
        videoGeneration: 50,
        voiceoverTts: 10,
        bgmMusic: 10,
        videoRender: 30,
        cliffhangerHook: 5,
        subtitleTranslate: 5,
      };
      amount = Number(rates[taskKey] ?? defaultRates[taskKey] ?? 10);
    } catch {
      amount = 10;
    }

    return await db.deductCredits(effectiveUserId, amount, activityName, details);
  }

  static async refundUserCredits(
    user_id: string | undefined,
    taskKey: CreditTaskKey,
    activityName: string,
    details: string
  ): Promise<{ success: boolean; balance: number; error?: string }> {
    if (!user_id) {
      throw new Error('user_id is required for credit transactions');
    }
    const db = await getDatabaseProvider();
    const effectiveUserId = user_id;

    // Fetch dynamic rates configured by Admin
    let amount = 10;
    try {
      const studioConfig = await db.getSystemSetting<any>('studio_infrastructure_config');
      const rates = studioConfig?.creditRates || {};
      const defaultRates: Record<CreditTaskKey, number> = {
        scriptGeneration: 15,
        characterAnchors: 10,
        sceneImage: 15,
        videoGeneration: 50,
        voiceoverTts: 10,
        bgmMusic: 10,
        videoRender: 30,
        cliffhangerHook: 5,
        subtitleTranslate: 5,
      };
      amount = Number(rates[taskKey] ?? defaultRates[taskKey] ?? 10);
    } catch {
      amount = 10;
    }

    return await db.refundCredits(effectiveUserId, amount, activityName, details);
  }
}

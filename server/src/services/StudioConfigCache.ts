import { getDatabaseProvider } from '@/database/index.js';
import type { StudioSystemConfig } from '@/types.js';

/**
 * Short-lived cache for the admin "studio_config" system setting, which hot
 * paths (every AI call, credit charge, storage lookup) used to re-read from the
 * database each time. Admin saves call invalidateStudioConfig().
 */
const TTL_MS = 30_000;
let cached: { value: StudioSystemConfig; expires: number } | null = null;
let inflight: Promise<StudioSystemConfig> | null = null;

export async function getStudioConfig(): Promise<StudioSystemConfig> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (inflight) return inflight;
  inflight = (async () => {
    const db = await getDatabaseProvider();
    const value = (await db.getSystemSetting<StudioSystemConfig>('studio_config')) || {};
    cached = { value, expires: Date.now() + TTL_MS };
    return value;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function invalidateStudioConfig(): void {
  cached = null;
}

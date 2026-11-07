import { Request, Response, NextFunction } from 'express';
import { getDatabaseProvider } from '@/database/index.js';

const PRIVILEGED_ROLES = new Set(['admin', 'owner', 'superadmin', 'system']);

function currentUser(req: Request): { id: string; role: string } | null {
  const user = (req as any).user;
  return user?.id ? { id: user.id, role: (user.role || '').toLowerCase() } : null;
}

function forbidden(res: Response) {
  return res.status(403).json({ code: 403, error: 'Forbidden', message: 'You do not have access to this resource' });
}

/**
 * Returns true when the current user may act on the series.
 * Unknown series ids pass through so the route can answer 404 itself.
 * Legacy rows without `user_id` stay accessible to avoid locking out old data.
 */
export async function canAccessSeries(req: Request, seriesId: string | undefined | null): Promise<boolean> {
  if (!seriesId || typeof seriesId !== 'string') return true;
  const user = currentUser(req);
  if (!user) return false;
  if (PRIVILEGED_ROLES.has(user.role)) return true;

  const db = await getDatabaseProvider();
  const series = await db.getSeriesById(seriesId);
  if (!series || !series.user_id) return true;
  return series.user_id === user.id;
}

export async function canAccessEpisode(req: Request, episodeId: string | undefined | null): Promise<boolean> {
  if (!episodeId || typeof episodeId !== 'string') return true;
  const db = await getDatabaseProvider();
  const episode = await db.getEpisodeById(episodeId);
  if (!episode) return true;
  return canAccessSeries(req, episode.series_id);
}

/** Express `router.param` handler for route params that hold a series id. */
export async function seriesParamGuard(req: Request, res: Response, next: NextFunction, value: string) {
  try {
    if (await canAccessSeries(req, value)) return next();
    return forbidden(res);
  } catch (err) {
    return next(err);
  }
}

/** Express `router.param` handler for route params that hold an episode id. */
export async function episodeParamGuard(req: Request, res: Response, next: NextFunction, value: string) {
  try {
    if (await canAccessEpisode(req, value)) return next();
    return forbidden(res);
  } catch (err) {
    return next(err);
  }
}

const SERIES_KEYS = ['series_id', 'seriesId'];
const EPISODE_KEYS = ['episode_id', 'episodeId'];

function pick(source: any, keys: string[]): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

/**
 * App-level guard for authenticated routers that receive the series/episode id
 * in the JSON body or query string (assets, AI, captions, audio, publish, ...).
 * Must run after requireAuth and express.json().
 */
export async function bodySeriesOwnershipGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const seriesId = pick(req.body, SERIES_KEYS) || pick(req.query, SERIES_KEYS);
    if (seriesId && !(await canAccessSeries(req, seriesId))) return forbidden(res);

    const episodeId = pick(req.body, EPISODE_KEYS) || pick(req.query, EPISODE_KEYS);
    if (episodeId && !(await canAccessEpisode(req, episodeId))) return forbidden(res);

    next();
  } catch (err) {
    next(err);
  }
}

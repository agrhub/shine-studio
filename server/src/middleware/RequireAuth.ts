import { Request, Response, NextFunction } from 'express';
import { EnvConfig } from '@/config/env.js';
import { verifyAccessToken, extractBearerToken, safeEqual } from '@/utils/token.js';
import { runWithAiContext } from '@/services/ai/AiUsageGuard.js';

const ADMIN_ROLES = new Set(['admin', 'owner', 'superadmin']);

/**
 * EventSource (SSE) cannot send headers, so for `Accept: text/event-stream` GET
 * requests only, the token may be passed as `?access_token=`.
 */
function tokenFromRequest(req: Request): string | null {
  const header = extractBearerToken(req.headers.authorization);
  if (header) return header;
  const isSse = req.method === 'GET' && String(req.headers.accept || '').includes('text/event-stream');
  const queryToken = req.query?.access_token;
  return isSse && typeof queryToken === 'string' && queryToken ? queryToken : null;
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = tokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ code: 401, error: 'Unauthorized', message: 'Missing or invalid authentication token' });
  }

  const user = verifyAccessToken(token);
  if (!user) {
    return res.status(401).json({ code: 401, error: 'Unauthorized', message: 'Token expired or invalid' });
  }

  (req as any).user = user;
  // Make the acting user visible to AI cost guards for this request and any
  // async work it starts (see services/ai/AiUsageGuard.ts).
  runWithAiContext({ userId: user.id, role: user.role }, () => next());
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || !ADMIN_ROLES.has((user.role || '').toLowerCase())) {
    return res.status(403).json({ code: 403, error: 'Forbidden', message: 'Administrator permissions required' });
  }
  next();
};

/** True when the request carries the configured `X-Internal-Secret` (service-to-service calls). */
export function hasInternalSecret(req: Request): boolean {
  const expected = EnvConfig.internalApiSecret;
  const provided = req.headers['x-internal-secret'];
  return !!expected && typeof provided === 'string' && safeEqual(provided, expected);
}

/**
 * Allows either a trusted internal caller (Cloud Scheduler, render worker) via
 * `X-Internal-Secret`, or a logged-in admin user.
 */
export const requireInternalOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (hasInternalSecret(req)) {
    (req as any).user = { id: 'system', userId: 'system', role: 'system', tier: 'INTERNAL' };
    return runWithAiContext({ userId: 'system', role: 'system' }, () => next());
  }
  requireAuth(req, res, () => requireAdmin(req, res, next));
};

import { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import { EnvConfig } from '@/config/env.js';

/**
 * Allowed cross-origin callers. The SPA is served by this same server in
 * production, so same-origin requests need no CORS at all. Extra origins
 * (custom domains, the Vite dev server) come from CORS_ORIGINS / APP_URL.
 */
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>(EnvConfig.corsOrigins);
  if (process.env.APP_URL) origins.add(new URL(process.env.APP_URL).origin);
  if (!EnvConfig.isProduction) {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  return [...origins];
}

export function isOriginAllowed(origin: string | undefined): boolean {
  // Non-browser clients (curl, workers, server-to-server) send no Origin header.
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}

export function corsMiddleware() {
  const options: CorsOptions = {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  };
  return cors(options);
}

/**
 * Baseline security headers (subset of helmet, without a CSP — the editor relies
 * on blob:/wasm/WebCodecs and third-party media hosts that a strict CSP would break).
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (EnvConfig.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Bucket key; defaults to client IP. */
  keyFn?: (req: Request) => string;
  message?: string;
}

/**
 * Small in-memory fixed-window rate limiter. Per-instance only (Cloud Run may run
 * several instances), which is still enough to blunt brute-force and cost abuse.
 */
export function rateLimit({ windowMs, max, keyFn, message }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ code: 429, error: 'Too Many Requests', message: message || 'Too many requests, please try again later.' });
    }
    next();
  };
}

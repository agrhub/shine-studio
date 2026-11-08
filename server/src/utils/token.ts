import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { EnvConfig } from '@/config/env.js';

export interface AccessTokenUser {
  id: string;
  userId: string;
  email?: string;
  role: string;
  tier: string;
}

/**
 * Claims that mark a JWT as a short-lived, single-purpose token (signup OTP,
 * pending 2FA, OAuth `state`, ...). These are signed with the same secret as
 * access tokens, so they must never be accepted as a login session.
 */
const NON_ACCESS_CLAIMS = ['temp2fa', 'tempSignup', 'signupId', 'provider', 'purpose'];

/**
 * Verifies a bearer access token. Returns null for invalid/expired tokens and
 * for purpose-specific tokens (e.g. the pre-2FA temp token).
 */
export function verifyAccessToken(token: string | undefined | null): AccessTokenUser | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, EnvConfig.jwtSecret) as Record<string, any>;
    if (!decoded || typeof decoded !== 'object') return null;
    if (NON_ACCESS_CLAIMS.some((claim) => decoded[claim] !== undefined)) return null;

    const id = decoded.userId || decoded.id;
    if (!id || typeof id !== 'string') return null;

    return {
      id,
      userId: id,
      email: decoded.email,
      role: String(decoded.role || 'user').toLowerCase(),
      tier: decoded.tier || 'FREE',
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: unknown): string | null {
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

/** Constant-time string comparison (avoids leaking secret length/prefix via timing). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabaseProvider } from '@/database/index.js';
import type { UserEntity } from '@/types.js';
import { EnvConfig } from '@/config/env.js';

export const JWT_SECRET = EnvConfig.jwtSecret;

export interface DecodedAuthUser {
  id: string;
  email?: string;
  tier?: string;
  role?: string;
}

/**
 * Extracts and returns the authenticated userId from Request (headers/body/query)
 */
export function getUserId(req: Request | any, defaultUserId = ''): string {
  if (req?.user?.id) return req.user.id;
  if (req?.user?.userId) return req.user.userId;

  const authHeader = req?.headers?.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
      if (decoded?.userId) return decoded.userId;
      if (decoded?.id) return decoded.id;
    } catch {}
  }

  return defaultUserId;
}

/**
 * Retrieves the full authenticated UserEntity from Database via Request Token
 */
export async function getAuthUser(req: Request | any): Promise<UserEntity | null> {
  const userId = getUserId(req, '');
  if (!userId) return null;
  const db = await getDatabaseProvider();
  return await db.getUserById(userId);
}

import { Request } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { verifyAccessToken, extractBearerToken } from '@/utils/token.js';
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

  const user = verifyAccessToken(extractBearerToken(req?.headers?.authorization));
  if (user) return user.id;

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

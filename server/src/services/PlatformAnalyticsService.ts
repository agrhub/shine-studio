import axios from 'axios';
import { SocialAccount } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';

import { PlatformMetricItem } from '@/types.js';

export class PlatformAnalyticsService {
  /**
   * Fetches real performance metrics from YouTube Data API v3.
   */
  async fetchYouTubeMetrics(accessToken: string, channelId: string): Promise<PlatformMetricItem | null> {
    try {
      const res = await axios.get(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId || 'mine'}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 8000,
        }
      );

      const stats = res.data?.items?.[0]?.statistics;
      const snippet = res.data?.items?.[0]?.snippet;

      if (stats) {
        const viewCount = Number(stats.viewCount || 0);
        const commentCount = Number(stats.commentCount || 0);
        // YouTube average shorts monetization standard (~$0.04 - $0.06 per 1k views)
        const revenue = Number(((viewCount / 1000) * 0.05).toFixed(2));

        return {
          platform: 'youtube',
          channelName: snippet?.title || 'YouTube Channel',
          views: viewCount,
          // Channel statistics expose no like/share totals or retention; 0 = not reported.
          likes: 0,
          comments: commentCount,
          shares: 0,
          estimatedRevenue: revenue,
          retentionRatePct: 0,
          lastUpdated: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      Logger.warn(`[PlatformAnalyticsService] YouTube metrics fetch error: ${err.message}`);
    }
    return null;
  }

  /**
   * Fetches real performance metrics from TikTok Display API / Open API.
   */
  async fetchTikTokMetrics(accessToken: string, openId: string): Promise<PlatformMetricItem | null> {
    try {
      const res = await axios.get(
        `https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 8000,
        }
      );

      const data = res.data?.data?.user;
      if (data) {
        const likes = Number(data.likes_count || 0);

        return {
          platform: 'tiktok',
          channelName: data.display_name || 'TikTok Creator',
          // user/info reports likes only; views, comments, shares and retention are
          // not available from this endpoint (0 = not reported, never estimated).
          views: 0,
          likes,
          comments: 0,
          shares: 0,
          estimatedRevenue: 0,
          retentionRatePct: 0,
          lastUpdated: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      Logger.warn(`[PlatformAnalyticsService] TikTok metrics fetch error: ${err.message}`);
    }
    return null;
  }

  /**
   * Aggregates real metrics across all connected platform accounts for a given user.
   */
  async aggregateUserPlatformMetrics(userId: string) {
    try {
      let accounts: any[] = [];
      try {
        accounts = await SocialAccount.find({ userId, isActive: true });
      } catch (e) {
        // Fallback for non-mongo stores
      }

      // Query all connected platforms in parallel; one failing API does not block the rest.
      const results = await Promise.allSettled(
        accounts.map((account) => {
          if (!account.accessToken) return Promise.resolve(null);
          if (account.platform === 'youtube') return this.fetchYouTubeMetrics(account.accessToken, account.channelId);
          if (account.platform === 'tiktok') return this.fetchTikTokMetrics(account.accessToken, account.channelId);
          return Promise.resolve(null);
        })
      );
      return results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((m): m is PlatformMetricItem => Boolean(m));
    } catch (err: any) {
      Logger.warn(`[PlatformAnalyticsService] aggregateUserPlatformMetrics error: ${err.message}`);
      return [];
    }
  }
}

export const platformAnalyticsService = new PlatformAnalyticsService();

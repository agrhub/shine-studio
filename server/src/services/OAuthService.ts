import axios from 'axios';
import { nanoid } from 'nanoid';
import { getDatabaseProvider } from '~/database/index.js';
import type { PlatformAccount, PlatformSettings } from '@/types.js';
import { PlatformAnalyticsService } from './PlatformAnalyticsService';

export interface OAuthUserProfile {
  email: string;
  name: string;
  avatar: string;
  providerId: string;
}

export class OAuthService {
  /**
   * Build authorization URL for Single Sign-On (Google, GitHub, Facebook)
   */
  public static buildSSOAuthorizeUrl(
    provider: string,
    redirectUri: string,
    state: string,
    config: PlatformSettings
  ): string {
    if (provider === 'google') {
      const clientId = config?.sso?.google?.clientId || process.env.GOOGLE_CLIENT_ID;
      if (!clientId) throw new Error('Google OAuth Client ID is not configured in Platforms Admin Tab.');
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    if (provider === 'github') {
      const clientId = config?.sso?.github?.clientId || process.env.GITHUB_CLIENT_ID;
      if (!clientId) throw new Error('GitHub OAuth Client ID is not configured in Platforms Admin Tab.');
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'user:email read:user',
        state,
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    if (provider === 'facebook') {
      const appId = config?.sso?.facebook?.appId || process.env.FACEBOOK_APP_ID;
      if (!appId) throw new Error('Facebook App ID is not configured in Platforms Admin Tab.');
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        scope: 'email,public_profile',
        response_type: 'code',
        state,
      });
      return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    }

    throw new Error(`Unsupported SSO provider: ${provider}`);
  }

  /**
   * Exchange authorization code for User Profile from Google/GitHub/Facebook
   */
  public static async exchangeSSOCode(
    provider: string,
    code: string,
    redirectUri: string,
    config: PlatformSettings
  ): Promise<OAuthUserProfile> {
    if (provider === 'google') {
      const clientId = config?.sso?.google?.clientId || process.env.GOOGLE_CLIENT_ID;
      const clientSecret = config?.sso?.google?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured.');

      const tokenRes = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const accessToken = tokenRes.data.access_token;
      const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return {
        email: userRes.data.email,
        name: userRes.data.name || userRes.data.email.split('@')[0],
        avatar: userRes.data.picture || '',
        providerId: userRes.data.sub,
      };
    }

    if (provider === 'github') {
      const clientId = config?.sso?.github?.clientId || process.env.GITHUB_CLIENT_ID;
      const clientSecret = config?.sso?.github?.clientSecret || process.env.GITHUB_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('GitHub OAuth credentials not configured.');

      const tokenRes = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        },
        { headers: { Accept: 'application/json' } }
      );

      const accessToken = tokenRes.data.access_token;
      if (!accessToken) throw new Error(tokenRes.data.error_description || 'Failed to obtain GitHub access token');

      const userRes = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Shine-Studio' },
      });

      let email = userRes.data.email;
      if (!email) {
        try {
          const emailRes = await axios.get('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Shine-Studio' },
          });
          const primaryEmail = (emailRes.data as any[]).find((e) => e.primary && e.verified);
          if (primaryEmail) email = primaryEmail.email;
        } catch {}
      }

      return {
        email: email || `${userRes.data.login}@users.noreply.github.com`,
        name: userRes.data.name || userRes.data.login,
        avatar: userRes.data.avatar_url || '',
        providerId: String(userRes.data.id),
      };
    }

    if (provider === 'facebook') {
      const appId = config?.sso?.facebook?.appId || process.env.FACEBOOK_APP_ID;
      const appSecret = config?.sso?.facebook?.appSecret || process.env.FACEBOOK_APP_SECRET;
      if (!appId || !appSecret) throw new Error('Facebook App credentials not configured.');

      const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        },
      });

      const accessToken = tokenRes.data.access_token;
      const userRes = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: {
          fields: 'id,name,email,picture.width(200).height(200)',
          access_token: accessToken,
        },
      });

      return {
        email: userRes.data.email || `${userRes.data.id}@facebook.com`,
        name: userRes.data.name,
        avatar: userRes.data.picture?.data?.url || '',
        providerId: userRes.data.id,
      };
    }

    throw new Error(`Unsupported SSO provider: ${provider}`);
  }

  /**
   * Build authorization URL for Channel Publishing (YouTube, TikTok, Meta Reels)
   */
  public static buildChannelAuthorizeUrl(
    provider: string,
    redirectUri: string,
    state: string,
    config: PlatformSettings
  ): string {
    if (provider === 'youtube') {
      const clientId = config?.publishing?.youtube?.clientId || process.env.YOUTUBE_CLIENT_ID;
      if (!clientId) throw new Error('YouTube Client ID not configured in Platforms Admin Tab.');
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    if (provider === 'tiktok') {
      const clientKey = config?.publishing?.tiktok?.clientKey || process.env.TIKTOK_CLIENT_KEY;
      if (!clientKey) throw new Error('TikTok Client Key not configured in Platforms Admin Tab.');
      const params = new URLSearchParams({
        client_key: clientKey,
        scope: 'user.info.basic,video.upload,video.publish',
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
      });
      return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }

    if (provider === 'facebook') {
      const appId = config?.publishing?.facebook?.appId || process.env.FACEBOOK_APP_ID;
      if (!appId) throw new Error('Meta/Facebook App ID not configured in Platforms Admin Tab.');
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,public_profile',
        response_type: 'code',
        state,
      });
      return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    }

    throw new Error(`Unsupported publishing provider: ${provider}`);
  }

  /**
   * Exchange code and query real channel info from YouTube, TikTok, or Facebook APIs
   */
  public static async exchangeChannelCode(
    provider: string,
    code: string,
    redirectUri: string,
    config: PlatformSettings
  ): Promise<PlatformAccount[]> {
    if (provider === 'youtube') {
      const clientId = config?.publishing?.youtube?.clientId || process.env.YOUTUBE_CLIENT_ID;
      const clientSecret = config?.publishing?.youtube?.clientSecret || process.env.YOUTUBE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('YouTube credentials not configured.');

      const tokenRes = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, expires_in } = tokenRes.data;

      // Query real YouTube channel info
      const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { part: 'snippet,contentDetails,statistics', mine: true },
      });

      const items = channelRes.data.items || [];
      if (items.length === 0) {
        throw new Error('No active YouTube channel found for this Google account.');
      }

      return items.map((item: any) => ({
        id: `conn_yt_${item.id || nanoid(8)}`,
        provider: 'youtube',
        channel_id: item.id,
        channel_name: item.snippet?.title || 'YouTube Channel',
        handle: item.snippet?.customUrl || `@${item.snippet?.title?.toLowerCase().replace(/\s+/g, '_')}`,
        channel_avatar: item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.high?.url || '',
        access_token: access_token,
        refresh_token: refresh_token,
        expires_at: Date.now() + (expires_in || 3600) * 1000,
        connected_at: new Date().toISOString(),
        status: 'connected',
      }));
    }

    if (provider === 'tiktok') {
      const clientKey = config?.publishing?.tiktok?.clientKey || process.env.TIKTOK_CLIENT_KEY;
      const clientSecret = config?.publishing?.tiktok?.clientSecret || process.env.TIKTOK_CLIENT_SECRET;
      if (!clientKey || !clientSecret) throw new Error('TikTok credentials not configured.');

      const tokenRes = await axios.post(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, open_id, expires_in } = tokenRes.data.data || tokenRes.data;

      const userRes = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { fields: 'open_id,union_id,avatar_url,display_name,username' },
      });

      const data = userRes.data.data?.user || userRes.data.data || {};

      return [
        {
          id: `conn_tt_${open_id || nanoid(8)}`,
          provider: 'tiktok',
          channel_id: open_id || data.open_id || `tt_${nanoid(8)}`,
          channel_name: data.display_name || data.username || 'TikTok Creator',
          handle: data.username ? `@${data.username}` : '@tiktok_creator',
          channel_avatar: data.avatar_url || '',
          access_token: access_token,
          refresh_token: refresh_token,
          expires_at: Date.now() + (expires_in || 86400) * 1000,
          connected_at: new Date().toISOString(),
          status: 'connected',
        },
      ];
    }

    if (provider === 'facebook') {
      const appId = config?.publishing?.facebook?.appId || process.env.FACEBOOK_APP_ID;
      const appSecret = config?.publishing?.facebook?.appSecret || process.env.FACEBOOK_APP_SECRET;
      if (!appId || !appSecret) throw new Error('Facebook App credentials not configured.');

      const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        },
      });

      const userAccessToken = tokenRes.data.access_token;

      // Query real Facebook Pages connected to account
      const pagesRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: {
          fields: 'id,name,access_token,category,picture',
          access_token: userAccessToken,
        },
      });

      const pages = pagesRes.data.data || [];
      if (pages.length === 0) {
        // Fallback to user profile if no pages managed
        const meRes = await axios.get('https://graph.facebook.com/v18.0/me', {
          params: { fields: 'id,name,picture', access_token: userAccessToken },
        });
        return [
          {
            id: `conn_fb_${meRes.data.id}`,
            provider: 'facebook',
            channel_id: meRes.data.id,
            channel_name: `${meRes.data.name} (Personal)`,
            handle: `@${meRes.data.name.toLowerCase().replace(/\s+/g, '_')}`,
            channel_avatar: meRes.data.picture?.data?.url || '',
            access_token: userAccessToken,
            connected_at: new Date().toISOString(),
            status: 'connected',
          },
        ];
      }

      return pages.map((page: any) => ({
        id: `conn_fb_${page.id}`,
        provider: 'facebook',
        channel_id: page.id,
        channel_name: page.name,
        handle: `@${page.name.toLowerCase().replace(/\s+/g, '_')}`,
        channel_avatar: page.picture?.data?.url || '',
        access_token: page.access_token || userAccessToken,
        connected_at: new Date().toISOString(),
        status: 'connected',
      }));
    }

    throw new Error(`Unsupported publishing provider: ${provider}`);
  }

  /**
   * Automatically refreshes and returns a valid OAuth access token if expired.
   */
  public static async getValidAccessToken(
    account: PlatformAccount,
    userId?: string
  ): Promise<string> {
    if (!account.access_token) {
      throw new Error(`No access token found for ${account.provider || 'platform'}`);
    }

    const isExpired = account.expires_at ? (Date.now() >= (account.expires_at - 60_000)) : false;

    if (account.provider === 'youtube') {
      if (account.refresh_token && (isExpired || !account.access_token)) {
        try {
          const db = await getDatabaseProvider();
          const config = await db.getSystemSetting<PlatformSettings>('platform_admin_config');
          const clientId = config?.publishing?.youtube?.clientId || process.env.YOUTUBE_CLIENT_ID;
          const clientSecret = config?.publishing?.youtube?.clientSecret || process.env.YOUTUBE_CLIENT_SECRET;

          if (clientId && clientSecret) {
            const tokenRes = await axios.post(
              'https://oauth2.googleapis.com/token',
              new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: account.refresh_token,
                grant_type: 'refresh_token',
              }).toString(),
              { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { access_token, expires_in } = tokenRes.data;
            if (access_token) {
              account.access_token = access_token;
              account.expires_at = Date.now() + (expires_in || 3600) * 1000;

              if (userId) {
                const user = await db.getUserById(userId);
                if (user) {
                  const channels = (user.connected_channels || []).map((ch: any) => {
                    if (ch.id === account.id || ch.channel_id === account.channel_id) {
                      return { ...ch, access_token, expires_at: account.expires_at };
                    }
                    return ch;
                  });
                  await db.updateUser({ ...user, connected_channels: channels });
                }
              }
            }
          }
        } catch (e: any) {
          console.warn(`[OAuthService] Failed to auto-refresh YouTube token: ${e?.response?.data?.error_description || e?.message}`);
        }
      }
    }

    if (!account.access_token) {
      throw new Error(`Failed to obtain a valid access token for ${account.provider || 'platform'}`);
    }

    return account.access_token;
  }
}

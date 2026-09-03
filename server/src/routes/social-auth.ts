import { Router, Request, Response } from 'express';
import { SocialPlatform } from '@/types.js';
import axios from 'axios';
import { requireAuth } from '../middleware/RequireAuth.js';
import { EnvConfig } from '@/config/env.js';
import { getDatabaseProvider } from '~/database/index.js';
import { getUserId } from '~/utils/auth.js';
// import { SocialAccount } from '~/database/MongoDBProvider.js';

const router = Router();

// GET /api/v1/social/connect/:platform
router.get('/connect/:platform', requireAuth, (req: Request, res: Response) => {
  const { platform } = req.params;
  const userId = (req as any).user.id;
  const redirectUri = `${EnvConfig.appUrl}/api/v1/social/callback/${platform}`;
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
  
  let url = '';
  switch (platform) {
    case SocialPlatform.YOUTUBE:
      const ytClientId = EnvConfig.oauth.youtube.clientId || 'mock_yt_client_id';
      url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${ytClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl')}&state=${state}&access_type=offline`;
      break;
    case SocialPlatform.FACEBOOK:
      const fbClientId = EnvConfig.oauth.facebook.clientId || 'mock_fb_client_id';
      url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${fbClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('pages_manage_posts,pages_read_engagement')}&state=${state}`;
      break;
    case SocialPlatform.TIKTOK:
      const ttClientId = EnvConfig.oauth.tiktok.clientId || 'mock_tt_client_id';
      url = `https://www.tiktok.com/v2/auth/authorize?client_key=${ttClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('video.upload,video.publish,comment.list,comment.list.manage')}&state=${state}`;
      break;
    default:
      return res.status(400).json({ error: 'Unsupported platform' });
  }
  
  res.redirect(url);
});

// GET /api/v1/social/callback/:platform
router.get('/callback/:platform', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { code, state } = req.query;
    
    if (!state) {
      return res.status(400).send('Invalid state');
    }
    
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // const { userId } = JSON.parse(Buffer.from(state as string, 'base64').toString('ascii'));

    let accessToken = '';
    let refreshToken = '';
    let channelId = '';
    let channelName = '';

    const redirectUri = `${EnvConfig.appUrl}/api/v1/social/callback/${platform}`;

    // Real API Exchange
    if (platform === SocialPlatform.YOUTUBE) {
      const ytClientId = EnvConfig.oauth.youtube.clientId;
      const ytClientSecret = EnvConfig.oauth.youtube.clientSecret;
      
      if (!ytClientId || !ytClientSecret) throw new Error('YouTube credentials missing');
      
      const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: ytClientId,
        client_secret: ytClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });
      accessToken = tokenRes.data.access_token;
      refreshToken = tokenRes.data.refresh_token;

      // Get channel info
      const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      channelId = channelRes.data.items?.[0]?.id || `yt_unknown_${Date.now()}`;
      channelName = channelRes.data.items?.[0]?.snippet?.title || 'YouTube Channel';
      
    } else if (platform === SocialPlatform.FACEBOOK) {
      const fbClientId = EnvConfig.oauth.facebook.clientId;
      const fbClientSecret = EnvConfig.oauth.facebook.clientSecret;
      
      if (!fbClientId || !fbClientSecret) throw new Error('Facebook credentials missing');
      
      const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: fbClientId,
          redirect_uri: redirectUri,
          client_secret: fbClientSecret,
          code
        }
      });
      accessToken = tokenRes.data.access_token;

      const pageRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: accessToken }
      });
      // Pick the first page they manage
      channelId = pageRes.data.data?.[0]?.id || `fb_unknown_${Date.now()}`;
      channelName = pageRes.data.data?.[0]?.name || 'Facebook Page';
      // Use page access token instead of user access token
      if (pageRes.data.data?.[0]?.access_token) {
        accessToken = pageRes.data.data[0].access_token;
      }
      
    } else if (platform === SocialPlatform.TIKTOK) {
      const ttClientId = EnvConfig.oauth.tiktok.clientId;
      const ttClientSecret = EnvConfig.oauth.tiktok.clientSecret;
      
      if (!ttClientId || !ttClientSecret) throw new Error('TikTok credentials missing');
      
      const tokenRes = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
        client_key: ttClientId,
        client_secret: ttClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      accessToken = tokenRes.data.access_token;
      refreshToken = tokenRes.data.refresh_token;

      const userRes = await axios.get('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      channelId = userRes.data.data?.user?.open_id || `tt_unknown_${Date.now()}`;
      channelName = userRes.data.data?.user?.display_name || 'TikTok Profile';
    }

    const db = await getDatabaseProvider();

    await db.updateSocialAccount({
        user_id: userId,
        platform,
        channel_id: channelId,
        channel_name: channelName,
        access_token: accessToken,
        refresh_token: refreshToken,
        scopes: ['publish', 'comments'],
        is_active: true,
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Redirect to frontend Integrations Settings page
    const frontendUrl = EnvConfig.frontendUrl;
    res.redirect(`${frontendUrl}/dashboard/settings?integration_success=${platform}`);
  } catch (err: any) {
    res.status(500).send(`Failed to connect social account: ${err.message}`);
  }
});

// GET /api/v1/social/connections - List user's connected social accounts
router.get('/connections', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if(!userId){
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const db = await getDatabaseProvider();
    const connections = await db.listSocialAccounts(userId);
    res.json({ success: true, connections });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { requireAuth } from '../middleware/RequireAuth.js';
import { directorAgent } from '../agents/DirectorAgent.js';
import { SocialAccount, getDatabaseProvider } from '../database/index.js';

const router = Router();

// GET /api/v1/engagement/comments - Fetch real comments from connected platforms
router.get('/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { episodeId, platform } = req.query;

    if (!episodeId) {
      return res.status(400).json({ error: 'episodeId is required' });
    }

    const query: any = { userId, isActive: true };
    if (platform) {
      query.platform = platform;
    }

    const accounts = await SocialAccount.find(query);
    if (accounts.length === 0) {
      return res.status(403).json({ error: 'No active social accounts connected to fetch comments' });
    }

    const comments: Array<{
      id: string;
      platform: string;
      author: string;
      authorAvatar?: string;
      text: string;
      likes: number;
      timestamp: string;
      replyCount?: number;
    }> = [];

    for (const account of accounts) {
      try {
        if (account.platform === 'youtube' && account.accessToken) {
          // YouTube Data API v3: Fetch comment threads
          const endpoint = episodeId && !episodeId.toString().startsWith('ep_')
            ? `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(episodeId as string)}&maxResults=20`
            : `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&allThreadsRelatedToChannelId=${encodeURIComponent(account.channelId)}&maxResults=20`;

          const ytRes = await axios.get(endpoint, {
            headers: { Authorization: `Bearer ${account.accessToken}` },
            timeout: 8000,
          });

          if (ytRes.data && Array.isArray(ytRes.data.items)) {
            ytRes.data.items.forEach((item: any) => {
              const top = item.snippet?.topLevelComment?.snippet;
              if (top) {
                comments.push({
                  id: item.id || `yt_${Date.now()}`,
                  platform: 'youtube',
                  author: top.authorDisplayName || 'YouTube Viewer',
                  authorAvatar: top.authorProfileImageUrl,
                  text: top.textDisplay || top.textOriginal || '',
                  likes: top.likeCount || 0,
                  timestamp: top.publishedAt || new Date().toISOString(),
                  replyCount: item.snippet?.totalReplyCount || 0,
                });
              }
            });
          }
        } else if (account.platform === 'facebook' && account.accessToken) {
          // Facebook Graph API v18.0: Fetch comments
          const fbRes = await axios.get(`https://graph.facebook.com/v18.0/${encodeURIComponent(account.channelId)}/feed`, {
            params: {
              fields: 'id,message,comments{id,from,message,created_time,like_count}',
              access_token: account.accessToken,
              limit: 10,
            },
            timeout: 8000,
          });

          if (fbRes.data?.data) {
            fbRes.data.data.forEach((post: any) => {
              if (post.comments?.data) {
                post.comments.data.forEach((c: any) => {
                  comments.push({
                    id: c.id,
                    platform: 'facebook',
                    author: c.from?.name || 'Facebook User',
                    text: c.message || '',
                    likes: c.like_count || 0,
                    timestamp: c.created_time || new Date().toISOString(),
                  });
                });
              }
            });
          }
        } else if (account.platform === 'tiktok' && account.accessToken) {
          // TikTok Content API v2: Fetch comments
          const ttRes = await axios.get('https://open.tiktokapis.com/v2/video/comment/list/', {
            params: { video_id: episodeId, max_count: 20 },
            headers: { Authorization: `Bearer ${account.accessToken}` },
            timeout: 8000,
          });

          if (ttRes.data?.data?.comments) {
            ttRes.data.data.comments.forEach((c: any) => {
              comments.push({
                id: c.id,
                platform: 'tiktok',
                author: c.user?.display_name || 'TikTok User',
                authorAvatar: c.user?.avatar_url,
                text: c.text || '',
                likes: c.like_count || 0,
                timestamp: new Date(c.create_time * 1000).toISOString(),
                replyCount: c.reply_count || 0,
              });
            });
          }
        }
      } catch (err: any) {
        console.warn(`[Engagement] Failed to fetch comments for ${account.platform}:`, err.message);
      }
    }

    return res.json({
      code: 200,
      data: {
        episodeId,
        total: comments.length,
        comments,
      },
      message: 'Comments fetched successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/engagement/reply - Reply to a specific platform comment
router.post('/reply', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { commentId, platform, text } = req.body;

    if (!commentId || !platform || !text) {
      return res.status(400).json({ error: 'commentId, platform, and text are required' });
    }

    const account = await SocialAccount.findOne({ userId, platform, isActive: true });
    if (!account || !account.accessToken) {
      return res.status(403).json({ error: `You must connect your active ${platform} account to reply` });
    }

    let externalResult: any = null;

    if (platform === 'youtube') {
      const ytRes = await axios.post(
        'https://www.googleapis.com/youtube/v3/comments?part=snippet',
        {
          snippet: {
            parentId: commentId,
            textOriginal: text,
          },
        },
        {
          headers: { Authorization: `Bearer ${account.accessToken}` },
        }
      );
      externalResult = ytRes.data;
    } else if (platform === 'facebook') {
      const fbRes = await axios.post(
        `https://graph.facebook.com/v18.0/${encodeURIComponent(commentId)}/comments`,
        { message: text },
        { params: { access_token: account.accessToken } }
      );
      externalResult = fbRes.data;
    } else if (platform === 'tiktok') {
      const ttRes = await axios.post(
        'https://open.tiktokapis.com/v2/video/comment/reply/',
        { comment_id: commentId, text },
        { headers: { Authorization: `Bearer ${account.accessToken}` } }
      );
      externalResult = ttRes.data;
    }

    return res.json({
      code: 200,
      data: { success: true, commentId, platform, externalResult },
      message: 'Reply published successfully to social platform',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/engagement/analyze - AI Analysis of audience sentiment & script improvement points
router.post('/analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const { episodeId, comments } = req.body;

    if (!episodeId || !comments || !Array.isArray(comments) || comments.length === 0) {
      return res.status(400).json({ error: 'episodeId and non-empty comments array are required' });
    }

    const commentsSummary = comments
      .slice(0, 30)
      .map((c: any) => `- [${c.platform || 'Social'}] ${c.author || 'Viewer'}: "${c.text}" (Likes: ${c.likes || 0})`)
      .join('\n');

    const prompt = PromptLoader.render('trend/audience_engagement_analysis', {
      episodeId,
      commentsSummary,
    });

    const rawResponse = await aiProviderRouter.generateText({
      prompt,
      systemInstruction: 'You are an Audience Feedback Analysis AI specialized in short-form vertical drama viral retention.',
      jsonMode: true,
    });

    const parsed = JSON.parse(rawResponse);

    return res.json({
      code: 200,
      data: {
        episodeId,
        totalAnalyzed: comments.length,
        analysis: parsed,
      },
      message: 'Audience comments analyzed successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/engagement/feedback-to-script - Convert audience feedback into revised or next episode script
router.post('/feedback-to-script', requireAuth, async (req: Request, res: Response) => {
  try {
    const { seriesId, targetEpisodeNumber, analysis, customNotes } = req.body;

    if (!seriesId) {
      return res.status(400).json({ error: 'seriesId is required' });
    }

    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(seriesId);
    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    const feedbackNotes = [
      ...(analysis?.scriptSuggestions || []),
      ...(analysis?.topReactionTropes ? [`Audience loves: ${analysis.topReactionTropes.join(', ')}`] : []),
      ...(analysis?.audienceComplaints ? [`Fix complaints: ${analysis.audienceComplaints.join(', ')}`] : []),
      customNotes || '',
    ].filter(Boolean).join('. ');

    const augmentedSynopsis = `${series.synopsis || series.title}. [Audience Feedback Driven Adaptation: ${feedbackNotes}]`;

    const generatedResult = await directorAgent.runPipeline({
      title: series.title,
      genre: series.genre,
      visual_style: series.visual_style || 'realistic',
      synopsis: augmentedSynopsis,
      episode_number: targetEpisodeNumber || 2,
      total_episodes: series.episode_count || 20,
    });

    return res.json({
      code: 200,
      data: {
        seriesId,
        targetEpisodeNumber: targetEpisodeNumber || 2,
        generatedScript: generatedResult.scriptItem,
        supervision: generatedResult.supervision,
        outline: generatedResult.outline,
      },
      message: 'Next episode script generated with Audience Feedback loop integrated',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'SERVER_ERROR' });
  }
});

export default router;

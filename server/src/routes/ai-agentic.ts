import { Router, Request, Response } from 'express';
import { ChatbotAgent } from '../agents/ChatbotAgent.js';
import { Logger } from '../utils/logger.js';
import { getUserId } from '@/utils/auth.js';

export const aiAgenticRouter = Router();

/**
 * POST /api/ai/agentic/stream (or POST /api/ai/agentic)
 * Universal Google ADK Streaming SSE Endpoint
 */
const handleAgenticStream = async (req: Request, res: Response): Promise<void> => {
  const { session_id, series_id, episode_id, message, context } = req.body;
  const userId = getUserId(req);

  if (!userId) {
    res.status(401).json({ code: 401, data: null, message: 'Authentication required: user_id is missing' });
    return;
  }

  if (!message || typeof message !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'Message string is required' });
    return;
  }

  const activeSessionId = session_id || (series_id ? `${series_id}_${episode_id || 'main'}` : `wiz_${Date.now()}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    Logger.info(`[AgenticStream] Starting stream for user=${userId}, session=${activeSessionId}, series=${series_id || 'none'}`);

    await ChatbotAgent.chatStream({
      userId,
      seriesId: series_id || activeSessionId,
      episodeId: episode_id || 'main',
      userMessage: message,
      context,
      onChunk: (chunk: string) => {
        sendEvent('chunk', { text: chunk });
      },
      onToolCall: (toolCall: any) => {
        sendEvent('tool_call', toolCall);
      },
      onItemUpdated: (event: any) => {
        sendEvent('item_updated', event);
      },
      onProgress: (progress: any) => {
        sendEvent('step_progress', progress);
      },
      onSuggestions: (suggestions: any) => {
        sendEvent('suggestions', suggestions);
      },
    });

    sendEvent('done', { status: 'completed', session_id: activeSessionId });
  } catch (err: any) {
    Logger.error(`[AgenticStream] Error: ${err.message}`);
    sendEvent('error', { message: err.message });
  } finally {
    res.end();
  }
};

aiAgenticRouter.post('/stream', handleAgenticStream);
aiAgenticRouter.post('/', handleAgenticStream);

/**
 * GET /api/ai/agentic/history/:sessionId
 * Retrieve stored conversation history for a series or wizard session
 */
aiAgenticRouter.get('/history/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ code: 401, data: null, message: 'Authentication required: user_id is missing' });
      return;
    }

    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || 0), 10) || 0);

    const { messages, total } = await ChatbotAgent.getSeriesHistory(userId, sessionId, limit, offset);

    res.json({
      code: 200,
      data: {
        messages,
        total,
        limit,
        offset,
      },
      message: 'Conversation history loaded',
    });
  } catch (err: any) {
    res.status(500).json({
      code: 500,
      data: null,
      message: `Failed to load session history: ${err.message}`,
    });
  }
});

/**
 * POST /api/ai/agentic/transfer-session
 * Transfer wizard pre-creation conversation history into the newly created series
 */
aiAgenticRouter.post('/transfer-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const { old_session_id, new_series_id } = req.body;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ code: 401, data: null, message: 'Authentication required: user_id is missing' });
      return;
    }

    if (!old_session_id || !new_series_id) {
      res.status(400).json({ code: 400, data: null, message: 'old_session_id and new_series_id are required' });
      return;
    }

    const transferredCount = await ChatbotAgent.transferSession(userId, old_session_id, new_series_id);

    res.json({
      code: 200,
      data: {
        transferred_count: transferredCount,
        old_session_id,
        new_series_id,
      },
      message: `Transferred ${transferredCount} messages from session to series`,
    });
  } catch (err: any) {
    res.status(500).json({
      code: 500,
      data: null,
      message: `Failed to transfer session: ${err.message}`,
    });
  }
});

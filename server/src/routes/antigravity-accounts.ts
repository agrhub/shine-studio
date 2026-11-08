import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { antigravityOAuthService } from '@/integrations/ai/antigravity/AntigravityOAuthService.js';
import { antigravityClient } from '@/integrations/ai/antigravity/AntigravityClient.js';
import { Logger } from '@/utils/logger.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { EnvConfig } from '@/config/env.js';
import { escapeHtml, toScriptJson, openerPostMessageJs } from '@/utils/html.js';

const router = Router();

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// GET / - List all Antigravity accounts
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts();

    // Sanitize sensitive tokens for frontend display
    const sanitized = accounts.map((acc) => ({
      ...acc,
      access_token: acc.access_token ? `${acc.access_token.slice(0, 8)}...${acc.access_token.slice(-4)}` : '',
      refresh_token: acc.refresh_token ? `${acc.refresh_token.slice(0, 8)}...${acc.refresh_token.slice(-4)}` : '',
    }));

    res.json({ success: true, count: sanitized.length, accounts: sanitized });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

const OAUTH_STATE_PURPOSE = 'antigravity_oauth';

function buildRedirectUri(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}/api/antigravity-accounts/oauth/callback`;
}

function renderPopupResult(res: Response, status: number, title: string, bodyHtml: string, message: Record<string, unknown>, closeDelayMs: number): void {
  res.status(status).send(`
      <!DOCTYPE html>
      <html>
      <head><title>${escapeHtml(title)}</title><meta charset="utf-8">
      <style>
        body { background: #0f1015; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .badge { width: 48px; height: 48px; border-radius: 50%; background: rgba(59, 130, 246, 0.2); border: 2px solid #3b82f6; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #3b82f6; font-size: 24px; }
        .error { color: #f87171; }
        h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
        p { margin: 0; font-size: 13px; color: #9ca3af; }
      </style>
      </head>
      <body>
        ${bodyHtml}
        <script>
          var message = ${toScriptJson(message)};
          if (window.opener) {
            ${openerPostMessageJs('message')}
          }
          setTimeout(function () { window.close(); }, ${closeDelayMs});
        </script>
      </body>
      </html>
    `);
}

// GET /oauth/url - Authorization URL (admin only). The `state` binds the consent
// flow to the requesting admin so the public callback cannot be driven by anyone else.
router.get('/oauth/url', (req: Request, res: Response): void => {
  try {
    const redirectUri = buildRedirectUri(req);
    const state = jwt.sign(
      { purpose: OAUTH_STATE_PURPOSE, userId: (req as any).user?.id, nonce: crypto.randomBytes(8).toString('hex') },
      EnvConfig.jwtSecret,
      { expiresIn: '10m' }
    );
    const url = antigravityOAuthService.getAuthorizationUrl(redirectUri, state);

    res.json({ success: true, url, redirectUri });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

/**
 * Public router: only the Google OAuth redirect target lives here, because the
 * browser arrives from accounts.google.com without our Authorization header.
 * It is protected by the signed `state` issued by the admin-only /oauth/url.
 */
const publicRouter = Router();

// GET /oauth/callback - Google OAuth callback handler
publicRouter.get('/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, error, state } = req.query;

  if (error) {
    renderPopupResult(
      res, 400, 'Authorization Denied',
      `<h3 class="error">Authentication Failed</h3><p>${escapeHtml(error)}</p>`,
      { type: 'ANTIGRAVITY_AUTH_ERROR', error: String(error) },
      1500
    );
    return;
  }

  try {
    const decoded = jwt.verify(String(state || ''), EnvConfig.jwtSecret) as any;
    if (decoded?.purpose !== OAUTH_STATE_PURPOSE) throw new Error('wrong purpose');
  } catch {
    res.status(403).send('Invalid or expired OAuth state. Start the connection again from Studio Settings.');
    return;
  }

  if (!code || typeof code !== 'string') {
    res.status(400).send('Authorization code is missing');
    return;
  }

  try {
    const account = await antigravityOAuthService.exchangeCode(code, buildRedirectUri(req));

    renderPopupResult(
      res, 200, 'Antigravity Connected',
      `<div class="badge">✓</div>
        <h2>Antigravity Connected!</h2>
        <p>Successfully linked <strong>${escapeHtml(account.email)}</strong> to the Antigravity AI pool.</p>`,
      {
        type: 'ANTIGRAVITY_AUTH_SUCCESS',
        account: {
          id: account.id,
          email: account.email,
          name: account.name,
          avatar: account.avatar,
          tier: account.tier,
          project_id: account.project_id,
          status: account.status,
        },
      },
      700
    );
  } catch (err: unknown) {
    const errorMsg = getErrorMessage(err);
    Logger.error(`[AntigravityOAuth] Callback failed: ${errorMsg}`);
    renderPopupResult(
      res, 500, 'Authentication Error',
      `<h3 class="error">Authentication Failed</h3><p>${escapeHtml(errorMsg)}</p>`,
      { type: 'ANTIGRAVITY_AUTH_ERROR', error: errorMsg },
      2500
    );
  }
});

// POST /:id/refresh - Refresh a specific account
router.post('/:id/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts();
    const account = accounts.find((a) => a.id === req.params.id || a.email === req.params.id);

    if (!account) {
      res.status(404).json({ success: false, error: 'Antigravity account not found' });
      return;
    }

    await antigravityOAuthService.refreshAccessToken(account);
    const projectId = await antigravityOAuthService.discoverProjectId(account);

    res.json({
      success: true,
      message: `Account ${account.email} refreshed successfully`,
      project_id: projectId,
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// POST /sync-all - Refresh and verify all accounts
router.post('/sync-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await antigravityOAuthService.syncAllAccounts();
    res.json({ success: true, result });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// DELETE /:id - Remove an account
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const deleted = await db.deleteAntigravityAccount(req.params.id);
    res.json({ success: true, deleted });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// PATCH /:id/project - Update or customize Project ID
router.patch('/:id/project', async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId = '' } = req.body;
    const updated = await antigravityOAuthService.updateProjectId(req.params.id, projectId);
    res.json({ success: true, account: updated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// POST /:id/sync-quotas - Sync available models and quotas for an account
router.post('/:id/sync-quotas', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const accounts = await db.getAntigravityAccounts();
    const account = accounts.find((a) => a.id === req.params.id || a.email === req.params.id);
    if (!account) {
      res.status(404).json({ success: false, error: 'Antigravity account not found' });
      return;
    }

    const models = await antigravityOAuthService.syncAvailableModels(account);
    res.json({ success: true, models });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// POST /test-generate - Quick validation endpoint for Text generation
router.post('/test-generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt = 'Respond with "Antigravity pool is online and operational."' } = req.body;
    const result = await antigravityClient.generateText({ prompt });
    res.json({ success: true, text: result });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

/** Admin-only management API — mount behind requireAuth + requireAdmin. */
export const antigravityAccountsRouter = router;
/** Public OAuth callback only — mount at /api/antigravity-accounts. */
export const antigravityOAuthCallbackRouter = publicRouter;

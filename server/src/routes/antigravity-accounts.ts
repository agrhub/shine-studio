import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { antigravityOAuthService } from '@/integrations/ai/antigravity/AntigravityOAuthService.js';
import { antigravityClient } from '@/integrations/ai/antigravity/AntigravityClient.js';
import { Logger } from '@/utils/logger.js';

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

// GET /oauth/url - Get authorization URL for popup
router.get('/oauth/url', (req: Request, res: Response): void => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/antigravity-accounts/oauth/callback`;
    const url = antigravityOAuthService.getAuthorizationUrl(redirectUri);

    res.json({ success: true, url, redirectUri });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// GET /oauth/authorize - Direct redirect to Google OAuth
router.get('/oauth/authorize', (req: Request, res: Response): void => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/antigravity-accounts/oauth/callback`;
    const url = antigravityOAuthService.getAuthorizationUrl(redirectUri);

    res.redirect(url);
  } catch (err: unknown) {
    res.status(500).send(`Failed to generate authorization URL: ${getErrorMessage(err)}`);
  }
});

// GET /oauth/callback - Google OAuth callback handler
router.get('/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, error } = req.query;

  if (error) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Authorization Denied</title><meta charset="utf-8">
      <style>body { background: #0f1015; color: #f87171; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }</style>
      </head>
      <body>
        <h3>Authentication Failed</h3>
        <p>${error}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ANTIGRAVITY_AUTH_ERROR', error: ${JSON.stringify(error)} }, '*');
            setTimeout(() => window.close(), 1500);
          }
        </script>
      </body>
      </html>
    `);
    return;
  }

  if (!code || typeof code !== 'string') {
    res.status(400).send('Authorization code is missing');
    return;
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/antigravity-accounts/oauth/callback`;

    const account = await antigravityOAuthService.exchangeCode(code, redirectUri);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Antigravity Connected</title>
        <meta charset="utf-8">
        <style>
          body { background: #0f1015; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .badge { width: 48px; height: 48px; border-radius: 50%; background: rgba(59, 130, 246, 0.2); border: 2px solid #3b82f6; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #3b82f6; font-size: 24px; }
          h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
          p { margin: 0; font-size: 13px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="badge">✓</div>
        <h2>Antigravity Connected!</h2>
        <p>Successfully linked <strong>${account.email}</strong> to the Antigravity AI pool.</p>
        <script>
          const payload = {
            type: 'ANTIGRAVITY_AUTH_SUCCESS',
            account: {
              id: ${JSON.stringify(account.id)},
              email: ${JSON.stringify(account.email)},
              name: ${JSON.stringify(account.name)},
              avatar: ${JSON.stringify(account.avatar)},
              tier: ${JSON.stringify(account.tier)},
              project_id: ${JSON.stringify(account.project_id)},
              status: ${JSON.stringify(account.status)}
            }
          };
          if (window.opener) {
            window.opener.postMessage(payload, '*');
            setTimeout(() => window.close(), 700);
          } else {
            setTimeout(() => window.close(), 1200);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err: unknown) {
    const errorMsg = getErrorMessage(err);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Authentication Error</title><meta charset="utf-8">
      <style>body { background: #0f1015; color: #f87171; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }</style>
      </head>
      <body>
        <h3>Authentication Failed</h3>
        <p>${errorMsg}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ANTIGRAVITY_AUTH_ERROR', error: ${JSON.stringify(errorMsg)} }, '*');
            setTimeout(() => window.close(), 2500);
          }
        </script>
      </body>
      </html>
    `);
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

export const antigravityAccountsRouter = router;

import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { AIAccountType, AIAccountStatus, IAIAccount, FlowAccountEntity } from '~/types.js';
import { flowSyncService } from '../integrations/ai/flow/FlowSyncService.js';
import { captchaService } from '../integrations/ai/flow/CaptchaService.js';

const router = Router();

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// GET /api/admin/flow-accounts - List all google-flow accounts
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const accounts: FlowAccountEntity[] = await db.getFlowAccounts();
    res.json({ success: true, count: accounts.length, accounts });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

function extractFlowCookieToken(rawInput: string): string {
  if (!rawInput) return '';
  let str = String(rawInput).trim();
  str = str.replace(/^(Set-Cookie|Cookie):\s*/i, '');

  const priorityKeys = [
    '__Secure-next-auth.session-token',
    '__Host-next-auth.session-token',
    'next-auth.session-token',
    '__Secure-1PSID',
    '__Secure-3PSID',
    'sessionToken',
    'session_token',
    'session-token',
    'token',
    'session',
  ];

  for (const key of priorityKeys) {
    const escapedKey = key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const match = str.match(new RegExp(`(?:^|[;\\s,])${escapedKey}=([^;\\r\\n,]+)`, 'i'));
    if (match && match[1]) {
      try { return decodeURIComponent(match[1].trim()); } catch { return match[1].trim(); }
    }
  }

  const firstPairMatch = str.match(/^([a-zA-Z0-9_\-\.]+)=([^;\\r\\n,]+)/);
  if (firstPairMatch && firstPairMatch[2]) {
    try { return decodeURIComponent(firstPairMatch[2].trim()); } catch { return firstPairMatch[2].trim(); }
  }

  if (str.includes(';')) {
    const parts = str.split(';').map(p => p.trim());
    for (const part of parts) {
      if (part && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)=?/i.test(part)) {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
          const val = part.substring(eqIdx + 1).trim();
          try { return decodeURIComponent(val); } catch { return val; }
        }
        try { return decodeURIComponent(part); } catch { return part; }
      }
    }
  }

  return str;
}

// POST /api/admin/flow-accounts - Add or update google-flow session token
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, cookie } = req.body;
    const session_token = extractFlowCookieToken(cookie || '');

    if (!email || !session_token) {
      res.status(400).json({ error: 'Email and cookie are required' });
      return;
    }

    const db = await getDatabaseProvider();
    const accounts: FlowAccountEntity[] = await db.getFlowAccounts();
    const cleanEmail = email.trim();
    const existing = accounts.find(a => a.email?.toLowerCase() === cleanEmail.toLowerCase());

    const newAccount: FlowAccountEntity = await db.upsertFlowAccount({
      id: existing?.id || `flow_${cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      email: cleanEmail,
      session_token,
      status: AIAccountStatus.ACTIVE,
      credits_remaining: existing?.credits_remaining || 0,
      last_synced_at: new Date().toISOString(),
    });

    // Trigger background sync in non-blocking way with strongly typed IAIAccount
    const accountForSync: IAIAccount = {
      id: newAccount.id,
      email: cleanEmail,
      session_token,
      status: AIAccountStatus.ACTIVE,
      account_type: AIAccountType.GOOGLE_FLOW,
      is_active: true,
    };
    flowSyncService.refreshAccountTokens(accountForSync).catch((err: unknown) => {
      console.warn(`[flow-accounts] Background refresh failed for ${cleanEmail}:`, getErrorMessage(err));
    });

    res.status(200).json({
      code: 200,
      success: true,
      data: newAccount,
      account: newAccount,
      message: 'Flow Google Account added successfully',
      error: null,
    });
  } catch (err: unknown) {
    res.status(500).json({ code: 500, error: getErrorMessage(err), message: getErrorMessage(err) });
  }
});

// PUT /api/admin/flow-accounts/:id - Update session token for an existing account
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, cookie } = req.body;
    const session_token = extractFlowCookieToken(cookie || '');

    if (!session_token) {
      res.status(400).json({ code: 400, error: 'Valid cookie is required', message: 'Valid cookie is required' });
      return;
    }

    const db = await getDatabaseProvider();
    const accounts: FlowAccountEntity[] = await db.getFlowAccounts();
    const existing = accounts.find(a => a.id === id || a.email === email || a.email === id);
    const targetEmail = email || existing?.email;

    if (!targetEmail) {
      res.status(404).json({ code: 404, error: 'Account not found', message: 'Account not found' });
      return;
    }

    const updatedAccount: FlowAccountEntity = await db.upsertFlowAccount({
      id: existing?.id || id,
      email: targetEmail,
      session_token,
      status: AIAccountStatus.ACTIVE,
      credits_remaining: existing?.credits_remaining || 0,
      last_synced_at: new Date().toISOString(),
    });

    // Trigger immediate background token refresh and credit sync with strongly typed IAIAccount
    const accountForSync: IAIAccount = {
      id: updatedAccount.id,
      email: targetEmail,
      session_token,
      status: AIAccountStatus.ACTIVE,
      account_type: AIAccountType.GOOGLE_FLOW,
      is_active: true,
    };
    flowSyncService.refreshAccountTokens(accountForSync).catch((err: unknown) => {
      console.warn(`[flow-accounts] Background refresh failed for ${targetEmail}:`, getErrorMessage(err));
    });

    res.json({
      code: 200,
      success: true,
      message: 'Flow session token updated and validated successfully',
      data: updatedAccount,
      account: updatedAccount,
      error: null,
    });
  } catch (err: unknown) {
    res.status(500).json({ code: 500, error: getErrorMessage(err), message: getErrorMessage(err) });
  }
});

// POST /api/admin/flow-accounts/:id/refresh - Manually refresh token & credits for a specific account
router.post('/:id/refresh', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDatabaseProvider();
    const accounts: FlowAccountEntity[] = await db.getFlowAccounts();
    const target = accounts.find(a => a.id === id || a.email?.toLowerCase() === id.toLowerCase());

    if (!target) {
      res.status(404).json({ code: 404, success: false, error: 'Account not found', message: 'Account not found' });
      return;
    }

    if (!target.session_token) {
      res.status(400).json({ code: 400, success: false, error: 'Account has no session cookie', message: 'Account has no session cookie' });
      return;
    }

    const accountObj: IAIAccount = {
      id: target.id,
      email: target.email,
      session_token: target.session_token,
      access_token: target.access_token,
      project_id: target.project_id,
      status: target.status,
      credits: target.credits_remaining,
      account_type: AIAccountType.GOOGLE_FLOW,
      is_active: true,
    };

    await flowSyncService.refreshAccountTokens(accountObj);

    // Re-fetch updated record
    const updatedAccounts: FlowAccountEntity[] = await db.getFlowAccounts();
    const updated = updatedAccounts.find(a => a.id === target.id || a.email?.toLowerCase() === target.email.toLowerCase()) || target;

    const isSuccess = updated.status === 'ACTIVE' || updated.status === AIAccountStatus.READY;
    res.json({
      code: isSuccess ? 200 : 400,
      success: isSuccess,
      data: updated,
      account: updated,
      message: isSuccess ? 'Flow account token refreshed successfully' : 'Token refresh failed: Session expired',
      error: isSuccess ? null : 'SESSION_EXPIRED',
    });
  } catch (err: unknown) {
    res.status(500).json({ code: 500, success: false, error: getErrorMessage(err), message: getErrorMessage(err) });
  }
});

// DELETE /api/admin/flow-accounts/:id - Remove an account
router.delete('/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDatabaseProvider();
    await db.deleteFlowAccount(id);
    res.json({ code: 200, success: true, message: 'Account deleted', data: { id, deleted: true }, error: null });
  } catch (err: unknown) {
    res.status(500).json({ code: 500, error: getErrorMessage(err), message: getErrorMessage(err) });
  }
});

// POST /api/admin/flow-accounts/sync - Manual token refresh for all
router.post('/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    await flowSyncService.syncAllAccounts();
    const db = await getDatabaseProvider();
    const accounts: FlowAccountEntity[] = await db.getFlowAccounts();
    res.json({ success: true, message: 'Flow account pool synced successfully', accounts });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// GET /api/admin/flow-accounts/status - Pool health check
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const accounts: FlowAccountEntity[] = await db.getFlowAccounts('ACTIVE');
    let testRecaptcha: string | null = null;
    
    // Test recaptcha if there are accounts
    if (accounts.length > 0) {
      try {
        testRecaptcha = await captchaService.solve({
            projectId: accounts[0].project_id || 'test',
            action: 'IMAGE_GENERATION'
        });
      } catch (solveErr: unknown) {
        console.warn('[flow-accounts] Captcha test solve failed:', getErrorMessage(solveErr));
      }
    }

    res.json({
      success: true,
      poolHealth: accounts.length > 0 ? 'HEALTHY' : 'DEGRADED',
      activeAccounts: accounts.length,
      recaptchaSolverStatus: testRecaptcha ? 'OPERATIONAL' : 'FAILED',
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

export default router;

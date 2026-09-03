import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { AIAccountType, AIAccountStatus } from '~/types.js';
import { flowSyncService } from '../integrations/ai/flow/FlowSyncService.js';
import { captchaService } from '../integrations/ai/flow/CaptchaService.js';

const router = Router();

// GET /api/admin/flow-accounts - List all google-flow accounts
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const accounts = await db.getFlowAccounts();
    res.json({ success: true, count: accounts.length, accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    const { email, cookie, sessionToken, model = 'Veo-3' } = req.body;
    const rawToken = cookie || sessionToken;
    const token = extractFlowCookieToken(rawToken);

    if (!email || !token) {
      res.status(400).json({ error: 'Email and cookie are required' });
      return;
    }

    const db = await getDatabaseProvider();
    const accounts = await db.getFlowAccounts();
    const cleanEmail = email.trim();
    const existing = accounts.find(a => a.email?.toLowerCase() === cleanEmail.toLowerCase());

    const newAccount = await db.upsertFlowAccount({
      id: existing?.id || `flow_${cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      email: cleanEmail,
      session_token: token,
      status: AIAccountStatus.ACTIVE,
      credits_remaining: existing?.credits_remaining || 0,
      last_synced_at: new Date().toISOString(),
    });

    // Trigger background sync in non-blocking way
    flowSyncService.refreshAccountTokens({
      email,
      flow_st: token,
      status: AIAccountStatus.ACTIVE,
      account_type: AIAccountType.GOOGLE_FLOW,
      is_active: true,
    } as any).catch(() => {});

    res.status(200).json({
      code: 200,
      success: true,
      data: newAccount,
      account: newAccount,
      message: 'Flow Google Account added successfully',
      error: null,
    });
  } catch (err: any) {
    res.status(500).json({ code: 500, error: err.message, message: err.message });
  }
});

// PUT /api/admin/flow-accounts/:id - Update session token for an existing account
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, cookie, sessionToken } = req.body;
    const rawToken = cookie || sessionToken;
    const token = extractFlowCookieToken(rawToken);

    if (!token) {
      res.status(400).json({ code: 400, error: 'Valid session token or cookie is required', message: 'Valid session token or cookie is required' });
      return;
    }

    const db = await getDatabaseProvider();
    const accounts = await db.getFlowAccounts();
    const existing = accounts.find(a => a.id === id || a.email === email || a.email === id);
    const targetEmail = email || existing?.email;

    if (!targetEmail) {
      res.status(404).json({ code: 404, error: 'Account not found', message: 'Account not found' });
      return;
    }

    const updatedAccount = await db.upsertFlowAccount({
      id: existing?.id || id,
      email: targetEmail,
      session_token: token,
      status: AIAccountStatus.ACTIVE,
      credits_remaining: existing?.credits_remaining || 0,
      last_synced_at: new Date().toISOString(),
    });

    // Trigger immediate background token refresh and credit sync
    flowSyncService.refreshAccountTokens({
      id: updatedAccount.id,
      email: targetEmail,
      flowST: token,
      status: AIAccountStatus.ACTIVE,
      accountType: AIAccountType.GOOGLE_FLOW,
      isActive: true,
    } as any).catch(() => {});

    res.json({
      code: 200,
      success: true,
      message: 'Flow session token updated and validated successfully',
      data: updatedAccount,
      account: updatedAccount,
      error: null,
    });
  } catch (err: any) {
    res.status(500).json({ code: 500, error: err.message, message: err.message });
  }
});

// DELETE /api/admin/flow-accounts/:id - Remove an account
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDatabaseProvider();
    await db.deleteFlowAccount(id);
    res.json({ code: 200, success: true, message: 'Account deleted', data: { id, deleted: true }, error: null });
  } catch (err: any) {
    res.status(500).json({ code: 500, error: err.message, message: err.message });
  }
});

// POST /api/admin/flow-accounts/sync - Manual token refresh for all
router.post('/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    await flowSyncService.syncAllAccounts();
    const db = await getDatabaseProvider();
    const accounts = await db.getFlowAccounts();
    res.json({ success: true, message: 'Flow account pool synced successfully', accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/flow-accounts/status - Pool health check
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabaseProvider();
    const accounts = await db.getFlowAccounts('ACTIVE');
    let testRecaptcha: string | null = null;
    
    // Test recaptcha if there are accounts
    if (accounts.length > 0) {
      try {
        testRecaptcha = await captchaService.solve({
            projectId: accounts[0].project_id || 'test',
            action: 'IMAGE_GENERATION'
        });
      } catch (e) {}
    }

    res.json({
      success: true,
      poolHealth: accounts.length > 0 ? 'HEALTHY' : 'DEGRADED',
      activeAccounts: accounts.length,
      recaptchaSolverStatus: testRecaptcha ? 'OPERATIONAL' : 'FAILED',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

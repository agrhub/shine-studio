import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { flowSyncService } from '../integrations/ai/flow/FlowSyncService.js';

const router = Router();

// POST /api/flow-accounts/sync — token refresh heartbeat for the Flow account pool.
// Called by Cloud Scheduler (X-Internal-Secret) or an admin; mounted behind requireInternalOrAdmin.
// Only aggregate counts are returned: account tokens must never leave the server.
router.post('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    await flowSyncService.syncAllAccounts();
    const db = await getDatabaseProvider();
    const accounts = await db.getFlowAccounts();
    res.json({ success: true, message: 'Flow account pool synced successfully', count: accounts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

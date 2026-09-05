import EventEmitter from 'events';
EventEmitter.defaultMaxListeners = 100;

import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import './config/env.js';
import authRoutes from './routes/auth.js';
import seriesRoutes, { episodesRouter } from './routes/series';
import flowAccountsRoutes from './routes/flow-accounts';
import { antigravityAccountsRouter } from './routes/antigravity-accounts';
import contactRoutes from './routes/contact';
import { aiRouter } from './routes/ai';
import { characterRouter } from './routes/characters';
import { exportRouter } from './routes/export';
import voicesRoutes from './routes/voices';
import captionsRoutes from './routes/captions';
import audioRoutes from './routes/audio';
import cliffhangerRoutes from './routes/cliffhanger';
import { aiAssistantRouter } from './routes/ai-assistant';
import { aiAgenticRouter } from './routes/ai-agentic';
import { costGuardrailsRouter } from './routes/cost-guardrails';
import { publishRouter } from './routes/publish';
import { billingRouter } from './routes/billing';
import { marketplaceRouter } from './routes/marketplace';
import { novelConverterRouter } from './routes/novel-converter';
import { liveDramaRouter } from './routes/live-drama';
import { culturalAdaptRouter } from './routes/cultural-adapt';
import { analyticsPaywallRouter } from './routes/analytics';
import { copyrightRouter } from './routes/copyright';
import { adminRouter } from './routes/admin';
import { viralCoverRouter } from './routes/viral-cover';
import socialAuthRouter from './routes/social-auth';
import engagementRouter from './routes/engagement';
import { visualStylesRouter } from './routes/visualStyles';
import { assetsRouter } from './routes/assets';
import { uploadsRouter } from './routes/uploads';
import { pexelsRouter } from './routes/pexels';
import { PatchSyncService } from './realtime/PatchSyncService';
import flowSyncRouter from './routes/flow-sync';
import { flowSyncService } from './integrations/ai/flow/FlowSyncService';
import { aiProviderRouter } from './integrations/ai/router/AIProviderRouter';
import { telemetryService } from './config/telemetry';
import { getDatabaseProvider } from './database/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize active DB Provider (SQLite or MongoDB with automatic fallback)
getDatabaseProvider().catch((err) => console.warn('[Database] Provider initialization warning:', err));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

import { requireAuth, requireAdmin } from './middleware/RequireAuth.js';

import { jobsRouter } from './routes/jobs.js';

// ─── Public API Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/pexels', pexelsRouter);

// ─── Authenticated API Routes (Requires Valid JWT Token) ──────────────────────
app.use('/api/jobs', requireAuth, jobsRouter);
app.use('/api/series', requireAuth, seriesRoutes);
app.use('/api/episodes', requireAuth, episodesRouter);
app.use('/api/visual-styles', requireAuth, visualStylesRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api/characters', requireAuth, characterRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/voices', requireAuth, voicesRoutes);
app.use('/api/captions', requireAuth, captionsRoutes);
app.use('/api/audio', requireAuth, audioRoutes);
app.use('/api/transcribe', requireAuth, (req, res, next) => {
  req.url = '/transcribe';
  audioRoutes(req, res, next);
});
app.use('/api/ai/cliffhanger', requireAuth, cliffhangerRoutes);
app.use('/api/ai/assistant', requireAuth, aiAssistantRouter);
app.use('/api/chat/editor', requireAuth, (req, res, next) => {
  req.url = '/chat';
  aiAssistantRouter(req, res, next);
});
app.use('/api/ai/agentic', requireAuth, aiAgenticRouter);
app.use('/api/publish', requireAuth, publishRouter);
app.use('/api/projects', requireAuth, publishRouter);
app.use('/api/social', requireAuth, socialAuthRouter);
app.use('/api/engagement', requireAuth, engagementRouter);
app.use('/api/billing', requireAuth, billingRouter);
app.use('/api/marketplace', requireAuth, marketplaceRouter);
app.use('/api/live', requireAuth, liveDramaRouter);
app.use('/api/analytics', requireAuth, analyticsPaywallRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/flow-accounts/sync', flowSyncRouter);
app.use('/api/antigravity-accounts', antigravityAccountsRouter);

// ─── Admin Protected Routes (Requires Admin/Owner Role) ──────────────────────
app.use('/api/admin/flow-accounts', requireAuth, requireAdmin, flowAccountsRoutes);
app.use('/api/admin/antigravity-accounts', requireAuth, requireAdmin, antigravityAccountsRouter);
app.use('/api/admin/cost-guardrails', requireAuth, requireAdmin, costGuardrailsRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);


// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Shine API Server',
    version: '0.1.0-alpha',
    db_provider: process.env.DB_PROVIDER || 'sqlite',
    timestamp: new Date().toISOString(),
  });
});

// ─── Static Client Hosting (SPA) ─────────────────────────────────────────────
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDistCandidates = [
  path.resolve(process.cwd(), 'client', 'dist'),
  path.resolve(process.cwd(), '../client', 'dist'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../../../client/dist'),
];

let clientDistPath: string | null = null;
for (const p of clientDistCandidates) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    clientDistPath = p;
    break;
  }
}

if (clientDistPath) {
  console.log(`[Shine Server] Serving static client SPA from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));

  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath!, 'index.html'));
  });
}

// ─── Start Services & WebSocket HTTP Server ──────────────────────────────────
flowSyncService.start();
telemetryService.initialize();

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
const patchSyncService = new PatchSyncService(io);

httpServer.listen(PORT, () => {
  console.log(`[Shine Server] Express & Socket.io server running on http://localhost:${PORT}`);
});


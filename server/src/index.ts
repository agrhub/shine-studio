import EventEmitter from 'events';
EventEmitter.defaultMaxListeners = 100;

import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import './config/env.js';
import authRoutes from './routes/auth.js';
import seriesRoutes, { episodesRouter } from './routes/series';
import flowAccountsRoutes from './routes/flow-accounts';
import { antigravityAccountsRouter, antigravityOAuthCallbackRouter } from './routes/antigravity-accounts';
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

// Initialize active DB Provider and recover any pending deletions
getDatabaseProvider()
  .then(async () => {
    const { SeriesDeletionQueue } = await import('./services/SeriesDeletionQueue.js');
    SeriesDeletionQueue.recoverPendingDeletions().catch(err => {
      console.warn('[SeriesDeletionQueue] Recovery warning:', err?.message);
    });
  })
  .catch((err) => console.warn('[Database] Provider initialization warning:', err));

import { requireAuth, requireAdmin, requireInternalOrAdmin } from './middleware/RequireAuth.js';
import { corsMiddleware, securityHeaders, rateLimit, isOriginAllowed } from './middleware/Security.js';
import { verifyAccessToken } from './utils/token.js';
import { bodySeriesOwnershipGuard } from './middleware/Ownership.js';

/** Authenticated user + ownership check for series/episode ids passed in body/query. */
const authed = [requireAuth, bodySeriesOwnershipGuard];

// Cloud Run / load balancers append the real client IP as the last X-Forwarded-For hop.
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : 1);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use('/api', corsMiddleware());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Brute-force / abuse protection on unauthenticated entry points.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: 'Too many authentication attempts, please try again later.' });
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

import { jobsRouter } from './routes/jobs.js';

// ─── Public API Routes ───────────────────────────────────────────────────────
app.use('/api/auth', (req, res, next) => (req.method === 'POST' ? authLimiter(req, res, next) : next()), authRoutes);
app.use('/api/contact', (req, res, next) => (req.method === 'POST' ? contactLimiter(req, res, next) : next()), contactRoutes);
// Google OAuth redirect target for the Antigravity pool (protected by signed state, see route).
app.use('/api/antigravity-accounts', antigravityOAuthCallbackRouter);
// Media files are loaded by <img>/<video> tags that cannot send an Authorization header.
// Only GET /api/assets/file/* is public; every other /api/assets route requires a session.
app.use('/api/assets', (req, res, next) => {
  if (req.method === 'GET' && req.path.startsWith('/file/')) return next();
  return requireAuth(req, res, () => bodySeriesOwnershipGuard(req, res, next));
}, assetsRouter);

// ─── Authenticated API Routes (Requires Valid JWT Token) ──────────────────────
app.use('/api/pexels', authed, pexelsRouter);
app.use('/api/jobs', authed, jobsRouter);
app.use('/api/series', authed, seriesRoutes);
app.use('/api/episodes', authed, episodesRouter);
app.use('/api/visual-styles', authed, visualStylesRouter);
app.use('/api/ai', authed, aiRouter);
app.use('/api/characters', authed, characterRouter);
app.use('/api/export', authed, exportRouter);
app.use('/api/voices', authed, voicesRoutes);
app.use('/api/captions', authed, captionsRoutes);
app.use('/api/audio', authed, audioRoutes);
app.use('/api/transcribe', authed, (req, res, next) => {
  req.url = '/transcribe';
  audioRoutes(req, res, next);
});
app.use('/api/ai/cliffhanger', authed, cliffhangerRoutes);
app.use('/api/ai/assistant', authed, aiAssistantRouter);
app.use('/api/chat/editor', authed, (req, res, next) => {
  req.url = '/chat';
  aiAssistantRouter(req, res, next);
});
app.use('/api/ai/agentic', authed, aiAgenticRouter);
app.use('/api/publish', authed, publishRouter);
app.use('/api/projects', authed, publishRouter);
app.use('/api/social', authed, socialAuthRouter);
app.use('/api/engagement', authed, engagementRouter);
app.use('/api/billing', authed, billingRouter);
app.use('/api/marketplace', authed, marketplaceRouter);
app.use('/api/live', authed, liveDramaRouter);
app.use('/api/analytics', authed, analyticsPaywallRouter);
app.use('/api/uploads', authed, uploadsRouter);

// ─── Internal / Service-to-Service Routes (X-Internal-Secret or Admin) ────────
app.use('/api/flow-accounts/sync', requireInternalOrAdmin, flowSyncRouter);
app.use('/api/admin/workers', requireInternalOrAdmin, (req, res, next) => {
  req.url = `/workers${req.url}`;
  adminRouter(req, res, next);
});

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
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  allowRequest: (req, callback) => {
    // Same-origin browser requests and allowed cross-origin ones only.
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const sameOrigin = !!origin && !!host && new URL(origin).host === host;
    callback(null, !origin || sameOrigin || isOriginAllowed(origin));
  },
});

// Every realtime connection must present a valid access token (socket.io `auth.token`).
io.use((socket, next) => {
  const token = (socket.handshake.auth as any)?.token || '';
  const user = verifyAccessToken(typeof token === 'string' ? token.replace(/^Bearer\s+/, '') : '');
  if (!user) return next(new Error('Unauthorized'));
  socket.data.user = user;
  next();
});
const patchSyncService = new PatchSyncService(io);

httpServer.listen(PORT, () => {
  console.log(`[Shine Server] Express & Socket.io server running on http://localhost:${PORT}`);
});


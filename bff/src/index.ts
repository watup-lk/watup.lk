import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { requireAuth } from './middleware/auth';

const app  = express();
const PORT = process.env.PORT ?? '8080';

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:8080';
const SEARCH_URL   = process.env.SEARCH_SERVICE_URL   ?? 'http://search-service:8080';
const SALARY_URL   = process.env.SALARY_SERVICE_URL   ?? 'http://salary-service:8080';
const STATS_URL    = process.env.STATS_SERVICE_URL    ?? 'http://stats-service:8080';
const VOTE_URL     = process.env.VOTE_HTTP_SERVICE_URL ?? 'http://vote-service:8080';

app.use(express.json());

// CORS — allow frontend to call BFF
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health/live',  (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', (_req, res) => res.json({ status: 'ok' }));

// ── Auth (public — no JWT required) ──────────────────────────────────────────
// strips /api/auth prefix → identity-service sees /auth/signup, /auth/login etc.
app.use('/api/auth', createProxyMiddleware({
  target:      IDENTITY_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/auth' },
}));

// ── Search (public) ───────────────────────────────────────────────────────────
// /api/search?* → search-service /search?*
app.use('/api/search', createProxyMiddleware({
  target:      SEARCH_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/search': '/search' },
}));

// ── Salary submission (public — no login needed to submit) ────────────────────
app.use('/api/salary', createProxyMiddleware({
  target:      SALARY_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/salary': '/salary' },
}));

// ── Stats & Analytics (public) ────────────────────────────────────────────────
app.use('/api/stats', createProxyMiddleware({
  target:      STATS_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/stats': '/stats' },
}));

app.use('/api/analytics', createProxyMiddleware({
  target:      STATS_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/analytics': '/analytics' },
}));

// ── Vote queue (protected) ────────────────────────────────────────────────────
// GET /api/vote/queue — returns PENDING submissions for community review
app.use('/api/vote/queue', requireAuth, createProxyMiddleware({
  target:      SALARY_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/vote/queue': '/salary?status=PENDING' },
}));

// ── Vote (protected) ─────────────────────────────────────────────────────────
// POST /api/vote/:id — proxied to vote-service HTTP wrapper
app.use('/api/vote', requireAuth, createProxyMiddleware({
  target:      VOTE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/vote': '/vote' },
}));

// ── Report (protected) ────────────────────────────────────────────────────────
app.use('/api/report', requireAuth, createProxyMiddleware({
  target:      SALARY_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/report': '/report' },
}));

// ── Dashboard (protected) ─────────────────────────────────────────────────────
app.use('/api/dashboard', requireAuth, createProxyMiddleware({
  target:      SALARY_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/dashboard': '/dashboard' },
}));

// ── Admin (protected) ─────────────────────────────────────────────────────────
app.use('/api/admin', requireAuth, createProxyMiddleware({
  target:      SALARY_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/admin': '/admin' },
}));

app.listen(PORT, () => {
  console.log(`bff listening on :${PORT}`);
  console.log(`  identity → ${IDENTITY_URL}`);
  console.log(`  search   → ${SEARCH_URL}`);
  console.log(`  salary   → ${SALARY_URL}`);
  console.log(`  stats    → ${STATS_URL}`);
  console.log(`  vote     → ${VOTE_URL}`);
});

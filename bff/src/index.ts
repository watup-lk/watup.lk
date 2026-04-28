import express from 'express';
import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { requireAuth } from './middleware/auth';

const app  = express();
const PORT = process.env.PORT ?? '8080';

const IDENTITY_URL  = process.env.IDENTITY_SERVICE_URL  ?? 'http://identity-service:8080';
const SEARCH_URL    = process.env.SEARCH_SERVICE_URL    ?? 'http://search-service:8080';
const SALARY_URL    = process.env.SALARY_SERVICE_URL    ?? 'http://salary-service:8080';
const STATS_URL     = process.env.STATS_SERVICE_URL     ?? 'http://stats-service:8080';
const VOTE_HTTP_URL = process.env.VOTE_HTTP_SERVICE_URL ?? 'http://vote-service:8081';

// CORS — allow frontend to call BFF
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function searchFetch(path: string) {
  return fetch(`${SEARCH_URL}${path}`);
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health/live',  (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', (_req, res) => res.json({ status: 'ok' }));

// ── Auth (public — no JWT required) ──────────────────────────────────────────
// NOTE: proxy routes must come before express.json() — the body stream must be
// untouched so http-proxy-middleware can forward it as-is to the upstream.
app.use('/api/auth', createProxyMiddleware({
  target:       IDENTITY_URL,
  changeOrigin: true,
  pathRewrite:  { '^/': '/auth/' },
}));

// ── Search (public) ───────────────────────────────────────────────────────────
app.use('/api/search', createProxyMiddleware({
  target:       SEARCH_URL,
  changeOrigin: true,
  pathRewrite:  { '^/': '/search' },
}));

// ── Salary (public — supports anonymous submissions) ──────────────────────────
app.use('/api/salary', createProxyMiddleware({
  target:       SALARY_URL,
  changeOrigin: true,
  pathRewrite:  { '^/': '/salary' },
}));

// Body parser — registered after proxy routes so their streams are not consumed
app.use(express.json());

// ── Vote (protected) — forward to vote-service HTTP ──────────────────────────
app.post('/api/vote/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userID = req.headers['x-user-id'] as string;
    const upstream = await fetch(`${VOTE_HTTP_URL}/vote/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: req.body.type, user_id: userID }),
    });
    if (!upstream.ok) { res.status(upstream.status).json({ message: 'vote service error' }); return; }
    res.json(await upstream.json());
  } catch {
    res.status(502).json({ message: 'vote service unavailable' });
  }
});

// ── Vote queue (protected) — PENDING submissions from search-service ──────────
app.get('/api/vote/queue', requireAuth, async (_req: Request, res: Response) => {
  try {
    const path = '/search?limit=50';
    const upstream = await searchFetch(path);
    if (!upstream.ok) { res.status(upstream.status).json({ message: 'upstream error' }); return; }
    const body = await upstream.json() as { results: unknown[] };
    res.json(body.results);
  } catch {
    res.status(502).json({ message: 'search service unavailable' });
  }
});

// ── Dashboard (protected) — aggregated from search-service ───────────────────
app.get('/api/dashboard', requireAuth, async (_req: Request, res: Response) => {
  try {
    const [pendingRes, approvedRes] = await Promise.all([
      searchFetch('/search?status=PENDING&limit=10'),
      searchFetch('/search?limit=10'),
    ]);

    if (!pendingRes.ok || !approvedRes.ok) {
      res.status(502).json({ message: 'upstream error' }); return;
    }

    const pendingBody  = await pendingRes.json()  as { results: any[] };
    const approvedBody = await approvedRes.json() as { results: any[] };

    const APPROVAL_THRESHOLD = 5;

    const pendingSubmissions = pendingBody.results.map((s: any) => ({
      id:               s.id,
      role:             s.role,
      company:          s.company,
      monthlySalaryLKR: s.monthlySalaryLKR,
      votesFor:         s.upvotes   ?? 0,
      votesAgainst:     s.downvotes ?? 0,
      votesRequired:    APPROVAL_THRESHOLD,
    }));

    const recentlyApproved = approvedBody.results.map((s: any) => ({
      id:               s.id,
      role:             s.role,
      monthlySalaryLKR: s.monthlySalaryLKR,
      experienceLevel:  s.experienceLevel,
      companyType:      s.company,
    }));

    const salaries = approvedBody.results
      .map((s: any) => s.monthlySalaryLKR as number)
      .filter(Boolean);
    const avgSalaryLKR = salaries.length
      ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length)
      : 0;

    res.json({
      votesCast:            0,
      votesCastChange:      0,
      reportsFiled:         0,
      communityScore:       0,
      communityScoreChange: 0,
      avgSalaryLKR,
      avgSalaryChange:      0,
      pendingSubmissions,
      voteHistory:          [],
      recentlyApproved,
    });
  } catch {
    res.status(502).json({ message: 'search service unavailable' });
  }
});

// ── Stats (public) — proxy to stats-service ──────────────────────────────────
app.use('/api/stats', createProxyMiddleware({
  target:       STATS_URL,
  changeOrigin: true,
  pathRewrite:  { '^/': '/stats/' },
}));

// ── Analytics (public) — proxy to stats-service ───────────────────────────────
app.use('/api/analytics', createProxyMiddleware({
  target:       STATS_URL,
  changeOrigin: true,
  pathRewrite:  { '^/': '/analytics/' },
}));

app.listen(PORT, () => {
  console.log(`bff listening on :${PORT}`);
  console.log(`  identity → ${IDENTITY_URL}`);
  console.log(`  search   → ${SEARCH_URL}`);
  console.log(`  salary   → ${SALARY_URL}`);
  console.log(`  stats    → ${STATS_URL}`);
});

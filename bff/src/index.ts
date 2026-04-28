import express from 'express';
import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { requireAuth } from './middleware/auth';

const PORT = process.env.PORT ?? '8080';

export function createApp() {
  const app = express();
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

  async function searchFetch(path: string) {
    return fetch(`${SEARCH_URL}${path}`);
  }

  app.get('/health/live',  (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (_req, res) => res.json({ status: 'ok' }));

  // Proxy routes must come before express.json() so their streams are untouched.
  app.use('/api/auth', createProxyMiddleware({
    target:       IDENTITY_URL,
    changeOrigin: true,
    pathRewrite:  { '^/': '/auth' },
  }));

  app.use('/api/search', createProxyMiddleware({
    target:       SEARCH_URL,
    changeOrigin: true,
    pathRewrite:  { '^/': '/search' },
  }));

  app.use('/api/salary', createProxyMiddleware({
    target:       SALARY_URL,
    changeOrigin: true,
    pathRewrite:  { '^/': '/salary' },
  }));

  app.use(express.json());

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

  app.get('/api/vote/queue', requireAuth, async (_req: Request, res: Response) => {
    try {
      const path = '/search?status=PENDING&limit=50';
      const upstream = await searchFetch(path);
      if (!upstream.ok) { res.status(upstream.status).json({ message: 'upstream error' }); return; }
      const body = await upstream.json() as { results: unknown[] };
      res.json(body.results);
    } catch {
      res.status(502).json({ message: 'search service unavailable' });
    }
  });

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

  app.use('/api/stats', createProxyMiddleware({
    target:       STATS_URL,
    changeOrigin: true,
    pathRewrite:  { '^/': '/stats/' },
  }));

  app.use('/api/analytics', createProxyMiddleware({
    target:       STATS_URL,
    changeOrigin: true,
    pathRewrite:  { '^/': '/analytics/' },
  }));

  return app;
}

/* istanbul ignore next */
export function startServer() {
  const app = createApp();
  const IDENTITY_URL  = process.env.IDENTITY_SERVICE_URL  ?? 'http://identity-service:8080';
  const SEARCH_URL    = process.env.SEARCH_SERVICE_URL    ?? 'http://search-service:8080';
  const SALARY_URL    = process.env.SALARY_SERVICE_URL    ?? 'http://salary-service:8080';
  const STATS_URL     = process.env.STATS_SERVICE_URL     ?? 'http://stats-service:8080';

  return app.listen(PORT, () => {
    console.log(`bff listening on :${PORT}`);
    console.log(`  identity → ${IDENTITY_URL}`);
    console.log(`  search   → ${SEARCH_URL}`);
    console.log(`  salary   → ${SALARY_URL}`);
    console.log(`  stats    → ${STATS_URL}`);
  });
}

/* istanbul ignore next */
if (require.main === module) {
  startServer();
}

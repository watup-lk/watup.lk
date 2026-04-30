import express from 'express';
import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { requireAuth } from './middleware/auth';

const PORT = process.env.PORT ?? '8080';

const IDENTITY_URL  = process.env.IDENTITY_SERVICE_URL  ?? 'http://identity-service:8080';
const SEARCH_URL    = process.env.SEARCH_SERVICE_URL    ?? 'http://search-service:8080';
const SALARY_URL    = process.env.SALARY_SERVICE_URL    ?? 'http://salary-service:8080';
const STATS_URL     = process.env.STATS_SERVICE_URL     ?? 'http://stats-service:8080';
const VOTE_HTTP_URL = process.env.VOTE_HTTP_SERVICE_URL ?? 'http://vote-service:8080';

export function writeServiceUnavailable(serviceName: string, res: any) {
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({ message: `${serviceName} service unavailable` }));
}

export function serviceProxy(target: string, pathRewrite: Record<string, string>, serviceName: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (_err, _req, res: any) => {
        writeServiceUnavailable(serviceName, res);
      },
    },
  });
}

export function createApp() {
  const app = express();

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
app.use('/api/auth', serviceProxy(IDENTITY_URL, { '^/': '/auth/' }, 'identity'));

// ── Search (public) ───────────────────────────────────────────────────────────
app.use('/api/search', serviceProxy(SEARCH_URL, { '^/': '/search' }, 'search'));

// ── Salary (public — supports anonymous submissions) ──────────────────────────
app.use('/api/salary', serviceProxy(SALARY_URL, { '^/': '/salary' }, 'salary'));

// Body parser — registered after proxy routes so their streams are not consumed
app.use(express.json());

// ── Report (protected) — marks a submission as REPORTED ──────────────────────
app.post('/api/report/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const upstream = await fetch(`${SALARY_URL}/salary/${id}/report`, { method: 'POST' });
    if (!upstream.ok) { res.status(upstream.status).json({ message: 'failed to report submission' }); return; }
    res.status(204).end();
  } catch {
    res.status(502).json({ message: 'salary service unavailable' });
  }
});

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
app.get('/api/vote/queue', requireAuth, async (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string || 'all';
    const APPROVAL_THRESHOLD = 5;

    // 1. Fetch from search-service
    let searchPath = '/search?status=PENDING&limit=50';
    if (filter === 'recently-approved') {
        searchPath = '/search?status=APPROVED&limit=50';
    } else if (filter === 'reported') {
        searchPath = '/search?status=REPORTED&limit=50';
    }
    let searchRes: globalThis.Response;
    try {
      searchRes = await searchFetch(searchPath);
    } catch {
      res.status(502).json({ message: 'search service unavailable' });
      return;
    }
    if (!searchRes.ok) { res.status(searchRes.status).json({ message: 'search service error' }); return; }
    const searchBody = await searchRes.json() as { results: any[] | null };

    // 2. Fetch up-to-date counts from vote-service
    let voteRes: globalThis.Response;
    try {
      voteRes = await fetch(`${VOTE_HTTP_URL}/vote/counts`);
    } catch {
      res.status(502).json({ message: 'vote service unavailable' });
      return;
    }
    if (!voteRes.ok) { res.status(voteRes.status).json({ message: 'vote service error' }); return; }
    const voteBody = await voteRes.json() as { results: any[] };

    const voteMap = new Map();
    voteBody.results.forEach((v: any) => voteMap.set(v.submission_id, v));

    // 3. Merge data
    let merged = (searchBody.results ?? []).map((s: any) => {
        const counts = voteMap.get(s.id) || { up_count: 0, down_count: 0 };
        return {
            ...s, // Preserve all original search-service fields just in case
            id: s.id,
            role: s.role,
            company: s.company,
            country: s.country,
            city: s.city,
            monthlySalaryLKR: s.monthlySalaryLKR,
            currency: s.currency,
            yearsOfExperience: s.yearsOfExperience,
            experienceLevel: s.experienceLevel,
            workType: s.workType,
            anonymize: s.anonymize,
            status: s.status,
            createdAt: s.createdAt,
            // Overwrite with the latest, high-performance async counts
            upvotes: counts.up_count,
            downvotes: counts.down_count
        };
    });

    // 4. Filter if needs-vote
    if (filter === 'needs-vote') {
        merged = merged.filter((m: any) => (m.upvotes - m.downvotes) === (APPROVAL_THRESHOLD - 1));
    }

    res.json(merged);
  } catch {
    res.status(502).json({ message: 'search service unavailable' });
  }
});

// ── Dashboard (protected) — aggregated from search-service ───────────────────
app.get('/api/dashboard', requireAuth, async (_req: Request, res: Response) => {
  try {
    const [pendingRes, approvedRes, voteRes] = await Promise.all([
      searchFetch('/search?status=PENDING&limit=10'),
      searchFetch('/search?status=APPROVED&limit=10'),
      fetch(`${VOTE_HTTP_URL}/vote/counts`).catch(() => null),
    ]);

    if (!pendingRes.ok || !approvedRes.ok) {
      res.status(502).json({ message: 'search service error' }); return;
    }

    const pendingBody  = await pendingRes.json()  as { results: any[] };
    const approvedBody = await approvedRes.json() as { results: any[] };

    const APPROVAL_THRESHOLD = 5;

    // Merge vote counts into pending submissions when vote-service is available
    const voteMap = new Map<string, { up_count: number; down_count: number }>();
    if (voteRes && voteRes.ok) {
      const voteBody = await voteRes.json() as { results: any[] };
      voteBody.results.forEach((v: any) => voteMap.set(v.submission_id, v));
    }

    const pendingSubmissions = pendingBody.results.map((s: any) => {
      const counts = voteMap.get(s.id) ?? { up_count: 0, down_count: 0 };
      return {
        id:               s.id,
        role:             s.role,
        company:          s.company,
        monthlySalaryLKR: s.monthlySalaryLKR,
        votesFor:         counts.up_count,
        votesAgainst:     counts.down_count,
        votesRequired:    APPROVAL_THRESHOLD,
      };
    });

    const recentlyApproved = approvedBody.results.map((s: any) => ({
      id:               s.id,
      role:             s.role,
      monthlySalaryLKR: s.monthlySalaryLKR,
      experienceLevel:  s.experienceLevel,
      companyType:      s.company,
      workType:         s.workType,
      country:          s.country,
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
app.use('/api/stats', serviceProxy(STATS_URL, { '^/': '/stats/' }, 'stats'));

// ── Analytics (public) — proxy to stats-service ───────────────────────────────
app.use('/api/analytics', serviceProxy(STATS_URL, { '^/': '/analytics/' }, 'stats'));

return app;
}

/* istanbul ignore next */
if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`bff listening on :${PORT}`);
    console.log(`  identity → ${IDENTITY_URL}`);
    console.log(`  search   → ${SEARCH_URL}`);
    console.log(`  salary   → ${SALARY_URL}`);
    console.log(`  stats    → ${STATS_URL}`);
  });
}

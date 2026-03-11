import express from 'express';
import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { requireAuth } from './middleware/auth';

const app  = express();
const PORT = process.env.PORT ?? '8080';

const IDENTITY_URL  = process.env.IDENTITY_SERVICE_URL  ?? 'http://identity-service:8080';
const SEARCH_URL    = process.env.SEARCH_SERVICE_URL    ?? 'http://search-service:8080';
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
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
  pathRewrite:  { '^/': '/search/' },
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
app.get('/api/vote/queue', requireAuth, async (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined;
    const path = filter === 'recently-approved'
      ? '/search?limit=50'
      : '/search?status=PENDING&limit=50';
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

// ── Stats (public) — aggregated from search-service ──────────────────────────
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const { country, role } = req.query as Record<string, string | undefined>;
    const qs = new URLSearchParams();
    if (country && country !== 'Global') qs.set('country', country);
    if (role) qs.set('role', role);
    qs.set('limit', '500');

    const upstream = await searchFetch(`/search?${qs.toString()}`);
    if (!upstream.ok) { res.status(upstream.status).json({ message: 'upstream error' }); return; }
    const body = await upstream.json() as { results: any[] };

    const byRoleMap: Record<string, number[]> = {};
    for (const s of body.results) {
      if (!byRoleMap[s.role]) byRoleMap[s.role] = [];
      byRoleMap[s.role].push(s.monthlySalaryLKR);
    }

    const results = Object.entries(byRoleMap).map(([r, sals]) => {
      const sorted = [...sals].sort((a, b) => a - b);
      return {
        role:             r,
        country:          country ?? 'Global',
        count:            sorted.length,
        averageSalaryLKR: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        medianSalaryLKR:  Math.round(percentile(sorted, 50)),
        p25SalaryLKR:     Math.round(percentile(sorted, 25)),
        p75SalaryLKR:     Math.round(percentile(sorted, 75)),
      };
    });

    res.json(results);
  } catch {
    res.status(502).json({ message: 'search service unavailable' });
  }
});

// ── Analytics (public) — aggregated from search-service ──────────────────────
app.get('/api/analytics', async (req: Request, res: Response) => {
  try {
    const { country, role, year } = req.query as Record<string, string | undefined>;
    const qs = new URLSearchParams();
    if (country && country !== 'Global') qs.set('country', country);
    if (role) qs.set('role', role);
    qs.set('limit', '500');

    const upstream = await searchFetch(`/search?${qs.toString()}`);
    if (!upstream.ok) { res.status(upstream.status).json({ message: 'upstream error' }); return; }
    const body = await upstream.json() as { results: any[] };

    const allSalaries = body.results
      .map((s: any) => s.monthlySalaryLKR as number)
      .filter(Boolean)
      .sort((a, b) => a - b);

    const medianSalaryLKR = Math.round(percentile(allSalaries, 50));
    const p25SalaryLKR    = Math.round(percentile(allSalaries, 25));
    const p75SalaryLKR    = Math.round(percentile(allSalaries, 75));
    const approvedEntries = body.results.length;

    // By role
    const byRoleMap: Record<string, number[]> = {};
    for (const s of body.results) {
      if (!byRoleMap[s.role]) byRoleMap[s.role] = [];
      byRoleMap[s.role].push(s.monthlySalaryLKR);
    }
    const byRole = Object.entries(byRoleMap).map(([r, sals]) => {
      const sorted = [...sals].sort((a, b) => a - b);
      return {
        role:             r,
        country:          country ?? 'Global',
        count:            sorted.length,
        averageSalaryLKR: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        medianSalaryLKR:  Math.round(percentile(sorted, 50)),
        p25SalaryLKR:     Math.round(percentile(sorted, 25)),
        p75SalaryLKR:     Math.round(percentile(sorted, 75)),
      };
    });

    // Trend: group by month of createdAt for the target year
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const byMonth: Record<number, number[]> = {};
    for (const s of body.results) {
      const d = new Date(s.createdAt);
      if (d.getFullYear() !== targetYear) continue;
      const m = d.getMonth();
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(s.monthlySalaryLKR);
    }
    const trend = monthNames.map((month, i) => {
      const sals = (byMonth[i] ?? []).sort((a, b) => a - b);
      return { month, medianLKR: Math.round(percentile(sals, 50)) };
    });

    // By experience
    const expMap: Record<string, number> = {};
    for (const s of body.results) {
      const lvl = s.experienceLevel as string;
      expMap[lvl] = (expMap[lvl] ?? 0) + 1;
    }
    const expColors: Record<string, string> = {
      junior: '#3fb950', mid: '#00d4d4', senior: '#bc8cff', lead: '#e3b341', principal: '#f78166',
    };
    const expLabels: Record<string, string> = {
      junior: 'Junior (0-2y)', mid: 'Mid (2-5y)', senior: 'Senior (5-8y)',
      lead: 'Lead (8y+)', principal: 'Principal',
    };
    const total = approvedEntries || 1;
    const byExperience = Object.entries(expMap).map(([level, count]) => ({
      level,
      label:      expLabels[level] ?? level,
      percentage: Math.round((count / total) * 100),
      color:      expColors[level] ?? '#888',
    }));

    res.json({
      medianSalaryLKR,
      p25SalaryLKR,
      p75SalaryLKR,
      approvedEntries,
      approvedEntriesChange: 0,
      medianChange:          0,
      byRole,
      trend,
      byExperience,
    });
  } catch {
    res.status(502).json({ message: 'search service unavailable' });
  }
});

app.listen(PORT, () => {
  console.log(`bff listening on :${PORT}`);
  console.log(`  identity → ${IDENTITY_URL}`);
  console.log(`  search   → ${SEARCH_URL}`);
});

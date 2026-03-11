import {
  SalarySubmission,
  SearchFilters,
  StatsResult,
  AuthUser,
  DashboardData,
  AnalyticsData,
  AnalyticsFilters,
  AdminData,
  VoteFilter,
  SearchResult,
} from '@/types';

const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:4000';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BFF_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw { message: err.message ?? 'Request failed', statusCode: res.status };
  }

  return res.json();
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Salary submission ──────────────────────────────────────────────────────
export async function submitSalary(
  data: Omit<SalarySubmission, 'id' | 'status' | 'upvotes' | 'downvotes' | 'createdAt'>
): Promise<SalarySubmission> {
  return request('/api/salary', { method: 'POST', body: JSON.stringify(data) });
}

// ── Search ─────────────────────────────────────────────────────────────────
export async function searchSalaries(
  filters: SearchFilters
): Promise<SearchResult[]> {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][]
  );
  return request(`/api/search?${params.toString()}`);
}

// ── Stats ──────────────────────────────────────────────────────────────────
export async function getStats(
  filters: Pick<SearchFilters, 'country' | 'role'>
): Promise<StatsResult[]> {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][]
  );
  return request(`/api/stats?${params.toString()}`);
}

// ── Voting ─────────────────────────────────────────────────────────────────
export async function vote(
  salaryId: string,
  type: 'up' | 'down',
  token: string
): Promise<void> {
  return request(`/api/vote/${salaryId}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ type }),
  });
}

export async function getVotingQueue(
  filter: VoteFilter,
  token: string
): Promise<SalarySubmission[]> {
  return request(`/api/vote/queue?filter=${filter}`, {
    headers: authHeaders(token),
  });
}

export async function reportSalary(
  salaryId: string,
  reason: string,
  token: string
): Promise<void> {
  return request(`/api/report/${salaryId}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ reason }),
  });
}

// ── Identity ───────────────────────────────────────────────────────────────
export async function signup(email: string, password: string): Promise<AuthUser> {
  return request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<AuthUser> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export async function getDashboard(token: string): Promise<DashboardData> {
  return request('/api/dashboard', {
    headers: authHeaders(token),
  });
}

// ── Analytics ──────────────────────────────────────────────────────────────
export async function getAnalytics(filters: AnalyticsFilters): Promise<AnalyticsData> {
  const params = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  );
  return request(`/api/analytics?${params.toString()}`);
}

// ── Admin ──────────────────────────────────────────────────────────────────
export async function getAdminStats(token: string): Promise<AdminData> {
  return request('/api/admin/stats', {
    headers: authHeaders(token),
  });
}

export async function moderateEntry(
  id: string,
  action: 'approve' | 'reject',
  token: string
): Promise<void> {
  return request(`/api/admin/moderate/${id}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ action }),
  });
}

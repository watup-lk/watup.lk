import {
  getAdminStats,
  getAnalytics,
  getDashboard,
  getStats,
  getVotingQueue,
  login,
  moderateEntry,
  reportSalary,
  searchSalaries,
  signup,
  submitSalary,
  vote,
} from './api';

const fetchMock = jest.fn();

const salary = {
  id: 'salary-1',
  company: 'Watup',
  role: 'Backend Engineer',
  experienceLevel: 'senior',
  yearsOfExperience: 6,
  monthlySalaryLKR: 500000,
  country: 'LK',
  currency: 'LKR',
  workType: 'Remote',
  status: 'APPROVED',
  anonymize: true,
  upvotes: 4,
  downvotes: 1,
  createdAt: '2026-04-01T00:00:00.000Z',
};

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Request failed',
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('frontend API client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('submits salary payloads using the backend field names', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(salary));

    await expect(submitSalary({
      company: 'Watup',
      role: 'Backend Engineer',
      experienceLevel: 'senior',
      yearsOfExperience: 6,
      monthlySalaryLKR: 500000,
      country: 'LK',
      currency: 'LKR',
      workType: 'Remote',
      anonymize: true,
    })).resolves.toEqual(salary);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/salary',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          role: 'Backend Engineer',
          company: 'Watup',
          country: 'LK',
          currency: 'LKR',
          experience_level: 'senior',
          work_type: 'Remote',
          monthly_salary_lkr: 500000,
          years_of_experience: 6,
          anonymize: true,
        }),
      }),
    );
  });

  it('searches salaries with encoded filters and returns results', async () => {
    const results = [{ ...salary, votes: 3 }];
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ results }));

    await expect(searchSalaries({ country: 'LK', role: 'Backend Engineer' }))
      .resolves.toEqual(results);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/search?country=LK&role=Backend+Engineer',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('normalises empty search results to an empty array', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ results: null }));

    await expect(searchSalaries({ country: 'LK' })).resolves.toEqual([]);
  });

  it('gets stats with encoded filters', async () => {
    const stats = [{
      role: 'Backend Engineer',
      country: 'LK',
      count: 2,
      averageSalaryLKR: 450000,
      medianSalaryLKR: 430000,
      p25SalaryLKR: 390000,
      p75SalaryLKR: 500000,
    }];
    fetchMock.mockResolvedValueOnce(mockJsonResponse(stats));

    await expect(getStats({ country: 'LK', role: 'Backend Engineer' })).resolves.toEqual(stats);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/stats?country=LK&role=Backend+Engineer',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
  });

  it('logs in and normalises identity tokens into an auth user', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: '2026-04-28T10:00:00.000Z',
    }));

    await expect(login('dev@watup.lk', 'secret')).resolves.toEqual({
      id: '',
      email: 'dev@watup.lk',
      token: 'access-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'dev@watup.lk', password: 'secret' }),
      }),
    );
  });

  it('signs up and then logs in with the same credentials', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({ user_id: 'user-1' }))
      .mockResolvedValueOnce(mockJsonResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: '2026-04-28T10:00:00.000Z',
      }));

    await expect(signup('dev@watup.lk', 'secret')).resolves.toEqual({
      id: '',
      email: 'dev@watup.lk',
      token: 'access-token',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/api/auth/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'dev', email: 'dev@watup.lk', password: 'secret' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'dev@watup.lk', password: 'secret' }),
      }),
    );
  });

  it('sends authenticated vote requests', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}));

    await vote('salary-1', 'UP', 'jwt-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/vote/salary-1',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
        },
        body: JSON.stringify({ type: 'UP' }),
      }),
    );
  });

  it('fetches the authenticated voting queue', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse([salary]));

    await expect(getVotingQueue('needs-vote', 'jwt-token')).resolves.toEqual([salary]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/vote/queue?filter=needs-vote',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
        },
      }),
    );
  });

  it('reports a salary with an authenticated reason', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}));

    await reportSalary('salary-1', 'Duplicate', 'jwt-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/report/salary-1',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
        },
        body: JSON.stringify({ reason: 'Duplicate' }),
      }),
    );
  });

  it('fetches the authenticated dashboard payload', async () => {
    const dashboard = {
      votesCast: 3,
      votesCastChange: 1,
      reportsFiled: 0,
      communityScore: 98,
      communityScoreChange: 2,
      avgSalaryLKR: 420000,
      avgSalaryChange: 5,
      pendingSubmissions: [],
      voteHistory: [],
      recentlyApproved: [],
    };
    fetchMock.mockResolvedValueOnce(mockJsonResponse(dashboard));

    await expect(getDashboard('jwt-token')).resolves.toEqual(dashboard);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/dashboard',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
        },
      }),
    );
  });

  it('gets analytics with numeric filters encoded as query params', async () => {
    const analytics = {
      medianSalaryLKR: 500000,
      p25SalaryLKR: 350000,
      p75SalaryLKR: 650000,
      approvedEntries: 10,
      approvedEntriesChange: 0,
      medianChange: 25,
      byRole: [],
      byCompany: [],
      trend: [],
      byExperience: [],
    };
    fetchMock.mockResolvedValueOnce(mockJsonResponse(analytics));

    await expect(getAnalytics({ country: 'LK', role: 'Backend Engineer', year: 2026 }))
      .resolves.toEqual(analytics);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/analytics?country=LK&role=Backend+Engineer&year=2026',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
  });

  it('fetches admin stats with auth headers', async () => {
    const admin = {
      totalUsers: 10,
      totalUsersChange: 1,
      pendingReview: 2,
      approvedEntries: 8,
      approvedEntriesChange: 1,
      reportsQueue: 0,
      k8sServices: [],
      kafkaTopics: [],
      metrics: [],
      moderationQueue: [],
    };
    fetchMock.mockResolvedValueOnce(mockJsonResponse(admin));

    await expect(getAdminStats('jwt-token')).resolves.toEqual(admin);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/admin/stats',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
        },
      }),
    );
  });

  it('moderates entries with the requested action', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({}));

    await moderateEntry('salary-1', 'approve', 'jwt-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/admin/moderate/salary-1',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
        },
        body: JSON.stringify({ action: 'approve' }),
      }),
    );
  });

  it('throws the backend error message and status code', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ message: 'Unauthorized' }, false, 401));

    await expect(searchSalaries({ country: 'LK' })).rejects.toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
  });

  it('falls back to status text when the error body is not json', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: jest.fn().mockRejectedValue(new Error('not json')),
    });

    await expect(searchSalaries({ country: 'LK' })).rejects.toEqual({
      message: 'Bad Gateway',
      statusCode: 502,
    });
  });
});

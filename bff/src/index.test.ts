import request from 'supertest';
import { createApp } from './index';

const fetchMock = jest.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

function authResponse(userID = 'user-1') {
  return jsonResponse({ user_id: userID });
}

describe('bff app', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('serves health endpoints and CORS preflight', async () => {
    await expect(request(createApp()).get('/health/live')).resolves.toMatchObject({
      status: 200,
      body: { status: 'ok' },
    });

    const preflight = await request(createApp()).options('/api/vote/salary-1');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('*');
  });

  it('forwards authenticated vote requests to vote-service', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse('user-123'))
      .mockResolvedValueOnce(jsonResponse({ success: true, threshold_reached: true }));

    const res = await request(createApp())
      .post('/api/vote/salary-1')
      .set('Authorization', 'Bearer token')
      .send({ type: 'UP' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, threshold_reached: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://vote-service:8080/vote/salary-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'UP', user_id: 'user-123' }),
      }),
    );
  });

  it('returns upstream vote errors', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(jsonResponse({ message: 'bad vote' }, false, 400));

    const res = await request(createApp())
      .post('/api/vote/salary-1')
      .set('Authorization', 'Bearer token')
      .send({ type: 'UP' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'vote service error' });
  });

  it('returns bad gateway when vote-service is unavailable', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockRejectedValueOnce(new Error('vote unavailable'));

    const res = await request(createApp())
      .post('/api/vote/salary-1')
      .set('Authorization', 'Bearer token')
      .send({ type: 'UP' });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ message: 'vote service unavailable' });
  });

  it('loads pending vote queue through search-service', async () => {
    const pending = [{ id: 'salary-1', status: 'PENDING' }];
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(jsonResponse({ results: pending }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ submission_id: 'salary-1', up_count: 3, down_count: 1 }] }));

    const res = await request(createApp())
      .get('/api/vote/queue')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'salary-1', status: 'PENDING', upvotes: 3, downvotes: 1 }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://search-service:8080/search?status=PENDING&limit=50',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://vote-service:8080/vote/counts',
    );
  });

  it('returns bad gateway when vote queue search fails', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockRejectedValueOnce(new Error('search unavailable'));

    const res = await request(createApp())
      .get('/api/vote/queue')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ message: 'search service unavailable' });
  });

  it('returns search upstream errors for vote queue', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(jsonResponse({ message: 'search failed' }, false, 503));

    const res = await request(createApp())
      .get('/api/vote/queue')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: 'search service error' });
  });

  it('returns bad gateway when vote counts are unavailable for vote queue', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockRejectedValueOnce(new Error('vote unavailable'));

    const res = await request(createApp())
      .get('/api/vote/queue')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ message: 'vote service unavailable' });
  });

  it('builds the dashboard from pending and approved search results', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(jsonResponse({
        results: [{
          id: 'pending-1',
          role: 'Engineer',
          company: 'Acme',
          monthlySalaryLKR: 250000,
          upvotes: 3,
          downvotes: 1,
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        results: [{
          id: 'approved-1',
          role: 'Engineer',
          monthlySalaryLKR: 500000,
          experienceLevel: 'senior',
          company: 'Watup',
        }],
      }));

    const res = await request(createApp())
      .get('/api/dashboard')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.avgSalaryLKR).toBe(500000);
    expect(res.body.pendingSubmissions).toEqual([{
      id: 'pending-1',
      role: 'Engineer',
      company: 'Acme',
      monthlySalaryLKR: 250000,
      votesFor: 3,
      votesAgainst: 1,
      votesRequired: 5,
    }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://search-service:8080/search?status=PENDING&limit=10',
    );
  });

  it('uses dashboard defaults for missing votes and empty approved salaries', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(jsonResponse({
        results: [{
          id: 'pending-1',
          role: 'Engineer',
          company: null,
          monthlySalaryLKR: 250000,
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));

    const res = await request(createApp())
      .get('/api/dashboard')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.avgSalaryLKR).toBe(0);
    expect(res.body.pendingSubmissions[0]).toMatchObject({
      votesFor: 0,
      votesAgainst: 0,
    });
  });

  it('returns dashboard upstream errors', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(jsonResponse({}, false, 502))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));

    const res = await request(createApp())
      .get('/api/dashboard')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ message: 'search service error' });
  });

  it('returns bad gateway when dashboard search throws', async () => {
    fetchMock
      .mockResolvedValueOnce(authResponse())
      .mockRejectedValueOnce(new Error('search unavailable'));

    const res = await request(createApp())
      .get('/api/dashboard')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ message: 'search service unavailable' });
  });
});

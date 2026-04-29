import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';

const fetchMock = jest.fn();

function createResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

describe('requireAuth', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('rejects requests without a bearer token', async () => {
    const req = { headers: {} } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing or invalid Authorization header' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid or expired tokens', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const req = { headers: { authorization: 'Bearer expired-token' } } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://identity-service:8080/auth/validate',
      { headers: { Authorization: 'Bearer expired-token' } },
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the validated user id before continuing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ user_id: 'user-123' }),
    });
    const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(req.headers['x-user-id']).toBe('user-123');
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns a bad gateway response when identity service is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const req = { headers: { authorization: 'Bearer token' } } as Request;
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ message: 'identity service unavailable' });
    expect(next).not.toHaveBeenCalled();
  });
});

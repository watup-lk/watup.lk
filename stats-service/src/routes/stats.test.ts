import express from 'express';
import request from 'supertest';
import pool from '../db/postgres';
import { analyticsRouter, statsRouter } from './stats';

jest.mock('../db/postgres', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

function createApp() {
  const app = express();
  app.use('/stats', statsRouter);
  app.use('/analytics', analyticsRouter);
  return app;
}

describe('stats routes', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns salary statistics for the requested filters', async () => {
    const rows = [
      {
        role: 'Software Engineer',
        country: 'LK',
        count: 3,
        averageSalaryLKR: 350000,
        medianSalaryLKR: 340000,
        p25SalaryLKR: 280000,
        p75SalaryLKR: 420000,
      },
    ];
    queryMock.mockResolvedValueOnce({ rows });

    const res = await request(createApp())
      .get('/stats')
      .query({ country: 'LK', role: 'Software Engineer' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ['LK', 'Software Engineer', 'LK']);
  });

  it('returns an internal error when the stats query fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error('database unavailable'));

    const res = await request(createApp()).get('/stats');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'internal error' });
    jest.restoreAllMocks();
  });

  it('builds the analytics payload from the expected query results', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          approvedEntries: 10,
          medianSalaryLKR: 500000,
          p25SalaryLKR: 350000,
          p75SalaryLKR: 650000,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ median: 400000 }] })
      .mockResolvedValueOnce({
        rows: [{
          role: 'Backend Engineer',
          country: 'LK',
          count: 4,
          averageSalaryLKR: 520000,
          medianSalaryLKR: 500000,
          p25SalaryLKR: 420000,
          p75SalaryLKR: 610000,
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { month: '2026-01-01T00:00:00.000Z', medianLKR: 450000 },
          { month: '2026-03-01T00:00:00.000Z', medianLKR: 520000 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{
          company: 'Watup',
          count: 2,
          medianSalaryLKR: 700000,
          p25SalaryLKR: 650000,
          p75SalaryLKR: 750000,
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { level: 'junior', count: 3 },
          { level: 'senior', count: 7 },
        ],
      });

    const res = await request(createApp())
      .get('/analytics')
      .query({ country: 'LK', role: 'Backend Engineer', year: '2026' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      medianSalaryLKR: 500000,
      p25SalaryLKR: 350000,
      p75SalaryLKR: 650000,
      approvedEntries: 10,
      medianChange: 25,
      byRole: expect.any(Array),
      byCompany: expect.any(Array),
      byExperience: [
        {
          level: 'junior',
          label: 'Junior (0-2y)',
          percentage: 30,
          color: '#3fb950',
        },
        {
          level: 'senior',
          label: 'Senior (5-8y)',
          percentage: 70,
          color: '#bc8cff',
        },
      ],
    });
    expect(res.body.trend[0]).toEqual({ month: 'Jan', medianLKR: 450000 });
    expect(res.body.trend[1]).toEqual({ month: 'Feb', medianLKR: 0 });
    expect(res.body.trend[2]).toEqual({ month: 'Mar', medianLKR: 520000 });
    expect(queryMock).toHaveBeenCalledTimes(6);
  });

  it('returns an internal error when the analytics query fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error('analytics query failed'));

    const res = await request(createApp()).get('/analytics');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'internal error' });
    jest.restoreAllMocks();
  });

  it('uses analytics fallbacks for empty totals and unknown experience levels', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          approvedEntries: 0,
          medianSalaryLKR: null,
          p25SalaryLKR: null,
          p75SalaryLKR: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { level: 'contractor', count: 1 },
        ],
      });

    const res = await request(createApp()).get('/analytics');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      medianSalaryLKR: 0,
      p25SalaryLKR: 0,
      p75SalaryLKR: 0,
      approvedEntries: 0,
      medianChange: 0,
      byRole: [],
      byCompany: [],
      byExperience: [{
        level: 'contractor',
        label: 'contractor',
        percentage: 100,
        color: '#888',
      }],
    });
    expect(res.body.trend).toHaveLength(12);
    expect(res.body.trend.every((point: { medianLKR: number }) => point.medianLKR === 0)).toBe(true);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [null, null, new Date().getFullYear()]);
  });
});

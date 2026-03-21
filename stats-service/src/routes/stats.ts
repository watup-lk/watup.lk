import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db/postgres';

// ── GET /stats?country=LK&role=Software+Engineer ──────────────────────────────
// Returns salary percentile stats grouped by role, computed entirely in SQL.
export const statsRouter = Router();

statsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const country = (req.query.country as string | undefined) || null;
    const role    = (req.query.role    as string | undefined) || null;

    const { rows } = await pool.query(
      `SELECT
         role,
         $3::text                                                                  AS country,
         COUNT(*)::int                                                              AS count,
         ROUND(AVG(salary_amount))::int                                             AS "averageSalaryLKR",
         ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY salary_amount))::int   AS "medianSalaryLKR",
         ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary_amount))::int   AS "p25SalaryLKR",
         ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary_amount))::int   AS "p75SalaryLKR"
       FROM salary_schema.submissions
       WHERE status = 'APPROVED'
         AND ($1::text IS NULL OR country = $1)
         AND ($2::text IS NULL OR role    = $2)
       GROUP BY role
       ORDER BY count DESC`,
      [country, role, country ?? 'Global'],
    );

    res.json(rows);
  } catch (err) {
    console.error('stats error', err);
    res.status(500).json({ message: 'internal error' });
  }
});

// ── GET /analytics?country=LK&role=&year=2025 ────────────────────────────────
// Returns the full analytics payload consumed by the frontend analytics page.
export const analyticsRouter = Router();

analyticsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const country    = (req.query.country as string | undefined) || null;
    const role       = (req.query.role    as string | undefined) || null;
    const targetYear = parseInt(
      (req.query.year as string | undefined) ?? String(new Date().getFullYear()), 10,
    );

    // ── Overall percentiles & total count ──────────────────────────────────
    const overallRes = await pool.query(
      `SELECT
         COUNT(*)::int                                                              AS "approvedEntries",
         ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY salary_amount))::int   AS "medianSalaryLKR",
         ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary_amount))::int   AS "p25SalaryLKR",
         ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary_amount))::int   AS "p75SalaryLKR"
       FROM salary_schema.submissions
       WHERE status = 'APPROVED'
         AND ($1::text IS NULL OR country = $1)
         AND ($2::text IS NULL OR role    = $2)`,
      [country, role],
    );
    const overall = overallRes.rows[0];

    // ── Previous month median for change calculation ────────────────────────
    const prevMonthRes = await pool.query(
      `SELECT
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary_amount))::int AS median
       FROM salary_schema.submissions
       WHERE status = 'APPROVED'
         AND ($1::text IS NULL OR country = $1)
         AND ($2::text IS NULL OR role    = $2)
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) - INTERVAL '1 month'`,
      [country, role],
    );
    const prevMedian   = prevMonthRes.rows[0]?.median ?? 0;
    const medianChange = overall.medianSalaryLKR && prevMedian
      ? Math.round(((overall.medianSalaryLKR - prevMedian) / prevMedian) * 100)
      : 0;

    // ── By role ────────────────────────────────────────────────────────────
    const byRoleRes = await pool.query(
      `SELECT
         role,
         $3::text                                                                  AS country,
         COUNT(*)::int                                                              AS count,
         ROUND(AVG(salary_amount))::int                                             AS "averageSalaryLKR",
         ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY salary_amount))::int   AS "medianSalaryLKR",
         ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary_amount))::int   AS "p25SalaryLKR",
         ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary_amount))::int   AS "p75SalaryLKR"
       FROM salary_schema.submissions
       WHERE status = 'APPROVED'
         AND ($1::text IS NULL OR country = $1)
         AND ($2::text IS NULL OR role    = $2)
       GROUP BY role
       ORDER BY count DESC`,
      [country, role, country ?? 'Global'],
    );

    // ── Monthly trend for target year ──────────────────────────────────────
    const trendRes = await pool.query(
      `SELECT
         DATE_TRUNC('month', created_at)                                           AS month,
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary_amount))::int    AS "medianLKR"
       FROM salary_schema.submissions
       WHERE status = 'APPROVED'
         AND ($1::text IS NULL OR country = $1)
         AND ($2::text IS NULL OR role    = $2)
         AND EXTRACT(YEAR FROM created_at) = $3
       GROUP BY month
       ORDER BY month`,
      [country, role, targetYear],
    );

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const trendMap: Record<number, number> = {};
    for (const row of trendRes.rows) {
      trendMap[new Date(row.month).getMonth()] = row.medianLKR;
    }
    const trend = monthNames.map((month, i) => ({
      month,
      medianLKR: trendMap[i] ?? 0,
    }));

    // ── By experience level ────────────────────────────────────────────────
    const expRes = await pool.query(
      `SELECT
         experience_level AS level,
         COUNT(*)::int    AS count
       FROM salary_schema.submissions
       WHERE status = 'APPROVED'
         AND ($1::text IS NULL OR country = $1)
         AND ($2::text IS NULL OR role    = $2)
       GROUP BY experience_level`,
      [country, role],
    );

    const expColors: Record<string, string> = {
      junior: '#3fb950', mid: '#00d4d4', senior: '#bc8cff',
      lead: '#e3b341', principal: '#f78166',
    };
    const expLabels: Record<string, string> = {
      junior: 'Junior (0-2y)', mid: 'Mid (2-5y)', senior: 'Senior (5-8y)',
      lead: 'Lead (8y+)', principal: 'Principal',
    };
    const total        = overall.approvedEntries || 1;
    const byExperience = expRes.rows.map((row: { level: string; count: number }) => ({
      level:      row.level,
      label:      expLabels[row.level] ?? row.level,
      percentage: Math.round((row.count / total) * 100),
      color:      expColors[row.level] ?? '#888',
    }));

    res.json({
      medianSalaryLKR:       overall.medianSalaryLKR ?? 0,
      p25SalaryLKR:          overall.p25SalaryLKR    ?? 0,
      p75SalaryLKR:          overall.p75SalaryLKR    ?? 0,
      approvedEntries:       overall.approvedEntries  ?? 0,
      approvedEntriesChange: 0,
      medianChange,
      byRole:                byRoleRes.rows,
      trend,
      byExperience,
    });
  } catch (err) {
    console.error('analytics error', err);
    res.status(500).json({ message: 'internal error' });
  }
});

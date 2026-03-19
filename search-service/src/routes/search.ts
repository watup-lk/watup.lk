import { Router, Request, Response } from 'express';
import pool from '../db/postgres';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { role, company, country, experience_level, query, page, limit } = req.query as Record<string, string | undefined>;

  const pageNum  = Math.max(1, parseInt(page  ?? '1',  10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
  const offset   = (pageNum - 1) * limitNum;

  // Build WHERE clauses dynamically
  const conditions: string[] = ["s.status = 'APPROVED'"];
  const params: unknown[]    = [];

  if (role) {
    params.push(`%${role}%`);
    conditions.push(`s.role ILIKE $${params.length}`);
  }
  if (company) {
    params.push(`%${company}%`);
    conditions.push(`s.company ILIKE $${params.length}`);
  }
  if (country) {
    params.push(country);
    conditions.push(`s.country = $${params.length}`);
  }
  if (experience_level) {
    params.push(experience_level);
    conditions.push(`s.experience_level = $${params.length}`);
  }
  if (query) {
    if (query.trim().length < 3) {
      params.push(`%${query}%`);
      conditions.push(`(s.role ILIKE $${params.length} OR s.company ILIKE $${params.length})`);
    } else {
      params.push(query);
      conditions.push(
        `to_tsvector('english', coalesce(s.role,'') || ' ' || coalesce(s.company,'')) @@ plainto_tsquery('english', $${params.length})`
      );
    }
  }

  const where = conditions.join(' AND ');

  // Count query for pagination
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM salary_schema.submissions s WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Main query — anonymize company name when is_anonymized = true
  // LEFT JOIN vote counts from community_schema
  params.push(limitNum, offset);
  const dataResult = await pool.query(
    `SELECT
        s.id,
        s.role,
        CASE WHEN s.is_anonymized THEN 'Anonymous' ELSE s.company END AS company,
        s.country,
        s.city,
        s.salary_amount                  AS "monthlySalaryLKR",
        s.currency,
        s.experience_years               AS "yearsOfExperience",
        s.experience_level               AS "experienceLevel",
        s.work_type                      AS "workType",
        s.is_anonymized                  AS anonymize,
        s.status,
        COALESCE(v.up_count,   0)        AS upvotes,
        COALESCE(v.down_count, 0)        AS downvotes,
        s.created_at                     AS "createdAt"
     FROM salary_schema.submissions s
     LEFT JOIN community_schema.submission_vote_counts v ON v.submission_id = s.id
     WHERE ${where}
     ORDER BY s.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    results: dataResult.rows,
    pagination: {
      total,
      page:  pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

export default router;

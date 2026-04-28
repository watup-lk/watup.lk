package repository

import (
	"context"
	"database/sql"
	"strings"
)

type Result struct {
	ID                string  `json:"id"`
	Role              string  `json:"role"`
	Company           *string `json:"company"`
	Country           string  `json:"country"`
	City              *string `json:"city"`
	MonthlySalaryLKR  float64 `json:"monthlySalaryLKR"`
	Currency          string  `json:"currency"`
	YearsOfExperience *int    `json:"yearsOfExperience"`
	ExperienceLevel   *string `json:"experienceLevel"`
	WorkType          *string `json:"workType"`
	Anonymize         bool    `json:"anonymize"`
	Status            string  `json:"status"`
	Upvotes           int     `json:"upvotes"`
	Downvotes         int     `json:"downvotes"`
	CreatedAt         string  `json:"createdAt"`
}

type SearchFilter struct {
	Role            string
	Company         string
	Country         string
	ExperienceLevel string
	Query           string
	Status          string
	Page            int
	Limit           int
}

type SearchResult struct {
	Results    []Result   `json:"results"`
	Pagination Pagination `json:"pagination"`
}

type Pagination struct {
	Total int `json:"total"`
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Pages int `json:"pages"`
}

type PostgresRepo struct {
	db *sql.DB
}

func NewPostgresRepo(db *sql.DB) *PostgresRepo {
	return &PostgresRepo{db: db}
}

func (r *PostgresRepo) Ping(ctx context.Context) error {
	return r.db.PingContext(ctx)
}

func (r *PostgresRepo) Search(ctx context.Context, f SearchFilter) (SearchResult, error) {
	status := strings.ToUpper(strings.TrimSpace(f.Status))
	if status == "" {
		status = "APPROVED"
	}
	args := []any{status}
	conds := []string{"s.status = $1"}
	i := 2

	if f.Role != "" {
		conds = append(conds, "s.role ILIKE $"+itoa(i))
		args = append(args, "%"+f.Role+"%")
		i++
	}
	if f.Company != "" {
		conds = append(conds, "s.company ILIKE $"+itoa(i))
		args = append(args, "%"+f.Company+"%")
		i++
	}
	if f.Country != "" {
		conds = append(conds, "s.country = $"+itoa(i))
		args = append(args, strings.ToUpper(f.Country))
		i++
	}
	if f.ExperienceLevel != "" {
		conds = append(conds, "s.experience_level = $"+itoa(i))
		args = append(args, f.ExperienceLevel)
		i++
	}
	if f.Query != "" {
		conds = append(conds, `(s.role ILIKE $`+itoa(i)+` OR s.company ILIKE $`+itoa(i)+")")
		args = append(args, "%"+f.Query+"%")
		i++
	}

	where := strings.Join(conds, " AND ")

	var total int
	countQ := "SELECT COUNT(*) FROM salary_schema.submissions s WHERE " + where
	if err := r.db.QueryRowContext(ctx, countQ, args...).Scan(&total); err != nil {
		return SearchResult{}, err
	}

	args = append(args, f.Limit, (f.Page-1)*f.Limit)
	limitPos := itoa(i)
	offsetPos := itoa(i + 1)

	dataQ := `
		SELECT
			s.id,
			s.role,
			CASE WHEN s.is_anonymized THEN NULL ELSE s.company END AS company,
			s.country,
			s.city,
			s.salary_amount,
			s.currency,
			s.experience_years,
			s.experience_level,
			s.work_type,
			s.is_anonymized,
			s.status,
			COALESCE(v.up_count,   0) AS upvotes,
			COALESCE(v.down_count, 0) AS downvotes,
			to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
		FROM salary_schema.submissions s
		LEFT JOIN community_schema.submission_vote_counts v ON v.submission_id = s.id
		WHERE ` + where + `
		ORDER BY s.created_at DESC
		LIMIT $` + limitPos + ` OFFSET $` + offsetPos

	rows, err := r.db.QueryContext(ctx, dataQ, args...)
	if err != nil {
		return SearchResult{}, err
	}
	defer rows.Close()

	var results []Result
	for rows.Next() {
		var row Result
		if err := rows.Scan(
			&row.ID, &row.Role, &row.Company, &row.Country, &row.City,
			&row.MonthlySalaryLKR, &row.Currency, &row.YearsOfExperience,
			&row.ExperienceLevel, &row.WorkType, &row.Anonymize,
			&row.Status, &row.Upvotes, &row.Downvotes, &row.CreatedAt,
		); err != nil {
			return SearchResult{}, err
		}
		results = append(results, row)
	}
	if err := rows.Err(); err != nil {
		return SearchResult{}, err
	}

	pages := total / f.Limit
	if total%f.Limit != 0 {
		pages++
	}

	return SearchResult{
		Results: results,
		Pagination: Pagination{
			Total: total,
			Page:  f.Page,
			Limit: f.Limit,
			Pages: pages,
		},
	}, nil
}

func itoa(i int) string {
	const digits = "0123456789"
	if i < 10 {
		return string(digits[i])
	}
	return itoa(i/10) + string(digits[i%10])
}

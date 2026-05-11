package repository

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

type Submission struct {
	ID              string
	Role            string
	Company         *string
	Country         string
	City            *string
	SalaryAmount    float64
	Currency        string
	ExperienceYears *int
	ExperienceLevel *string
	WorkType        *string
	IsAnonymized    bool
	Status          string
	CreatedAt       time.Time
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

type FindFilter struct {
	Role            string
	Country         string
	ExperienceLevel string
	WorkType        string
	Currency        string
}

func (r *PostgresRepo) FindApproved(ctx context.Context, f FindFilter) ([]Submission, error) {
	args := []any{"APPROVED"}
	conds := []string{"status = $1"}
	i := 2

	if f.Role != "" {
		conds = append(conds, "role ILIKE $"+itoa(i))
		args = append(args, "%"+f.Role+"%")
		i++
	}
	if f.Country != "" {
		conds = append(conds, "country = $"+itoa(i))
		args = append(args, strings.ToUpper(f.Country))
		i++
	}
	if f.ExperienceLevel != "" {
		conds = append(conds, "experience_level = $"+itoa(i))
		args = append(args, f.ExperienceLevel)
		i++
	}
	if f.WorkType != "" {
		conds = append(conds, "work_type = $"+itoa(i))
		args = append(args, f.WorkType)
		i++
	}
	if f.Currency != "" {
		conds = append(conds, "currency = $"+itoa(i))
		args = append(args, strings.ToUpper(f.Currency))
		i++
	}

	q := `SELECT id, role, company, country, city, salary_amount, currency,
	             experience_years, experience_level, work_type, is_anonymized, status, created_at
	      FROM submissions
	      WHERE ` + strings.Join(conds, " AND ") + `
	      ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Submission
	for rows.Next() {
		var s Submission
		if err := rows.Scan(
			&s.ID, &s.Role, &s.Company, &s.Country, &s.City,
			&s.SalaryAmount, &s.Currency, &s.ExperienceYears,
			&s.ExperienceLevel, &s.WorkType, &s.IsAnonymized,
			&s.Status, &s.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type CreateParams struct {
	Role            string
	Company         *string
	Country         string
	City            *string
	SalaryAmount    float64
	Currency        string
	ExperienceYears *int
	ExperienceLevel *string
	WorkType        *string
	IsAnonymized    bool
}

func (r *PostgresRepo) Create(ctx context.Context, p CreateParams) (Submission, error) {
	const q = `
		INSERT INTO submissions
			(role, company, country, city, salary_amount, currency,
			 experience_years, experience_level, work_type, is_anonymized, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')
		RETURNING id, role, company, country, city, salary_amount, currency,
		          experience_years, experience_level, work_type, is_anonymized, status, created_at`

	var s Submission
	err := r.db.QueryRowContext(ctx, q,
		p.Role, p.Company, p.Country, p.City, p.SalaryAmount, p.Currency,
		p.ExperienceYears, p.ExperienceLevel, p.WorkType, p.IsAnonymized,
	).Scan(
		&s.ID, &s.Role, &s.Company, &s.Country, &s.City,
		&s.SalaryAmount, &s.Currency, &s.ExperienceYears,
		&s.ExperienceLevel, &s.WorkType, &s.IsAnonymized,
		&s.Status, &s.CreatedAt,
	)
	return s, err
}

func (r *PostgresRepo) ApproveSubmission(ctx context.Context, submissionID string) error {
	const q = `UPDATE submissions SET status = 'APPROVED' WHERE id = $1 AND status = 'PENDING'`
	_, err := r.db.ExecContext(ctx, q, submissionID)
	return err
}

func (r *PostgresRepo) ReportSubmission(ctx context.Context, submissionID string) error {
	const q = `UPDATE submissions SET status = 'REPORTED' WHERE id = $1`
	_, err := r.db.ExecContext(ctx, q, submissionID)
	return err
}

func itoa(i int) string {
	const digits = "0123456789"
	if i < 10 {
		return string(digits[i])
	}
	return itoa(i/10) + string(digits[i%10])
}

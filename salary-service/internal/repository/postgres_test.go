package repository

import (
	"context"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestFindApprovedBuildsFilterQueryAndScansRows(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	company := "Acme"
	city := "Colombo"
	years := 5
	level := "senior"
	workType := "Remote"
	createdAt := time.Date(2026, 4, 28, 10, 30, 0, 0, time.UTC)

	rows := sqlmock.NewRows([]string{
		"id", "role", "company", "country", "city", "salary_amount", "currency",
		"experience_years", "experience_level", "work_type", "is_anonymized", "status", "created_at",
	}).AddRow(
		"sub-1", "Backend Engineer", company, "LK", city, 450000.0, "LKR",
		years, level, workType, false, "APPROVED", createdAt,
	)

	mock.ExpectQuery(regexp.QuoteMeta("FROM submissions")).
		WithArgs(
			"APPROVED",
			"%Engineer%",
			"LK",
			"senior",
			"Remote",
			"LKR",
		).
		WillReturnRows(rows)

	results, err := repo.FindApproved(context.Background(), FindFilter{
		Role:            "Engineer",
		Country:         "lk",
		ExperienceLevel: "senior",
		WorkType:        "Remote",
		Currency:        "lkr",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	got := results[0]
	if got.ID != "sub-1" || got.Role != "Backend Engineer" || got.Country != "LK" {
		t.Fatalf("unexpected row: %#v", got)
	}
	if got.Company == nil || *got.Company != company {
		t.Fatalf("expected company %q, got %#v", company, got.Company)
	}
	if got.ExperienceYears == nil || *got.ExperienceYears != years {
		t.Fatalf("expected %d years, got %#v", years, got.ExperienceYears)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestFindApprovedReturnsQueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("FROM submissions")).
		WithArgs("APPROVED").
		WillReturnError(errors.New("database down"))

	if _, err := repo.FindApproved(context.Background(), FindFilter{}); err == nil {
		t.Fatal("expected query error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestFindApprovedReturnsScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "role", "company", "country", "city", "salary_amount", "currency",
		"experience_years", "experience_level", "work_type", "is_anonymized", "status", "created_at",
	}).AddRow(
		"sub-1", "Backend Engineer", nil, "LK", nil, "bad-salary", "LKR",
		nil, nil, nil, false, "APPROVED", time.Now(),
	)
	mock.ExpectQuery(regexp.QuoteMeta("FROM submissions")).
		WithArgs("APPROVED").
		WillReturnRows(rows)

	if _, err := repo.FindApproved(context.Background(), FindFilter{}); err == nil {
		t.Fatal("expected scan error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestCreateInsertsSubmissionAndScansReturnedRow(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	company := "Acme"
	city := "Colombo"
	years := 5
	level := "senior"
	workType := "Remote"
	createdAt := time.Date(2026, 4, 28, 10, 30, 0, 0, time.UTC)

	rows := sqlmock.NewRows([]string{
		"id", "role", "company", "country", "city", "salary_amount", "currency",
		"experience_years", "experience_level", "work_type", "is_anonymized", "status", "created_at",
	}).AddRow(
		"sub-1", "Backend Engineer", company, "LK", city, 450000.0, "LKR",
		years, level, workType, true, "PENDING", createdAt,
	)

	mock.ExpectQuery(regexp.QuoteMeta("INSERT INTO submissions")).
		WithArgs(
			"Backend Engineer",
			company,
			"LK",
			city,
			450000.0,
			"LKR",
			int64(years),
			level,
			workType,
			true,
		).
		WillReturnRows(rows)

	got, err := repo.Create(context.Background(), CreateParams{
		Role:            "Backend Engineer",
		Company:         &company,
		Country:         "LK",
		City:            &city,
		SalaryAmount:    450000,
		Currency:        "LKR",
		ExperienceYears: &years,
		ExperienceLevel: &level,
		WorkType:        &workType,
		IsAnonymized:    true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != "sub-1" || got.Status != "PENDING" || !got.IsAnonymized {
		t.Fatalf("unexpected created submission: %#v", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestPingUsesDatabasePing(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectPing()

	if err := repo.Ping(context.Background()); err != nil {
		t.Fatalf("unexpected ping error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestCreateReturnsScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("INSERT INTO submissions")).
		WithArgs(
			"Backend Engineer",
			nil,
			"LK",
			nil,
			450000.0,
			"LKR",
			nil,
			nil,
			nil,
			false,
		).
		WillReturnError(errors.New("insert failed"))

	if _, err := repo.Create(context.Background(), CreateParams{
		Role:         "Backend Engineer",
		Country:      "LK",
		SalaryAmount: 450000,
		Currency:     "LKR",
	}); err == nil {
		t.Fatal("expected create error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestApproveSubmissionUpdatesPendingSubmission(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectExec(regexp.QuoteMeta("UPDATE salary_schema.submissions SET status = 'APPROVED' WHERE id = $1 AND status = 'PENDING'")).
		WithArgs("sub-1").
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := repo.ApproveSubmission(context.Background(), "sub-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestItoa(t *testing.T) {
	cases := map[int]string{
		0:   "0",
		1:   "1",
		9:   "9",
		10:  "10",
		25:  "25",
		100: "100",
	}
	for input, want := range cases {
		if got := itoa(input); got != want {
			t.Fatalf("itoa(%d) = %q, want %q", input, got, want)
		}
	}
}

package repository

import (
	"context"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestSearchBuildsQueriesScansRowsAndPagination(t *testing.T) {
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

	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM salary_schema.submissions s WHERE")).
		WithArgs("APPROVED", "%Engineer%", "%Acme%", "LK", "senior", "%backend%").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(21))

	rows := sqlmock.NewRows([]string{
		"id", "role", "company", "country", "city", "salary_amount", "currency",
		"experience_years", "experience_level", "work_type", "is_anonymized",
		"status", "upvotes", "downvotes", "created_at",
	}).AddRow(
		"sub-1", "Backend Engineer", company, "LK", city, 450000.0, "LKR",
		years, level, workType, false, "APPROVED", 7, 2, "2026-04-28T10:30:00Z",
	)

	mock.ExpectQuery(regexp.QuoteMeta("FROM salary_schema.submissions s")).
		WithArgs("APPROVED", "%Engineer%", "%Acme%", "LK", "senior", "%backend%", 10, 10).
		WillReturnRows(rows)

	result, err := repo.Search(context.Background(), SearchFilter{
		Role:            "Engineer",
		Company:         "Acme",
		Country:         "lk",
		ExperienceLevel: "senior",
		Query:           "backend",
		Page:            2,
		Limit:           10,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Pagination.Total != 21 || result.Pagination.Page != 2 ||
		result.Pagination.Limit != 10 || result.Pagination.Pages != 3 {
		t.Fatalf("unexpected pagination: %#v", result.Pagination)
	}
	if len(result.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(result.Results))
	}
	got := result.Results[0]
	if got.ID != "sub-1" || got.Role != "Backend Engineer" || got.Upvotes != 7 || got.Downvotes != 2 {
		t.Fatalf("unexpected result row: %#v", got)
	}
	if got.Company == nil || *got.Company != company {
		t.Fatalf("expected company %q, got %#v", company, got.Company)
	}
	if got.YearsOfExperience == nil || *got.YearsOfExperience != years {
		t.Fatalf("expected years %d, got %#v", years, got.YearsOfExperience)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestSearchDefaultsToApprovedStatus(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM salary_schema.submissions s WHERE")).
		WithArgs("APPROVED").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(regexp.QuoteMeta("FROM salary_schema.submissions s")).
		WithArgs("APPROVED", 20, 0).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "role", "company", "country", "city", "salary_amount", "currency",
			"experience_years", "experience_level", "work_type", "is_anonymized",
			"status", "upvotes", "downvotes", "created_at",
		}))

	result, err := repo.Search(context.Background(), SearchFilter{Page: 1, Limit: 20})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Pagination.Total != 0 || result.Pagination.Pages != 0 {
		t.Fatalf("unexpected pagination: %#v", result.Pagination)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestSearchUsesRequestedStatus(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM salary_schema.submissions s WHERE")).
		WithArgs("PENDING").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(regexp.QuoteMeta("FROM salary_schema.submissions s")).
		WithArgs("PENDING", 10, 0).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "role", "company", "country", "city", "salary_amount", "currency",
			"experience_years", "experience_level", "work_type", "is_anonymized",
			"status", "upvotes", "downvotes", "created_at",
		}))

	if _, err := repo.Search(context.Background(), SearchFilter{Status: " pending ", Page: 1, Limit: 10}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestSearchReturnsCountError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM salary_schema.submissions s WHERE")).
		WithArgs("APPROVED").
		WillReturnError(errors.New("count failed"))

	if _, err := repo.Search(context.Background(), SearchFilter{Page: 1, Limit: 20}); err == nil {
		t.Fatal("expected count error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestSearchReturnsDataQueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM salary_schema.submissions s WHERE")).
		WithArgs("APPROVED").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(regexp.QuoteMeta("FROM salary_schema.submissions s")).
		WithArgs("APPROVED", 20, 0).
		WillReturnError(errors.New("data query failed"))

	if _, err := repo.Search(context.Background(), SearchFilter{Page: 1, Limit: 20}); err == nil {
		t.Fatal("expected data query error")
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

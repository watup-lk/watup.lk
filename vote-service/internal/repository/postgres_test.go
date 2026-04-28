package repository

import (
	"context"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRecordVoteUpsertsVoteCountsUpvotesAndCommits(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO votes")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM votes WHERE submission_id = $1 AND vote_type = 'UP'")).
		WithArgs("sub-1").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))
	mock.ExpectCommit()

	count, err := repo.RecordVote(context.Background(), "sub-1", "user-1", "UP")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 5 {
		t.Fatalf("expected 5 upvotes, got %d", count)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRecordVoteReturnsBeginError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin().WillReturnError(errors.New("begin failed"))

	if _, err := repo.RecordVote(context.Background(), "sub-1", "user-1", "UP"); err == nil {
		t.Fatal("expected begin error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRecordVoteReturnsExecErrorAndRollsBack(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO votes")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnError(errors.New("insert failed"))
	mock.ExpectRollback()

	if _, err := repo.RecordVote(context.Background(), "sub-1", "user-1", "UP"); err == nil {
		t.Fatal("expected insert error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRecordVoteReturnsCountErrorAndRollsBack(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO votes")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM votes WHERE submission_id = $1 AND vote_type = 'UP'")).
		WithArgs("sub-1").
		WillReturnError(errors.New("count failed"))
	mock.ExpectRollback()

	if _, err := repo.RecordVote(context.Background(), "sub-1", "user-1", "UP"); err == nil {
		t.Fatal("expected count error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRecordVoteReturnsCommitError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO votes")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM votes WHERE submission_id = $1 AND vote_type = 'UP'")).
		WithArgs("sub-1").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))
	mock.ExpectCommit().WillReturnError(errors.New("commit failed"))

	if _, err := repo.RecordVote(context.Background(), "sub-1", "user-1", "UP"); err == nil {
		t.Fatal("expected commit error")
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

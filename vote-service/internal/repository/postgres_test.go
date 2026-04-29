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
	mock.ExpectQuery(regexp.QuoteMeta("WITH old_vote AS")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnRows(sqlmock.NewRows([]string{"old_vote_type"}).AddRow(""))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO vote_counts")).
		WithArgs("sub-1", 1, 0).
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
	mock.ExpectQuery(regexp.QuoteMeta("WITH old_vote AS")).
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
	mock.ExpectQuery(regexp.QuoteMeta("WITH old_vote AS")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnRows(sqlmock.NewRows([]string{"old_vote_type"}).AddRow(""))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO vote_counts")).
		WithArgs("sub-1", 1, 0).
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
	mock.ExpectQuery(regexp.QuoteMeta("WITH old_vote AS")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnRows(sqlmock.NewRows([]string{"old_vote_type"}).AddRow(""))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO vote_counts")).
		WithArgs("sub-1", 1, 0).
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

func TestRecordVoteUpdatesCountsWhenVoteSwitches(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("WITH old_vote AS")).
		WithArgs("sub-1", "user-1", "UP").
		WillReturnRows(sqlmock.NewRows([]string{"old_vote_type"}).AddRow("DOWN"))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE vote_counts")).
		WithArgs("sub-1", 1, -1).
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

func TestRecordVoteSkipsCountUpdateWhenVoteDoesNotChange(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("WITH old_vote AS")).
		WithArgs("sub-1", "user-1", "DOWN").
		WillReturnRows(sqlmock.NewRows([]string{"old_vote_type"}).AddRow("DOWN"))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM votes WHERE submission_id = $1 AND vote_type = 'UP'")).
		WithArgs("sub-1").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectCommit()

	count, err := repo.RecordVote(context.Background(), "sub-1", "user-1", "DOWN")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 upvotes, got %d", count)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRecordVoteReturnsSwitchCountErrorAndRollsBack(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("WITH old_vote AS")).
		WithArgs("sub-1", "user-1", "DOWN").
		WillReturnRows(sqlmock.NewRows([]string{"old_vote_type"}).AddRow("UP"))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE vote_counts")).
		WithArgs("sub-1", -1, 1).
		WillReturnError(errors.New("switch failed"))
	mock.ExpectRollback()

	if _, err := repo.RecordVote(context.Background(), "sub-1", "user-1", "DOWN"); err == nil {
		t.Fatal("expected switch count error")
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

func TestGetVoteCountIncreaseSqlBuildsDownvoteInsert(t *testing.T) {
	repo := NewPostgresRepo(nil)

	query, upVotes, downVotes := repo.GetVoteCountIncreaseSql("DOWN")

	if upVotes != 0 || downVotes != 1 {
		t.Fatalf("expected downvote counts 0/1, got %d/%d", upVotes, downVotes)
	}
	if !regexp.MustCompile(`down_count = vote_counts\.down_count \+ 1`).MatchString(query) {
		t.Fatalf("expected down_count increment query, got %s", query)
	}
}

func TestUpdateVoteCountReturnsExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO vote_counts")).
		WithArgs("sub-1", 0, 1).
		WillReturnError(errors.New("update failed"))
	mock.ExpectRollback()

	if err := repo.UpdateVoteCount(context.Background(), "sub-1", "DOWN", tx); err == nil {
		t.Fatal("expected update error")
	}
	_ = tx.Rollback()
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestUpdateVoteCountForSwitchExecutesDownvoteSwitch(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectBegin()
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	mock.ExpectExec(regexp.QuoteMeta("UPDATE vote_counts")).
		WithArgs("sub-1", -1, 1).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := repo.UpdateVoteCountForSwitch(context.Background(), "sub-1", "DOWN", tx); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestGetVoteCountsReturnsRows(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	rows := sqlmock.NewRows([]string{"submission_id", "up_count", "down_count"}).
		AddRow("sub-1", 4, 1).
		AddRow("sub-2", 2, 0)
	mock.ExpectQuery(regexp.QuoteMeta("FROM community_schema.vote_counts")).
		WillReturnRows(rows)

	counts, err := repo.GetVoteCounts(context.Background())

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(counts) != 2 || counts[0].SubmissionID != "sub-1" || counts[0].UpCount != 4 {
		t.Fatalf("unexpected vote counts: %#v", counts)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestGetVoteCountsReturnsEmptySlice(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("FROM community_schema.vote_counts")).
		WillReturnRows(sqlmock.NewRows([]string{"submission_id", "up_count", "down_count"}))

	counts, err := repo.GetVoteCounts(context.Background())

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if counts == nil || len(counts) != 0 {
		t.Fatalf("expected empty non-nil slice, got %#v", counts)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestGetVoteCountsReturnsQueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	mock.ExpectQuery(regexp.QuoteMeta("FROM community_schema.vote_counts")).
		WillReturnError(errors.New("query failed"))

	if _, err := repo.GetVoteCounts(context.Background()); err == nil {
		t.Fatal("expected query error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestGetVoteCountsReturnsScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	rows := sqlmock.NewRows([]string{"submission_id", "up_count", "down_count"}).
		AddRow("sub-1", "bad-count", 1)
	mock.ExpectQuery(regexp.QuoteMeta("FROM community_schema.vote_counts")).
		WillReturnRows(rows)

	if _, err := repo.GetVoteCounts(context.Background()); err == nil {
		t.Fatal("expected scan error")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

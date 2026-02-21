package repository

import (
	"context"
	"database/sql"
)

type PostgresRepo struct {
	db *sql.DB
}

func NewPostgresRepo(db *sql.DB) *PostgresRepo {
	return &PostgresRepo{db: db}
}

// RecordVote inserts a vote and returns the current total upvote count for that submission
func (r *PostgresRepo) RecordVote(ctx context.Context, submissionID, userID, voteType string) (int, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// 1. Insert the vote (Conflict handles the "one vote per user" rule)
	query := `
		INSERT INTO community_schema.votes (submission_id, user_id, vote_type)
		VALUES ($1, $2, $3)
		ON CONFLICT (submission_id, user_id) DO UPDATE SET vote_type = $3`
	
	_, err = tx.ExecContext(ctx, query, submissionID, userID, voteType)
	if err != nil {
		return 0, err
	}

	// 2. Count total upvotes for the threshold check
	var count int
	countQuery := `SELECT COUNT(*) FROM community_schema.votes WHERE submission_id = $1 AND vote_type = 'UPVOTE'`
	err = tx.QueryRowContext(ctx, countQuery, submissionID).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, tx.Commit()
}
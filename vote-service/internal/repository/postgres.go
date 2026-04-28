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
		INSERT INTO votes (submission_id, user_id, vote_type)
		VALUES ($1, $2, $3)
		ON CONFLICT (submission_id, user_id) DO UPDATE SET vote_type = $3
		RETURNING vote_type
	`

	var returnedValue string
	err = tx.QueryRowContext(ctx, query, submissionID, userID, voteType).Scan(&returnedValue)
	if err != nil {
		return 0, err
	}

	isSwitched := returnedValue != voteType

	// 2. Update vote counts
	if isSwitched {
		err = r.UpdateVoteCountForSwitch(ctx, submissionID, voteType, tx)
		if err != nil {
			return 0, err
		}
	} else {
		err = r.UpdateVoteCount(ctx, submissionID, voteType, tx)
		if err != nil {
			return 0, err
		}
	}

	// 3. Count total upvotes for the threshold check
	count, err := r.GetTotalUpvotes(ctx, submissionID, tx)

	return count, tx.Commit()
}

func (r *PostgresRepo) GetTotalUpvotes(ctx context.Context, submissionID string, tx *sql.Tx) (int, error) {
	var count int
	countQuery := `SELECT COUNT(*) FROM votes WHERE submission_id = $1 AND vote_type = 'UP'`
	err := tx.QueryRowContext(ctx, countQuery, submissionID).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (r *PostgresRepo) GetVoteCountIncreaseSql(voteType string) (string, int, int) {
	sql := `
		INSERT INTO vote_counts (submission_id, up_count, down_count)
		VALUES ($1, $2, $3)
		ON CONFLICT (submission_id)
	`
	var upVoteCount, downVoteCount int = 0, 0

	if voteType == "UPVOTE" {
		sql += `
			DO UPDATE SET up_count = vote_counts.up_count + 1;
		`
		upVoteCount = 1
	} else {
		sql += `
			DO UPDATE SET down_count = vote_counts.down_count + 1;
		`
		downVoteCount = 1
	}

	return sql, upVoteCount, downVoteCount
}

func (r *PostgresRepo) UpdateVoteCount(ctx context.Context, submissionID string, voteType string, tx *sql.Tx) error {
	query, upVoteCount, downVoteCount := r.GetVoteCountIncreaseSql(voteType)
	_, err := tx.ExecContext(ctx, query, submissionID, upVoteCount, downVoteCount)
	if err != nil {
		return err
	}
	return nil
}

func (r *PostgresRepo) getVoteValuesForSwitch(voteType string) (int, int) {
	var upVoteCount, downVoteCount int = -1, -1
	if voteType == "UPVOTE" {
		upVoteCount = 0
	} else {
		downVoteCount = 0
	}
	return upVoteCount, downVoteCount
}

func (r *PostgresRepo) UpdateVoteCountForSwitch(ctx context.Context, submissionID string, voteType string, tx *sql.Tx) error {
	upVoteCount, downVoteCount := r.getVoteValuesForSwitch(voteType)
	query := `
		UPDATE vote_counts
		SET up_count = vote_counts.up_count + $2, down_count = vote_counts.down_count + $3
		WHERE submission_id = $1;
	`
	_, err := tx.ExecContext(ctx, query, submissionID, upVoteCount, downVoteCount)
	if err != nil {
		return err
	}
	return nil
}

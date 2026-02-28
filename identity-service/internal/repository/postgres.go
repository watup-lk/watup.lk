package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrNotFound = errors.New("record not found")

type User struct {
	ID           string
	Email        string
	PasswordHash string
	IsActive     bool
	CreatedAt    time.Time
}

type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	Revoked   bool
}

type PostgresRepo struct {
	db *sql.DB
}

func NewPostgresRepo(db *sql.DB) *PostgresRepo {
	return &PostgresRepo{db: db}
}

// CreateUser inserts a new user. Caller must ensure the email does not already exist.
func (r *PostgresRepo) CreateUser(ctx context.Context, id, email, passwordHash string) error {
	const q = `
		INSERT INTO identity_schema.users (id, email, password_hash)
		VALUES ($1, $2, $3)`
	_, err := r.db.ExecContext(ctx, q, id, email, passwordHash)
	return err
}

// UserExistsByEmail returns true if a user with the given email already exists.
func (r *PostgresRepo) UserExistsByEmail(ctx context.Context, email string) (bool, error) {
	var exists bool
	const q = `SELECT EXISTS(SELECT 1 FROM identity_schema.users WHERE email = $1)`
	err := r.db.QueryRowContext(ctx, q, email).Scan(&exists)
	return exists, err
}

// FindUserByEmail retrieves a user by their email address.
func (r *PostgresRepo) FindUserByEmail(ctx context.Context, email string) (*User, error) {
	const q = `
		SELECT id, email, password_hash, is_active, created_at
		FROM identity_schema.users
		WHERE email = $1`
	u := &User{}
	err := r.db.QueryRowContext(ctx, q, email).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.IsActive, &u.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

// FindUserByID retrieves a user by their UUID.
func (r *PostgresRepo) FindUserByID(ctx context.Context, id string) (*User, error) {
	const q = `
		SELECT id, email, password_hash, is_active, created_at
		FROM identity_schema.users
		WHERE id = $1`
	u := &User{}
	err := r.db.QueryRowContext(ctx, q, id).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.IsActive, &u.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

// StoreRefreshToken persists a hashed refresh token for a user.
func (r *PostgresRepo) StoreRefreshToken(ctx context.Context, id, userID, tokenHash string, expiresAt time.Time) error {
	const q = `
		INSERT INTO identity_schema.refresh_tokens (id, user_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)`
	_, err := r.db.ExecContext(ctx, q, id, userID, tokenHash, expiresAt)
	return err
}

// FindRefreshToken looks up a refresh token by its hash.
func (r *PostgresRepo) FindRefreshToken(ctx context.Context, tokenHash string) (*RefreshToken, error) {
	const q = `
		SELECT id, user_id, token_hash, expires_at, revoked
		FROM identity_schema.refresh_tokens
		WHERE token_hash = $1`
	rt := &RefreshToken{}
	err := r.db.QueryRowContext(ctx, q, tokenHash).Scan(
		&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.Revoked,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return rt, err
}

// RevokeRefreshToken marks a refresh token as revoked.
func (r *PostgresRepo) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	const q = `UPDATE identity_schema.refresh_tokens SET revoked = TRUE WHERE token_hash = $1`
	_, err := r.db.ExecContext(ctx, q, tokenHash)
	return err
}

// RevokeAllUserTokens revokes all active refresh tokens for a user (e.g., on password change).
func (r *PostgresRepo) RevokeAllUserTokens(ctx context.Context, userID string) error {
	const q = `UPDATE identity_schema.refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`
	_, err := r.db.ExecContext(ctx, q, userID)
	return err
}

// Ping checks the database connection (used by readiness probe).
func (r *PostgresRepo) Ping(ctx context.Context) error {
	return r.db.PingContext(ctx)
}

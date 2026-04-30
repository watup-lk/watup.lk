package repository

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestCreateUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to open mock sql: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	ctx := context.Background()
	age := 25

	mock.ExpectExec("INSERT INTO identity_schema.users").
		WithArgs("id1", "name1", "email1", "hash1", &age).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = repo.CreateUser(ctx, "id1", "name1", "email1", "hash1", &age)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUserExistsByEmail(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to open mock sql: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	ctx := context.Background()

	mock.ExpectQuery("SELECT EXISTS").
		WithArgs("test@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	exists, err := repo.UserExistsByEmail(ctx, "test@example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !exists {
		t.Fatal("expected exists to be true")
	}
}

func TestFindUserByEmail(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to open mock sql: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	ctx := context.Background()
	now := time.Now()

	rows := sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "age", "is_active", "created_at"}).
		AddRow("u1", "User 1", "u1@example.com", "hash", 30, true, now)

	mock.ExpectQuery("SELECT id, name, email, password_hash, age, is_active, created_at FROM identity_schema.users").
		WithArgs("u1@example.com").
		WillReturnRows(rows)

	u, err := repo.FindUserByEmail(ctx, "u1@example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if u.ID != "u1" {
		t.Errorf("expected u1, got %s", u.ID)
	}

	// Test Not Found
	mock.ExpectQuery("SELECT id").WithArgs("notfound@example.com").WillReturnError(sql.ErrNoRows)
	_, err = repo.FindUserByEmail(ctx, "notfound@example.com")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestFindUserByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to open mock sql: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	ctx := context.Background()
	now := time.Now()

	rows := sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "age", "is_active", "created_at"}).
		AddRow("u1", "User 1", "u1@example.com", "hash", 30, true, now)

	mock.ExpectQuery("SELECT id, name, email, password_hash, age, is_active, created_at FROM identity_schema.users").
		WithArgs("u1").
		WillReturnRows(rows)

	u, err := repo.FindUserByID(ctx, "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if u.ID != "u1" {
		t.Errorf("expected u1, got %s", u.ID)
	}

	// Test Not Found
	mock.ExpectQuery("SELECT id").WithArgs("u2").WillReturnError(sql.ErrNoRows)
	_, err = repo.FindUserByID(ctx, "u2")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestRefreshToken(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to open mock sql: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	ctx := context.Background()
	now := time.Now()

	// Store
	mock.ExpectExec("INSERT INTO identity_schema.refresh_tokens").
		WithArgs("t1", "u1", "hash1", now).
		WillReturnResult(sqlmock.NewResult(1, 1))
	err = repo.StoreRefreshToken(ctx, "t1", "u1", "hash1", now)
	if err != nil {
		t.Fatalf("StoreRefreshToken failed: %v", err)
	}

	// Find
	rows := sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "revoked"}).
		AddRow("t1", "u1", "hash1", now, false)
	mock.ExpectQuery("SELECT id, user_id, token_hash, expires_at, revoked FROM identity_schema.refresh_tokens").
		WithArgs("hash1").
		WillReturnRows(rows)
	rt, err := repo.FindRefreshToken(ctx, "hash1")
	if err != nil {
		t.Fatalf("FindRefreshToken failed: %v", err)
	}
	if rt.ID != "t1" {
		t.Errorf("expected t1, got %s", rt.ID)
	}

	// Revoke
	mock.ExpectExec("UPDATE identity_schema.refresh_tokens SET revoked = TRUE").
		WithArgs("hash1").
		WillReturnResult(sqlmock.NewResult(1, 1))
	err = repo.RevokeRefreshToken(ctx, "hash1")
	if err != nil {
		t.Fatalf("RevokeRefreshToken failed: %v", err)
	}

	// Revoke All
	mock.ExpectExec("UPDATE identity_schema.refresh_tokens SET revoked = TRUE WHERE user_id").
		WithArgs("u1").
		WillReturnResult(sqlmock.NewResult(1, 1))
	err = repo.RevokeAllUserTokens(ctx, "u1")
	if err != nil {
		t.Fatalf("RevokeAllUserTokens failed: %v", err)
	}
}

func TestInsertAuditLog(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to open mock sql: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	ctx := context.Background()

	// Normal
	mock.ExpectExec("INSERT INTO identity_schema.audit_logs").
		WithArgs("u1", "login", true, "127.0.0.1").
		WillReturnResult(sqlmock.NewResult(1, 1))
	err = repo.InsertAuditLog(ctx, "u1", "login", true, "127.0.0.1")
	if err != nil {
		t.Fatalf("InsertAuditLog failed: %v", err)
	}

	// Empty fields -> NULL
	mock.ExpectExec("INSERT INTO identity_schema.audit_logs").
		WithArgs(nil, "signup", false, nil).
		WillReturnResult(sqlmock.NewResult(1, 1))
	err = repo.InsertAuditLog(ctx, "", "signup", false, "")
	if err != nil {
		t.Fatalf("InsertAuditLog with empty fields failed: %v", err)
	}
}

func TestPing(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("failed to open mock sql: %v", err)
	}
	defer db.Close()

	repo := NewPostgresRepo(db)
	ctx := context.Background()

	mock.ExpectPing()
	err = repo.Ping(ctx)
	if err != nil {
		t.Fatalf("Ping failed: %v", err)
	}
}

package service

import (
	"context"
	"time"

	"github.com/watup-lk/identity-service/internal/repository"
)

// Repo is the data-access interface the IdentityService depends on.
// Using an interface allows the service to be tested with a mock
// without needing a real PostgreSQL database.
type Repo interface {
	CreateUser(ctx context.Context, id, name, email, passwordHash string, age *int) error
	UserExistsByEmail(ctx context.Context, email string) (bool, error)
	FindUserByEmail(ctx context.Context, email string) (*repository.User, error)
	FindUserByID(ctx context.Context, id string) (*repository.User, error)
	StoreRefreshToken(ctx context.Context, id, userID, tokenHash string, expiresAt time.Time) error
	FindRefreshToken(ctx context.Context, tokenHash string) (*repository.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenHash string) error
	RevokeAllUserTokens(ctx context.Context, userID string) error // used on password change / forced logout
	InsertAuditLog(ctx context.Context, userID, eventType string, success bool, ipAddress string) error
	Ping(ctx context.Context) error
}

// EventPublisher abstracts the Kafka producer so the service is not coupled
// to a specific messaging implementation.
type EventPublisher interface {
	PublishUserRegistered(ctx context.Context, userID string)
	PublishUserLogin(ctx context.Context, userID string)
	PublishUserLogout(ctx context.Context, userID string)
	PublishTokenRefresh(ctx context.Context, userID string)
	Close()
}

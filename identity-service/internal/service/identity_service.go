package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/watup-lk/identity-service/internal/config"
	"github.com/watup-lk/identity-service/internal/repository"
)

var (
	ErrUserAlreadyExists  = errors.New("email already registered")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrAccountDisabled    = errors.New("account is disabled")
)

// Claims is the JWT payload. Only user_id is included — no PII.
type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

// TokenPair holds the short-lived access token and long-lived refresh token.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

// SignupResult is returned from Signup.
type SignupResult struct {
	UserID string
}

// IdentityService contains all authentication business logic.
// It depends on the Repo and EventPublisher interfaces — not concrete types —
// which makes it easy to test in isolation with mocks.
type IdentityService struct {
	repo  Repo
	kafka EventPublisher
	cfg   *config.Config
}

func NewIdentityService(repo Repo, k EventPublisher, cfg *config.Config) *IdentityService {
	return &IdentityService{repo: repo, kafka: k, cfg: cfg}
}

// Signup creates a new user account. Returns the new user's UUID.
func (s *IdentityService) Signup(ctx context.Context, email, password string) (*SignupResult, error) {
	exists, err := s.repo.UserExistsByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("checking email: %w", err)
	}
	if exists {
		return nil, ErrUserAlreadyExists
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	userID := uuid.New().String()
	if err := s.repo.CreateUser(ctx, userID, email, string(hash)); err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}

	// Fire-and-forget: publish Kafka event without blocking the response
	go s.kafka.PublishUserRegistered(context.Background(), userID)

	return &SignupResult{UserID: userID}, nil
}

// Login validates credentials and returns a token pair on success.
func (s *IdentityService) Login(ctx context.Context, email, password string) (*TokenPair, error) {
	user, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		// Return generic error — do not reveal whether the email exists
		return nil, ErrInvalidCredentials
	}

	if !user.IsActive {
		return nil, ErrAccountDisabled
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	pair, err := s.generateTokenPair(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	go s.kafka.PublishUserLogin(context.Background(), user.ID)

	return pair, nil
}

// Refresh rotates a refresh token and returns a new token pair.
func (s *IdentityService) Refresh(ctx context.Context, rawRefreshToken string) (*TokenPair, error) {
	tokenHash := hashToken(rawRefreshToken)

	stored, err := s.repo.FindRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, ErrInvalidToken
	}
	if stored.Revoked || time.Now().After(stored.ExpiresAt) {
		return nil, ErrInvalidToken
	}

	// Revoke the old token (token rotation)
	if err := s.repo.RevokeRefreshToken(ctx, tokenHash); err != nil {
		return nil, fmt.Errorf("revoking old token: %w", err)
	}

	return s.generateTokenPair(ctx, stored.UserID)
}

// Logout revokes the given refresh token.
func (s *IdentityService) Logout(ctx context.Context, rawRefreshToken string) error {
	tokenHash := hashToken(rawRefreshToken)
	return s.repo.RevokeRefreshToken(ctx, tokenHash)
}

// ValidateAccessToken parses and validates a JWT, returning the user_id on success.
func (s *IdentityService) ValidateAccessToken(_ context.Context, tokenString string) (string, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return "", ErrInvalidToken
	}
	return claims.UserID, nil
}

// GetUserByID returns basic user metadata (no email — privacy).
func (s *IdentityService) GetUserByID(ctx context.Context, userID string) (*repository.User, error) {
	return s.repo.FindUserByID(ctx, userID)
}

// generateTokenPair creates a new JWT access token and an opaque refresh token.
func (s *IdentityService) generateTokenPair(ctx context.Context, userID string) (*TokenPair, error) {
	accessExpiry := time.Now().Add(time.Duration(s.cfg.AccessTokenMinutes) * time.Minute)

	accessClaims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(), // jti — ensures every token is unique
			ExpiresAt: jwt.NewNumericDate(accessExpiry),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "watup-identity-service",
			Subject:   userID,
		},
	}

	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).
		SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, fmt.Errorf("signing access token: %w", err)
	}

	// Refresh token is a random opaque string stored as its SHA-256 hash
	rawRefresh := uuid.New().String() + "-" + uuid.New().String()
	refreshExpiry := time.Now().AddDate(0, 0, s.cfg.RefreshTokenDays)

	if err := s.repo.StoreRefreshToken(
		ctx,
		uuid.New().String(),
		userID,
		hashToken(rawRefresh),
		refreshExpiry,
	); err != nil {
		return nil, fmt.Errorf("storing refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresAt:    accessExpiry,
	}, nil
}

// hashToken returns the hex-encoded SHA-256 of a token string.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", h)
}

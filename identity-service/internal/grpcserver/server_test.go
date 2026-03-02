package grpcserver_test

import (
	"context"
	"testing"
	"time"

	"github.com/watup-lk/identity-service/internal/config"
	"github.com/watup-lk/identity-service/internal/grpcserver"
	"github.com/watup-lk/identity-service/internal/repository"
	"github.com/watup-lk/identity-service/internal/service"

	pb "github.com/watup-lk/identity-service/api/proto/v1"
)

// ── Mock Repository ──────────────────────────────────────────────────────────

type mockRepo struct {
	users  map[string]*repository.User
	byID   map[string]*repository.User
	tokens map[string]*repository.RefreshToken
}

func newMockRepo() *mockRepo {
	return &mockRepo{
		users:  make(map[string]*repository.User),
		byID:   make(map[string]*repository.User),
		tokens: make(map[string]*repository.RefreshToken),
	}
}

func (m *mockRepo) CreateUser(_ context.Context, id, name, email, passwordHash string, age *int) error {
	u := &repository.User{ID: id, Name: name, Email: email, PasswordHash: passwordHash, Age: age, IsActive: true, CreatedAt: time.Now()}
	m.users[email] = u
	m.byID[id] = u
	return nil
}
func (m *mockRepo) UserExistsByEmail(_ context.Context, email string) (bool, error) {
	_, ok := m.users[email]
	return ok, nil
}
func (m *mockRepo) FindUserByEmail(_ context.Context, email string) (*repository.User, error) {
	u, ok := m.users[email]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return u, nil
}
func (m *mockRepo) FindUserByID(_ context.Context, id string) (*repository.User, error) {
	u, ok := m.byID[id]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return u, nil
}
func (m *mockRepo) StoreRefreshToken(_ context.Context, id, userID, tokenHash string, expiresAt time.Time) error {
	m.tokens[tokenHash] = &repository.RefreshToken{ID: id, UserID: userID, TokenHash: tokenHash, ExpiresAt: expiresAt}
	return nil
}
func (m *mockRepo) FindRefreshToken(_ context.Context, tokenHash string) (*repository.RefreshToken, error) {
	rt, ok := m.tokens[tokenHash]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return rt, nil
}
func (m *mockRepo) RevokeRefreshToken(_ context.Context, tokenHash string) error {
	if rt, ok := m.tokens[tokenHash]; ok {
		rt.Revoked = true
	}
	return nil
}
func (m *mockRepo) RevokeAllUserTokens(_ context.Context, _ string) error { return nil }
func (m *mockRepo) InsertAuditLog(_ context.Context, _, _ string, _ bool, _ string) error {
	return nil
}
func (m *mockRepo) Ping(_ context.Context) error { return nil }

// ── Mock Publisher ────────────────────────────────────────────────────────────

type mockPublisher struct{}

func (m *mockPublisher) PublishUserRegistered(_ context.Context, _ string) {}
func (m *mockPublisher) PublishUserLogin(_ context.Context, _ string)      {}
func (m *mockPublisher) PublishUserLogout(_ context.Context, _ string)     {}
func (m *mockPublisher) PublishTokenRefresh(_ context.Context, _ string)   {}
func (m *mockPublisher) Close()                                            {}

// ── Helpers ──────────────────────────────────────────────────────────────────

func testConfig() *config.Config {
	return &config.Config{
		JWTSecret:          "test-secret-key-at-least-32-chars!!",
		AccessTokenMinutes: 15,
		RefreshTokenDays:   7,
	}
}

func newTestServer() (*grpcserver.IdentityServer, *service.IdentityService) {
	repo := newMockRepo()
	svc := service.NewIdentityService(repo, &mockPublisher{}, testConfig())
	return grpcserver.NewIdentityServer(svc), svc
}

// ── ValidateToken Tests ──────────────────────────────────────────────────────

func TestValidateToken_EmptyToken(t *testing.T) {
	srv, _ := newTestServer()
	resp, err := srv.ValidateToken(context.Background(), &pb.ValidateTokenRequest{Token: ""})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Valid {
		t.Error("expected Valid=false for empty token")
	}
	if resp.Error == "" {
		t.Error("expected error message")
	}
}

func TestValidateToken_InvalidToken(t *testing.T) {
	srv, _ := newTestServer()
	resp, err := srv.ValidateToken(context.Background(), &pb.ValidateTokenRequest{Token: "invalid.jwt.token"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Valid {
		t.Error("expected Valid=false for invalid token")
	}
}

func TestValidateToken_ValidToken(t *testing.T) {
	srv, svc := newTestServer()
	ctx := context.Background()

	// Create a user and login to get a valid token
	_, err := svc.Signup(ctx, "TestUser", "grpc@test.com", "SecurePass1", "127.0.0.1", nil)
	if err != nil {
		t.Fatalf("Signup error: %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	pair, err := svc.Login(ctx, "grpc@test.com", "SecurePass1", "127.0.0.1")
	if err != nil {
		t.Fatalf("Login error: %v", err)
	}

	resp, err := srv.ValidateToken(ctx, &pb.ValidateTokenRequest{Token: pair.AccessToken})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Valid {
		t.Error("expected Valid=true for valid token")
	}
	if resp.UserId == "" {
		t.Error("expected non-empty UserId")
	}
}

// ── GetUser Tests ────────────────────────────────────────────────────────────

func TestGetUser_EmptyID(t *testing.T) {
	srv, _ := newTestServer()
	_, err := srv.GetUser(context.Background(), &pb.GetUserRequest{UserId: ""})
	if err == nil {
		t.Error("expected error for empty user_id")
	}
}

func TestGetUser_NotFound(t *testing.T) {
	srv, _ := newTestServer()
	_, err := srv.GetUser(context.Background(), &pb.GetUserRequest{UserId: "nonexistent-id"})
	if err == nil {
		t.Error("expected NotFound error")
	}
}

func TestGetUser_Success(t *testing.T) {
	srv, svc := newTestServer()
	ctx := context.Background()

	result, err := svc.Signup(ctx, "GetUser Test", "getuser@test.com", "SecurePass1", "127.0.0.1", nil)
	if err != nil {
		t.Fatalf("Signup error: %v", err)
	}
	time.Sleep(10 * time.Millisecond)

	resp, err := srv.GetUser(ctx, &pb.GetUserRequest{UserId: result.UserID})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.UserId != result.UserID {
		t.Errorf("expected user_id %s, got %s", result.UserID, resp.UserId)
	}
	if !resp.IsActive {
		t.Error("expected is_active=true")
	}
	if resp.CreatedAt == "" {
		t.Error("expected non-empty created_at")
	}
}

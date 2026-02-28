package service_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/watup-lk/identity-service/internal/config"
	"github.com/watup-lk/identity-service/internal/repository"
	"github.com/watup-lk/identity-service/internal/service"
)

// ── Mock Repository ───────────────────────────────────────────────────────────

type mockRepo struct {
	users  map[string]*repository.User  // keyed by email
	byID   map[string]*repository.User  // keyed by id
	tokens map[string]*repository.RefreshToken // keyed by token_hash
	pingErr error
}

func newMockRepo() *mockRepo {
	return &mockRepo{
		users:  make(map[string]*repository.User),
		byID:   make(map[string]*repository.User),
		tokens: make(map[string]*repository.RefreshToken),
	}
}

func (m *mockRepo) CreateUser(_ context.Context, id, email, passwordHash string) error {
	u := &repository.User{ID: id, Email: email, PasswordHash: passwordHash, IsActive: true, CreatedAt: time.Now()}
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
	m.tokens[tokenHash] = &repository.RefreshToken{
		ID: id, UserID: userID, TokenHash: tokenHash, ExpiresAt: expiresAt, Revoked: false,
	}
	return nil
}

func (m *mockRepo) FindRefreshToken(_ context.Context, tokenHash string) (*repository.RefreshToken, error) {
	t, ok := m.tokens[tokenHash]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return t, nil
}

func (m *mockRepo) RevokeRefreshToken(_ context.Context, tokenHash string) error {
	if t, ok := m.tokens[tokenHash]; ok {
		t.Revoked = true
	}
	return nil
}

func (m *mockRepo) RevokeAllUserTokens(_ context.Context, userID string) error {
	for _, t := range m.tokens {
		if t.UserID == userID {
			t.Revoked = true
		}
	}
	return nil
}

func (m *mockRepo) Ping(_ context.Context) error {
	return m.pingErr
}

// ── Mock EventPublisher ───────────────────────────────────────────────────────

type mockPublisher struct {
	mu               sync.Mutex
	registeredEvents []string
	loginEvents      []string
}

func (m *mockPublisher) PublishUserRegistered(_ context.Context, userID string) {
	m.mu.Lock()
	m.registeredEvents = append(m.registeredEvents, userID)
	m.mu.Unlock()
}
func (m *mockPublisher) PublishUserLogin(_ context.Context, userID string) {
	m.mu.Lock()
	m.loginEvents = append(m.loginEvents, userID)
	m.mu.Unlock()
}
func (m *mockPublisher) Close() {}

func (m *mockPublisher) countRegistered() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.registeredEvents)
}
func (m *mockPublisher) countLogin() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.loginEvents)
}

// ── Test Helpers ──────────────────────────────────────────────────────────────

func testConfig() *config.Config {
	return &config.Config{
		JWTSecret:          "test-secret-key-at-least-32-chars!!",
		AccessTokenMinutes: 15,
		RefreshTokenDays:   7,
	}
}

func newTestService() (*service.IdentityService, *mockRepo, *mockPublisher) {
	repo := newMockRepo()
	pub := &mockPublisher{}
	svc := service.NewIdentityService(repo, pub, testConfig())
	return svc, repo, pub
}

// ── Signup Tests ──────────────────────────────────────────────────────────────

func TestSignup_Success(t *testing.T) {
	svc, _, pub := newTestService()
	ctx := context.Background()

	result, err := svc.Signup(ctx, "alice@example.com", "SecurePass1")
	if err != nil {
		t.Fatalf("Signup() unexpected error: %v", err)
	}
	if result.UserID == "" {
		t.Error("Signup() returned empty UserID")
	}
	// Give goroutine time to publish
	time.Sleep(10 * time.Millisecond)
	if pub.countRegistered() != 1 {
		t.Errorf("expected 1 registered event, got %d", pub.countRegistered())
	}
}

func TestSignup_DuplicateEmail(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, err := svc.Signup(ctx, "bob@example.com", "SecurePass1")
	if err != nil {
		t.Fatalf("first Signup() unexpected error: %v", err)
	}

	_, err = svc.Signup(ctx, "bob@example.com", "AnotherPass2")
	if !errors.Is(err, service.ErrUserAlreadyExists) {
		t.Errorf("expected ErrUserAlreadyExists, got %v", err)
	}
}

// ── Login Tests ───────────────────────────────────────────────────────────────

func TestLogin_Success(t *testing.T) {
	svc, _, pub := newTestService()
	ctx := context.Background()

	_, err := svc.Signup(ctx, "carol@example.com", "CarolPass9")
	if err != nil {
		t.Fatalf("Signup() error: %v", err)
	}

	pair, err := svc.Login(ctx, "carol@example.com", "CarolPass9")
	if err != nil {
		t.Fatalf("Login() unexpected error: %v", err)
	}
	if pair.AccessToken == "" {
		t.Error("Login() returned empty AccessToken")
	}
	if pair.RefreshToken == "" {
		t.Error("Login() returned empty RefreshToken")
	}
	if pair.ExpiresAt.IsZero() {
		t.Error("Login() returned zero ExpiresAt")
	}

	time.Sleep(10 * time.Millisecond)
	if pub.countLogin() != 1 {
		t.Errorf("expected 1 login event, got %d", pub.countLogin())
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, err := svc.Signup(ctx, "dave@example.com", "DavePass7")
	if err != nil {
		t.Fatalf("Signup() error: %v", err)
	}

	_, err = svc.Login(ctx, "dave@example.com", "WrongPassword")
	if !errors.Is(err, service.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_UnknownEmail(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, err := svc.Login(ctx, "ghost@example.com", "AnyPass1")
	if !errors.Is(err, service.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for unknown email, got %v", err)
	}
}

func TestLogin_DisabledAccount(t *testing.T) {
	svc, repo, _ := newTestService()
	ctx := context.Background()

	_, err := svc.Signup(ctx, "eve@example.com", "EvePass77")
	if err != nil {
		t.Fatalf("Signup() error: %v", err)
	}
	// Disable the account directly in the mock
	repo.users["eve@example.com"].IsActive = false

	_, err = svc.Login(ctx, "eve@example.com", "EvePass77")
	if !errors.Is(err, service.ErrAccountDisabled) {
		t.Errorf("expected ErrAccountDisabled, got %v", err)
	}
}

// ── Token Validation Tests ────────────────────────────────────────────────────

func TestValidateAccessToken_Valid(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	result, _ := svc.Signup(ctx, "frank@example.com", "FrankPass1")
	pair, _ := svc.Login(ctx, "frank@example.com", "FrankPass1")

	userID, err := svc.ValidateAccessToken(ctx, pair.AccessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken() unexpected error: %v", err)
	}
	if userID != result.UserID {
		t.Errorf("expected userID %s, got %s", result.UserID, userID)
	}
}

func TestValidateAccessToken_InvalidSignature(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, err := svc.ValidateAccessToken(ctx, "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZmFrZSJ9.invalidsig")
	if !errors.Is(err, service.ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateAccessToken_Empty(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, err := svc.ValidateAccessToken(ctx, "")
	if !errors.Is(err, service.ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken for empty token, got %v", err)
	}
}

// ── Refresh Token Tests ───────────────────────────────────────────────────────

func TestRefresh_Success(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, _ = svc.Signup(ctx, "grace@example.com", "GracePass2")
	pair1, _ := svc.Login(ctx, "grace@example.com", "GracePass2")

	pair2, err := svc.Refresh(ctx, pair1.RefreshToken)
	if err != nil {
		t.Fatalf("Refresh() unexpected error: %v", err)
	}
	if pair2.AccessToken == pair1.AccessToken {
		t.Error("Refresh() should return a new access token")
	}
}

func TestRefresh_RevokedToken(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, _ = svc.Signup(ctx, "henry@example.com", "HenryPass3")
	pair, _ := svc.Login(ctx, "henry@example.com", "HenryPass3")

	// First refresh — should succeed and revoke the original token
	_, err := svc.Refresh(ctx, pair.RefreshToken)
	if err != nil {
		t.Fatalf("first Refresh() error: %v", err)
	}

	// Second use of the same token — should fail (revoked)
	_, err = svc.Refresh(ctx, pair.RefreshToken)
	if !errors.Is(err, service.ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken on reuse, got %v", err)
	}
}

// ── Logout Tests ──────────────────────────────────────────────────────────────

func TestLogout_RevokesToken(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	_, _ = svc.Signup(ctx, "iris@example.com", "IrisPass44")
	pair, _ := svc.Login(ctx, "iris@example.com", "IrisPass44")

	if err := svc.Logout(ctx, pair.RefreshToken); err != nil {
		t.Fatalf("Logout() error: %v", err)
	}

	// Trying to refresh after logout should fail
	_, err := svc.Refresh(ctx, pair.RefreshToken)
	if !errors.Is(err, service.ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken after logout, got %v", err)
	}
}

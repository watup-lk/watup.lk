package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/watup-lk/identity-service/internal/config"
	"github.com/watup-lk/identity-service/internal/handlers"
	"github.com/watup-lk/identity-service/internal/repository"
	"github.com/watup-lk/identity-service/internal/service"
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

func newTestHandler() (*handlers.AuthHandler, *mockRepo) {
	repo := newMockRepo()
	svc := service.NewIdentityService(repo, &mockPublisher{}, testConfig())
	return handlers.NewAuthHandler(svc), repo
}

func postJSON(handler http.HandlerFunc, path string, body any) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler(rr, req)
	return rr
}

type jsonBody map[string]any

// ── Signup Handler Tests ─────────────────────────────────────────────────────

func TestSignupHandler_Success(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Alice", "email": "alice@test.com", "password": "SecurePass1",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["user_id"] == "" {
		t.Error("expected user_id in response")
	}
}

func TestSignupHandler_WithAge(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Bob", "email": "bob@test.com", "password": "SecurePass1", "age": 25,
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestSignupHandler_MissingName(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"email": "noname@test.com", "password": "SecurePass1",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestSignupHandler_InvalidEmail(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Bad", "email": "not-an-email", "password": "SecurePass1",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestSignupHandler_WeakPassword(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Weak", "email": "weak@test.com", "password": "short",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestSignupHandler_PasswordNoDigit(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "NoDigit", "email": "nodigit@test.com", "password": "abcdefghij",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestSignupHandler_InvalidAge(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Kid", "email": "kid@test.com", "password": "SecurePass1", "age": 5,
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestSignupHandler_Duplicate(t *testing.T) {
	h, _ := newTestHandler()
	postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Dup", "email": "dup@test.com", "password": "SecurePass1",
	})
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Dup2", "email": "dup@test.com", "password": "SecurePass1",
	})
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", rr.Code)
	}
}

func TestSignupHandler_InvalidJSON(t *testing.T) {
	h, _ := newTestHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/signup", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.Signup(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestSignupHandler_EmptyEmail(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "Empty", "email": "", "password": "SecurePass1",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

// ── Login Handler Tests ──────────────────────────────────────────────────────

func TestLoginHandler_Success(t *testing.T) {
	h, _ := newTestHandler()
	postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "LoginUser", "email": "login@test.com", "password": "SecurePass1",
	})
	time.Sleep(10 * time.Millisecond) // let goroutines finish

	rr := postJSON(h.Login, "/auth/login", jsonBody{
		"email": "login@test.com", "password": "SecurePass1",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["access_token"] == "" {
		t.Error("expected access_token")
	}
	if resp["refresh_token"] == "" {
		t.Error("expected refresh_token")
	}
	if resp["expires_at"] == "" {
		t.Error("expected expires_at")
	}
}

func TestLoginHandler_WrongPassword(t *testing.T) {
	h, _ := newTestHandler()
	postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "WrongPW", "email": "wrongpw@test.com", "password": "SecurePass1",
	})
	time.Sleep(10 * time.Millisecond)

	rr := postJSON(h.Login, "/auth/login", jsonBody{
		"email": "wrongpw@test.com", "password": "WrongPass1",
	})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestLoginHandler_UnknownEmail(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Login, "/auth/login", jsonBody{
		"email": "unknown@test.com", "password": "SecurePass1",
	})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestLoginHandler_InvalidJSON(t *testing.T) {
	h, _ := newTestHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader([]byte("{bad")))
	rr := httptest.NewRecorder()
	h.Login(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

// ── Validate Token Handler Tests ─────────────────────────────────────────────

func TestValidateHandler_Success(t *testing.T) {
	h, _ := newTestHandler()
	postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "ValidateUser", "email": "validate@test.com", "password": "SecurePass1",
	})
	time.Sleep(10 * time.Millisecond)

	loginRR := postJSON(h.Login, "/auth/login", jsonBody{
		"email": "validate@test.com", "password": "SecurePass1",
	})
	var loginResp map[string]string
	json.Unmarshal(loginRR.Body.Bytes(), &loginResp)

	req := httptest.NewRequest(http.MethodGet, "/auth/validate", nil)
	req.Header.Set("Authorization", "Bearer "+loginResp["access_token"])
	rr := httptest.NewRecorder()
	h.ValidateToken(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]string
	json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["user_id"] == "" {
		t.Error("expected user_id")
	}
}

func TestValidateHandler_NoToken(t *testing.T) {
	h, _ := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/auth/validate", nil)
	rr := httptest.NewRecorder()
	h.ValidateToken(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestValidateHandler_InvalidToken(t *testing.T) {
	h, _ := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/auth/validate", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	rr := httptest.NewRecorder()
	h.ValidateToken(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestValidateHandler_MalformedHeader(t *testing.T) {
	h, _ := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/auth/validate", nil)
	req.Header.Set("Authorization", "NotBearer token")
	rr := httptest.NewRecorder()
	h.ValidateToken(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

// ── Refresh Handler Tests ────────────────────────────────────────────────────

func TestRefreshHandler_Success(t *testing.T) {
	h, _ := newTestHandler()
	postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "RefreshUser", "email": "refresh@test.com", "password": "SecurePass1",
	})
	time.Sleep(10 * time.Millisecond)

	loginRR := postJSON(h.Login, "/auth/login", jsonBody{
		"email": "refresh@test.com", "password": "SecurePass1",
	})
	var loginResp map[string]string
	json.Unmarshal(loginRR.Body.Bytes(), &loginResp)

	rr := postJSON(h.Refresh, "/auth/refresh", jsonBody{
		"refresh_token": loginResp["refresh_token"],
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestRefreshHandler_EmptyToken(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Refresh, "/auth/refresh", jsonBody{
		"refresh_token": "",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestRefreshHandler_InvalidToken(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Refresh, "/auth/refresh", jsonBody{
		"refresh_token": "nonexistent-token",
	})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestRefreshHandler_InvalidJSON(t *testing.T) {
	h, _ := newTestHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", bytes.NewReader([]byte("{bad")))
	rr := httptest.NewRecorder()
	h.Refresh(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

// ── Logout Handler Tests ─────────────────────────────────────────────────────

func TestLogoutHandler_Success(t *testing.T) {
	h, _ := newTestHandler()
	postJSON(h.Signup, "/auth/signup", jsonBody{
		"name": "LogoutUser", "email": "logout@test.com", "password": "SecurePass1",
	})
	time.Sleep(10 * time.Millisecond)

	loginRR := postJSON(h.Login, "/auth/login", jsonBody{
		"email": "logout@test.com", "password": "SecurePass1",
	})
	var loginResp map[string]string
	json.Unmarshal(loginRR.Body.Bytes(), &loginResp)

	rr := postJSON(h.Logout, "/auth/logout", jsonBody{
		"refresh_token": loginResp["refresh_token"],
	})
	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestLogoutHandler_EmptyToken(t *testing.T) {
	h, _ := newTestHandler()
	rr := postJSON(h.Logout, "/auth/logout", jsonBody{
		"refresh_token": "",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestLogoutHandler_InvalidJSON(t *testing.T) {
	h, _ := newTestHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", bytes.NewReader([]byte("{bad")))
	rr := httptest.NewRecorder()
	h.Logout(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

// ── Health Handler Tests ─────────────────────────────────────────────────────

type healthMockRepo struct {
	pingErr error
}

func (m *healthMockRepo) Ping(_ context.Context) error { return m.pingErr }

func TestLivenessHandler(t *testing.T) {
	h := handlers.NewHealthHandler(nil) // liveness doesn't use DB
	req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	rr := httptest.NewRecorder()
	h.Liveness(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestReadinessHandler_Healthy(t *testing.T) {
	h := handlers.NewHealthHandler(&healthMockRepo{})
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	rr := httptest.NewRecorder()
	h.Readiness(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestReadinessHandler_DBDown(t *testing.T) {
	h := handlers.NewHealthHandler(&healthMockRepo{pingErr: errors.New("connection refused")})
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	rr := httptest.NewRecorder()
	h.Readiness(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rr.Code)
	}
}

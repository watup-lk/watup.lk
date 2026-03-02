package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/watup-lk/identity-service/internal/middleware"
)

var dummyHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
})

// ── SecurityHeaders Tests ────────────────────────────────────────────────────

func TestSecurityHeaders_SetsAllHeaders(t *testing.T) {
	handler := middleware.SecurityHeaders(dummyHandler)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	expected := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"X-Xss-Protection":       "1; mode=block",
		"Referrer-Policy":        "no-referrer",
	}
	for k, v := range expected {
		got := rr.Header().Get(k)
		if got != v {
			t.Errorf("header %s: expected %q, got %q", k, v, got)
		}
	}
	if rr.Header().Get("Strict-Transport-Security") == "" {
		t.Error("missing Strict-Transport-Security header")
	}
	if rr.Header().Get("Content-Security-Policy") == "" {
		t.Error("missing Content-Security-Policy header")
	}
}

func TestSecurityHeaders_PassesThrough(t *testing.T) {
	handler := middleware.SecurityHeaders(dummyHandler)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

// ── CORS Tests ───────────────────────────────────────────────────────────────

func TestCORS_NoOrigin_PassesThrough(t *testing.T) {
	handler := middleware.CORS(dummyHandler)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("should not set CORS headers when no Origin")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestCORS_WithOrigin_SetsHeaders(t *testing.T) {
	handler := middleware.CORS(dummyHandler)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Errorf("expected origin in ACAO, got %q", got)
	}
	if got := rr.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Error("expected Access-Control-Allow-Methods")
	}
	if got := rr.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("expected credentials=true, got %q", got)
	}
}

func TestCORS_Preflight_Returns204(t *testing.T) {
	handler := middleware.CORS(dummyHandler)
	req := httptest.NewRequest(http.MethodOptions, "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("preflight expected 204, got %d", rr.Code)
	}
}

// ── Chain Tests ──────────────────────────────────────────────────────────────

func TestChain_AppliesMiddlewares(t *testing.T) {
	called := false
	testMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			next.ServeHTTP(w, r)
		})
	}

	handler := middleware.Chain(dummyHandler, testMiddleware)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Error("middleware was not called")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

// ── RequestLogger Tests ──────────────────────────────────────────────────────

func TestRequestLogger_SetsStatusCode(t *testing.T) {
	handler := middleware.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte("created"))
	}))
	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", rr.Code)
	}
}

// ── RateLimiter Tests ────────────────────────────────────────────────────────

func TestRateLimiter_AllowsNormalTraffic(t *testing.T) {
	rl := middleware.NewRateLimiter(10, 5.0)
	handler := rl.Limit(dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestRateLimiter_BlocksExcessiveTraffic(t *testing.T) {
	rl := middleware.NewRateLimiter(2, 0.1) // very low limit
	handler := rl.Limit(dummyHandler)

	// Exhaust the burst allowance
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code == http.StatusTooManyRequests {
			return // success — rate limit triggered
		}
	}
	t.Error("expected rate limiter to block at least one request")
}

// ── Metrics Tests ────────────────────────────────────────────────────────────

func TestMetrics_PassesThrough(t *testing.T) {
	handler := middleware.Metrics(dummyHandler)
	req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

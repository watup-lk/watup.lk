// Package middleware provides HTTP middleware for the identity service.
// It chains security headers, structured request logging, and per-IP rate limiting.
package middleware

import (
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

// Chain applies a stack of middleware functions to a handler, in order (outermost first).
func Chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// ── Security Headers ──────────────────────────────────────────────────────────

// SecurityHeaders adds OWASP-recommended HTTP security headers to every response.
// These prevent clickjacking, MIME-sniffing, XSS, and information disclosure.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		// Prevent MIME type sniffing
		h.Set("X-Content-Type-Options", "nosniff")
		// Prevent clickjacking
		h.Set("X-Frame-Options", "DENY")
		// Enable XSS protection in legacy browsers
		h.Set("X-XSS-Protection", "1; mode=block")
		// Enforce HTTPS (HSTS) — 1 year, include subdomains
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		// Restrict what resources the page can load
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		// Don't leak referrer information
		h.Set("Referrer-Policy", "no-referrer")
		// Disable browser features not needed by an API
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		// Remove server fingerprint
		h.Set("Server", "")

		next.ServeHTTP(w, r)
	})
}

// ── Request Logger ────────────────────────────────────────────────────────────

// responseWriter captures the status code written by the downstream handler.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// RequestLogger logs method, path, status code, and latency for every request.
// In production, replace with a structured logger (e.g., slog or zap).
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		next.ServeHTTP(rw, r)

		log.Printf("[http] %s %s %d %s %s",
			r.Method,
			r.URL.Path,
			rw.statusCode,
			time.Since(start).Round(time.Millisecond),
			r.Header.Get("X-Request-ID"),
		)
	})
}

// ── Per-IP Rate Limiter ───────────────────────────────────────────────────────

type visitor struct {
	tokens     float64
	lastSeen   time.Time
	maxTokens  float64
	refillRate float64 // tokens per second
}

// RateLimiter holds per-IP token buckets and cleans up stale entries periodically.
type RateLimiter struct {
	mu         sync.Mutex
	visitors   map[string]*visitor
	maxTokens  float64
	refillRate float64 // tokens per second
}

// NewRateLimiter creates a limiter that allows burst requests per IP and refills
// at the given rate (requests per second).
func NewRateLimiter(burst int, rps float64) *RateLimiter {
	rl := &RateLimiter{
		visitors:   make(map[string]*visitor),
		maxTokens:  float64(burst),
		refillRate: rps,
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	v, ok := rl.visitors[ip]
	if !ok {
		v = &visitor{
			tokens:     rl.maxTokens,
			lastSeen:   now,
			maxTokens:  rl.maxTokens,
			refillRate: rl.refillRate,
		}
		rl.visitors[ip] = v
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(v.lastSeen).Seconds()
	v.tokens = min(v.maxTokens, v.tokens+elapsed*v.refillRate)
	v.lastSeen = now

	if v.tokens < 1 {
		return false
	}
	v.tokens--
	return true
}

// cleanup removes stale IP entries every 5 minutes to prevent unbounded growth.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.lastSeen) > 10*time.Minute {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// Limit returns middleware that enforces the per-IP rate limit.
// Returns 429 Too Many Requests when the bucket is empty.
func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		// Respect X-Real-IP / X-Forwarded-For set by the ingress
		if forwarded := r.Header.Get("X-Real-IP"); forwarded != "" {
			ip = forwarded
		}

		if !rl.allow(ip) {
			w.Header().Set("Retry-After", "1")
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}


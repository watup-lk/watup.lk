package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics — registered once at package init via promauto.
var (
	httpRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "identity",
		Name:      "http_requests_total",
		Help:      "Total number of HTTP requests by method, path, and status code.",
	}, []string{"method", "path", "status"})

	httpRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "identity",
		Name:      "http_request_duration_seconds",
		Help:      "HTTP request latency by method and path.",
		Buckets:   []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
	}, []string{"method", "path"})

	httpRequestsInFlight = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "identity",
		Name:      "http_requests_in_flight",
		Help:      "Current number of HTTP requests being processed.",
	})
)

// Metrics returns middleware that tracks HTTP request counts, durations, and in-flight
// requests using Prometheus. Call this AFTER SecurityHeaders so metrics are always collected.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip the /metrics endpoint itself to avoid self-referential noise
		if r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}

		httpRequestsInFlight.Inc()
		defer httpRequestsInFlight.Dec()

		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(rw.statusCode)

		// Normalise path — avoid high-cardinality labels from dynamic segments
		path := normalisePath(r.URL.Path)
		httpRequestsTotal.WithLabelValues(r.Method, path, status).Inc()
		httpRequestDuration.WithLabelValues(r.Method, path).Observe(duration)
	})
}

// normalisePath maps specific known paths to their canonical label value.
// Unknown paths collapse to "/other" to prevent label cardinality explosion.
func normalisePath(p string) string {
	switch p {
	case "/auth/signup", "/auth/login", "/auth/refresh", "/auth/logout", "/auth/validate",
		"/health/live", "/health/ready", "/metrics":
		return p
	default:
		return "/other"
	}
}

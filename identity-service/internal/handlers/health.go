package handlers

import (
	"context"
	"net/http"
)

// Pinger abstracts the database ping check so the HealthHandler is not coupled
// to a concrete repository type. Any type with Ping satisfies this interface.
type Pinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler serves Kubernetes liveness and readiness probes.
type HealthHandler struct {
	db Pinger
}

func NewHealthHandler(db Pinger) *HealthHandler {
	return &HealthHandler{db: db}
}

// Liveness godoc
// GET /health/live
// Returns 200 as long as the process is running. Kubernetes restarts the pod if this fails.
func (h *HealthHandler) Liveness(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "alive"})
}

// Readiness godoc
// GET /health/ready
// Returns 200 only when the database is reachable.
// Kubernetes removes the pod from the load balancer while this returns non-200
// (e.g., during pod startup or a PostgreSQL outage — zero-downtime rolling updates).
func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {
	if err := h.db.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "not ready",
			"reason": "database unreachable",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

package handlers

import (
	"context"
	"net/http"
	"time"
)

type pinger interface {
	Ping(ctx context.Context) error
}

type HealthHandler struct {
	db pinger
}

func NewHealthHandler(db pinger) *HealthHandler {
	return &HealthHandler{db: db}
}

func (h *HealthHandler) Liveness(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := h.db.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database not ready")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

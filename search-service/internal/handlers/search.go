package handlers

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/watup-lk/search-service/internal/repository"
)

type searcher interface {
	Search(ctx context.Context, f repository.SearchFilter) (repository.SearchResult, error)
}

type SearchHandler struct {
	repo searcher
}

func NewSearchHandler(repo *repository.PostgresRepo) *SearchHandler {
	return &SearchHandler{repo: repo}
}

// GET /search
func (h *SearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	page := parseIntClamped(q.Get("page"), 1, 1, math.MaxInt)
	limit := parseIntClamped(q.Get("limit"), 20, 1, 100)

	experienceLevel := q.Get("experience_level")
	if experienceLevel == "" {
		experienceLevel = q.Get("experienceLevel")
	}
	workType := q.Get("work_type")
	if workType == "" {
		workType = q.Get("workType")
	}

	filter := repository.SearchFilter{
		Role:            q.Get("role"),
		Company:         q.Get("company"),
		Country:         q.Get("country"),
		ExperienceLevel: experienceLevel,
		WorkType:        workType,
		Query:           q.Get("query"),
		Status:          q.Get("status"),
		Page:            page,
		Limit:           limit,
	}

	result, err := h.repo.Search(r.Context(), filter)
	if err != nil {
		log.Printf("[search] query error: %v", err)
		writeError(w, http.StatusInternalServerError, "search failed")
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func parseIntClamped(s string, def, min, max int) int {
	v, err := strconv.Atoi(s)
	if err != nil || v < min {
		v = def
	}
	if v > max {
		v = max
	}
	return v
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

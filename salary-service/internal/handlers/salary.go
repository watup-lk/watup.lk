package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/watup-lk/salary-service/internal/repository"
	"github.com/watup-lk/salary-service/internal/service"
)

type SalaryHandler struct {
	svc *service.SalaryService
}

func NewSalaryHandler(svc *service.SalaryService) *SalaryHandler {
	return &SalaryHandler{svc: svc}
}

// GET /salary
func (h *SalaryHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repository.FindFilter{
		Role:            q.Get("role"),
		Country:         q.Get("country"),
		ExperienceLevel: q.Get("experience_level"),
		WorkType:        q.Get("work_type"),
		Currency:        q.Get("currency"),
	}

	submissions, err := h.svc.List(r.Context(), filter)
	if err != nil {
		log.Printf("[salary] list error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to fetch submissions")
		return
	}

	writeJSON(w, http.StatusOK, submissions)
}

// POST /salary
func (h *SalaryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req service.CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.Role) == "" {
		writeError(w, http.StatusBadRequest, "role is required")
		return
	}
	if req.MonthlySalaryLKR <= 0 {
		writeError(w, http.StatusBadRequest, "monthly_salary_lkr must be positive")
		return
	}

	result, err := h.svc.Create(r.Context(), req)
	if err != nil {
		log.Printf("[salary] create error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create submission")
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/watup-lk/salary-service/internal/repository"
	"github.com/watup-lk/salary-service/internal/service"
)

type fakeSalaryService struct {
	listResult []service.SubmissionResponse
	listErr    error
	createResult service.SubmissionResponse
	createErr  error
}

func (f *fakeSalaryService) List(_ context.Context, _ repository.FindFilter) ([]service.SubmissionResponse, error) {
	return f.listResult, f.listErr
}

func (f *fakeSalaryService) Create(_ context.Context, _ service.CreateRequest) (service.SubmissionResponse, error) {
	return f.createResult, f.createErr
}

func TestList_OK(t *testing.T) {
	h := &SalaryHandler{svc: &fakeSalaryService{listResult: []service.SubmissionResponse{}}}
	req := httptest.NewRequest(http.MethodGet, "/salary", nil)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestList_Error(t *testing.T) {
	h := &SalaryHandler{svc: &fakeSalaryService{listErr: errors.New("db error")}}
	req := httptest.NewRequest(http.MethodGet, "/salary", nil)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestCreate_InvalidJSON(t *testing.T) {
	h := &SalaryHandler{svc: &fakeSalaryService{}}
	req := httptest.NewRequest(http.MethodPost, "/salary", strings.NewReader("{bad json"))
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreate_MissingRole(t *testing.T) {
	h := &SalaryHandler{svc: &fakeSalaryService{}}
	body := `{"monthly_salary_lkr": 100000}`
	req := httptest.NewRequest(http.MethodPost, "/salary", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreate_MissingSalary(t *testing.T) {
	h := &SalaryHandler{svc: &fakeSalaryService{}}
	body := `{"role": "Engineer", "monthly_salary_lkr": 0}`
	req := httptest.NewRequest(http.MethodPost, "/salary", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreate_ServiceError(t *testing.T) {
	h := &SalaryHandler{svc: &fakeSalaryService{createErr: errors.New("insert failed")}}
	body := `{"role": "Engineer", "monthly_salary_lkr": 100000}`
	req := httptest.NewRequest(http.MethodPost, "/salary", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestCreate_OK(t *testing.T) {
	h := &SalaryHandler{svc: &fakeSalaryService{
		createResult: service.SubmissionResponse{ID: "abc", Role: "Engineer", Status: "PENDING"},
	}}
	body := `{"role": "Engineer", "monthly_salary_lkr": 100000}`
	req := httptest.NewRequest(http.MethodPost, "/salary", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
}

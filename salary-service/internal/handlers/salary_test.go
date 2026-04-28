package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/watup-lk/salary-service/internal/repository"
	"github.com/watup-lk/salary-service/internal/service"
)

type fakeSalaryService struct {
	listResult   []service.SubmissionResponse
	listErr      error
	listFilter   repository.FindFilter
	createResult service.SubmissionResponse
	createErr    error
	createReq    service.CreateRequest
}

func (f *fakeSalaryService) List(_ context.Context, filter repository.FindFilter) ([]service.SubmissionResponse, error) {
	f.listFilter = filter
	return f.listResult, f.listErr
}

func (f *fakeSalaryService) Create(_ context.Context, req service.CreateRequest) (service.SubmissionResponse, error) {
	f.createReq = req
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

func TestList_ForwardsQueryFilters(t *testing.T) {
	svc := &fakeSalaryService{listResult: []service.SubmissionResponse{}}
	h := &SalaryHandler{svc: svc}
	req := httptest.NewRequest(
		http.MethodGet,
		"/salary?role=Engineer&country=lk&experience_level=senior&work_type=Remote&currency=lkr",
		nil,
	)
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	want := repository.FindFilter{
		Role:            "Engineer",
		Country:         "lk",
		ExperienceLevel: "senior",
		WorkType:        "Remote",
		Currency:        "lkr",
	}
	if svc.listFilter != want {
		t.Fatalf("unexpected filter: got %#v want %#v", svc.listFilter, want)
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
	svc := &fakeSalaryService{
		createResult: service.SubmissionResponse{ID: "abc", Role: "Engineer", Status: "PENDING"},
	}
	h := &SalaryHandler{svc: svc}
	body := `{
		"role": "Engineer",
		"company": "Acme",
		"country": "lk",
		"currency": "lkr",
		"monthly_salary_lkr": 100000,
		"years_of_experience": 5,
		"experience_level": "senior",
		"work_type": "Remote",
		"anonymize": true
	}`
	req := httptest.NewRequest(http.MethodPost, "/salary", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}

	var resp service.SubmissionResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ID != "abc" || resp.Status != "PENDING" {
		t.Fatalf("unexpected response: %#v", resp)
	}
	if svc.createReq.Role != "Engineer" || svc.createReq.Country != "lk" || svc.createReq.Currency != "lkr" {
		t.Fatalf("unexpected create request: %#v", svc.createReq)
	}
	if svc.createReq.Company == nil || *svc.createReq.Company != "Acme" {
		t.Fatalf("expected company Acme, got %#v", svc.createReq.Company)
	}
	if svc.createReq.YearsOfExperience == nil || *svc.createReq.YearsOfExperience != 5 {
		t.Fatalf("expected 5 years of experience, got %#v", svc.createReq.YearsOfExperience)
	}
	if svc.createReq.ExperienceLevel == nil || *svc.createReq.ExperienceLevel != "senior" {
		t.Fatalf("expected senior experience level, got %#v", svc.createReq.ExperienceLevel)
	}
	if svc.createReq.WorkType == nil || *svc.createReq.WorkType != "Remote" {
		t.Fatalf("expected Remote work type, got %#v", svc.createReq.WorkType)
	}
	if !svc.createReq.Anonymize {
		t.Fatal("expected anonymize flag to be forwarded")
	}
}

package service

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/watup-lk/salary-service/internal/repository"
)

type fakeRepo struct {
	submissions  []repository.Submission
	created      repository.Submission
	err          error
	findFilter   repository.FindFilter
	createParams repository.CreateParams
}

func (f *fakeRepo) FindApproved(_ context.Context, filter repository.FindFilter) ([]repository.Submission, error) {
	f.findFilter = filter
	return f.submissions, f.err
}

func (f *fakeRepo) ReportSubmission(_ context.Context, _ string) error {
	return f.err
}

func (f *fakeRepo) Create(_ context.Context, params repository.CreateParams) (repository.Submission, error) {
	f.createParams = params
	return f.created, f.err
}

type fakeKafka struct{}

func (f *fakeKafka) PublishSubmissionCreated(_ context.Context, _ string) {}

func newTestService(repo salaryRepo) *SalaryService {
	return &SalaryService{repo: repo, kafka: &fakeKafka{}}
}

func TestNewStoresDependencies(t *testing.T) {
	svc := New(nil, nil)

	if svc == nil {
		t.Fatal("expected service")
	}
	if !reflect.ValueOf(svc.repo).IsNil() || !reflect.ValueOf(svc.kafka).IsNil() {
		t.Fatalf("expected nil dependencies to be stored as nil, got %#v", svc)
	}
}

func TestList_OK(t *testing.T) {
	repo := &fakeRepo{submissions: []repository.Submission{
		{ID: "1", Role: "Engineer", Country: "LK", Currency: "LKR", Status: "APPROVED", CreatedAt: time.Now()},
	}}
	svc := newTestService(repo)
	results, err := svc.List(context.Background(), repository.FindFilter{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
}

func TestList_Error(t *testing.T) {
	repo := &fakeRepo{err: errors.New("db error")}
	svc := newTestService(repo)
	_, err := svc.List(context.Background(), repository.FindFilter{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestCreate_OK(t *testing.T) {
	now := time.Now()
	repo := &fakeRepo{created: repository.Submission{
		ID: "abc", Role: "Engineer", Country: "LK", Currency: "LKR",
		SalaryAmount: 100000, Status: "PENDING", CreatedAt: now,
	}}
	svc := newTestService(repo)
	result, err := svc.Create(context.Background(), CreateRequest{
		Role:             "Engineer",
		MonthlySalaryLKR: 100000,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.ID != "abc" {
		t.Errorf("expected id abc, got %s", result.ID)
	}
	if result.Country != "LK" {
		t.Errorf("expected country LK, got %s", result.Country)
	}
	if result.Currency != "LKR" {
		t.Errorf("expected currency LKR, got %s", result.Currency)
	}
}

func TestCreate_DefaultsCountryAndCurrency(t *testing.T) {
	now := time.Now()
	repo := &fakeRepo{created: repository.Submission{
		ID: "1", Role: "Dev", Country: "LK", Currency: "LKR",
		SalaryAmount: 50000, Status: "PENDING", CreatedAt: now,
	}}
	svc := newTestService(repo)
	result, err := svc.Create(context.Background(), CreateRequest{
		Role:             "Dev",
		MonthlySalaryLKR: 50000,
		Country:          "",
		Currency:         "",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Country != "LK" {
		t.Errorf("expected default country LK, got %s", result.Country)
	}
	if result.Currency != "LKR" {
		t.Errorf("expected default currency LKR, got %s", result.Currency)
	}
}

func TestCreate_NormalizesAndTrimsCreateParams(t *testing.T) {
	now := time.Now()
	repo := &fakeRepo{created: repository.Submission{
		ID: "abc", Role: "Engineer", Country: "LK", Currency: "LKR",
		SalaryAmount: 100000, Status: "PENDING", CreatedAt: now,
	}}
	svc := newTestService(repo)
	company := "  Acme  "
	city := "  Colombo  "
	level := "senior"
	workType := "Hybrid"
	years := 6

	_, err := svc.Create(context.Background(), CreateRequest{
		Role:              "  Engineer  ",
		Company:           &company,
		Country:           " lk ",
		City:              &city,
		MonthlySalaryLKR:  100000,
		Currency:          " lkr ",
		YearsOfExperience: &years,
		ExperienceLevel:   &level,
		WorkType:          &workType,
		Anonymize:         true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	params := repo.createParams
	if params.Role != "Engineer" {
		t.Fatalf("expected trimmed role, got %q", params.Role)
	}
	if params.Country != "LK" || params.Currency != "LKR" {
		t.Fatalf("expected normalized country/currency, got %q/%q", params.Country, params.Currency)
	}
	if params.Company == nil || *params.Company != "Acme" {
		t.Fatalf("expected trimmed company, got %#v", params.Company)
	}
	if params.City == nil || *params.City != "Colombo" {
		t.Fatalf("expected trimmed city, got %#v", params.City)
	}
	if params.ExperienceYears == nil || *params.ExperienceYears != 6 {
		t.Fatalf("expected years to be forwarded, got %#v", params.ExperienceYears)
	}
	if params.ExperienceLevel != &level {
		t.Fatalf("expected experience level pointer to be forwarded")
	}
	if params.WorkType == nil || *params.WorkType != workType {
		t.Fatalf("expected normalized work type, got %#v", params.WorkType)
	}
	if !params.IsAnonymized {
		t.Fatal("expected anonymized flag to be forwarded")
	}
}

func TestCreate_NormalizesLowercaseWorkType(t *testing.T) {
	repo := &fakeRepo{created: repository.Submission{
		ID: "abc", Role: "Engineer", Country: "LK", Currency: "LKR",
		SalaryAmount: 100000, Status: "PENDING", CreatedAt: time.Now(),
	}}
	svc := newTestService(repo)
	workType := " hybrid "

	_, err := svc.Create(context.Background(), CreateRequest{
		Role:             "Engineer",
		MonthlySalaryLKR: 100000,
		WorkType:         &workType,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.createParams.WorkType == nil || *repo.createParams.WorkType != "Hybrid" {
		t.Fatalf("expected Hybrid work type, got %#v", repo.createParams.WorkType)
	}
}

func TestList_NormalizesLowercaseWorkTypeFilter(t *testing.T) {
	repo := &fakeRepo{}
	svc := newTestService(repo)

	_, err := svc.List(context.Background(), repository.FindFilter{WorkType: "remote"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.findFilter.WorkType != "Remote" {
		t.Fatalf("expected Remote work type filter, got %q", repo.findFilter.WorkType)
	}
}

func TestList_NormalizesOnSiteWorkTypeFilter(t *testing.T) {
	repo := &fakeRepo{}
	svc := newTestService(repo)

	_, err := svc.List(context.Background(), repository.FindFilter{WorkType: " on site "})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.findFilter.WorkType != "Onsite" {
		t.Fatalf("expected Onsite work type filter, got %q", repo.findFilter.WorkType)
	}
}

func TestCreate_Error(t *testing.T) {
	repo := &fakeRepo{err: errors.New("insert failed")}
	svc := newTestService(repo)
	_, err := svc.Create(context.Background(), CreateRequest{
		Role:             "Engineer",
		MonthlySalaryLKR: 100000,
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestReport_OK(t *testing.T) {
	repo := &fakeRepo{}
	svc := newTestService(repo)
	err := svc.Report(context.Background(), "123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReport_Error(t *testing.T) {
	repo := &fakeRepo{err: errors.New("report failed")}
	svc := newTestService(repo)
	err := svc.Report(context.Background(), "123")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestToResponse_Anonymized(t *testing.T) {
	company := "Acme"
	sub := repository.Submission{
		ID:           "1",
		Role:         "Eng",
		Company:      &company,
		Country:      "LK",
		Currency:     "LKR",
		SalaryAmount: 100000,
		IsAnonymized: true,
		Status:       "APPROVED",
		CreatedAt:    time.Now(),
	}
	resp := toResponse(sub)
	if resp.Company != nil {
		t.Errorf("expected nil company for anonymized submission")
	}
}

func TestToResponse_NotAnonymized(t *testing.T) {
	company := "Acme"
	sub := repository.Submission{
		ID:           "1",
		Role:         "Eng",
		Company:      &company,
		Country:      "LK",
		Currency:     "LKR",
		SalaryAmount: 100000,
		IsAnonymized: false,
		Status:       "APPROVED",
		CreatedAt:    time.Now(),
	}
	resp := toResponse(sub)
	if resp.Company == nil || *resp.Company != "Acme" {
		t.Errorf("expected company Acme, got %v", resp.Company)
	}
}

func TestTrimPtr(t *testing.T) {
	if trimPtr(nil) != nil {
		t.Error("expected nil for nil input")
	}
	s := "  "
	if trimPtr(&s) != nil {
		t.Error("expected nil for whitespace-only string")
	}
	s2 := "  hello  "
	got := trimPtr(&s2)
	if got == nil || *got != "hello" {
		t.Errorf("expected 'hello', got %v", got)
	}
}

func TestNormalizeWorkTypeKeepsUnknownTrimmedValue(t *testing.T) {
	if got := normalizeWorkType(" contract "); got != "contract" {
		t.Fatalf("expected trimmed custom work type, got %q", got)
	}
}

func TestNormalizeWorkTypePtrReturnsNilForNilAndBlank(t *testing.T) {
	if normalizeWorkTypePtr(nil) != nil {
		t.Fatal("expected nil pointer to stay nil")
	}

	blank := "   "
	if normalizeWorkTypePtr(&blank) != nil {
		t.Fatal("expected blank pointer to normalize to nil")
	}
}

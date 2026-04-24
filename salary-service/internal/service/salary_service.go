package service

import (
	"context"
	"strings"

	"github.com/watup-lk/salary-service/internal/kafka"
	"github.com/watup-lk/salary-service/internal/repository"
)

type SalaryService struct {
	repo  *repository.PostgresRepo
	kafka *kafka.Producer
}

func New(repo *repository.PostgresRepo, k *kafka.Producer) *SalaryService {
	return &SalaryService{repo: repo, kafka: k}
}

type SubmissionResponse struct {
	ID              string  `json:"id"`
	Role            string  `json:"role"`
	Company         *string `json:"company"`
	Country         string  `json:"country"`
	City            *string `json:"city"`
	MonthlySalaryLKR float64 `json:"monthly_salary_lkr"`
	Currency        string  `json:"currency"`
	YearsOfExperience *int  `json:"years_of_experience"`
	ExperienceLevel *string `json:"experience_level"`
	WorkType        *string `json:"work_type"`
	Anonymized      bool    `json:"anonymized"`
	Status          string  `json:"status"`
	CreatedAt       string  `json:"created_at"`
}

type CreateRequest struct {
	Role              string  `json:"role"`
	Company           *string `json:"company"`
	Country           string  `json:"country"`
	City              *string `json:"city"`
	MonthlySalaryLKR  float64 `json:"monthly_salary_lkr"`
	Currency          string  `json:"currency"`
	YearsOfExperience *int    `json:"years_of_experience"`
	ExperienceLevel   *string `json:"experience_level"`
	WorkType          *string `json:"work_type"`
	Anonymize         bool    `json:"anonymize"`
}

func (s *SalaryService) List(ctx context.Context, f repository.FindFilter) ([]SubmissionResponse, error) {
	subs, err := s.repo.FindApproved(ctx, f)
	if err != nil {
		return nil, err
	}
	out := make([]SubmissionResponse, 0, len(subs))
	for _, sub := range subs {
		out = append(out, toResponse(sub))
	}
	return out, nil
}

func (s *SalaryService) Create(ctx context.Context, req CreateRequest) (SubmissionResponse, error) {
	country := strings.ToUpper(strings.TrimSpace(req.Country))
	if country == "" {
		country = "LK"
	}
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "LKR"
	}

	p := repository.CreateParams{
		Role:            strings.TrimSpace(req.Role),
		Company:         trimPtr(req.Company),
		Country:         country,
		City:            trimPtr(req.City),
		SalaryAmount:    req.MonthlySalaryLKR,
		Currency:        currency,
		ExperienceYears: req.YearsOfExperience,
		ExperienceLevel: req.ExperienceLevel,
		WorkType:        req.WorkType,
		IsAnonymized:    req.Anonymize,
	}

	saved, err := s.repo.Create(ctx, p)
	if err != nil {
		return SubmissionResponse{}, err
	}

	go s.kafka.PublishSubmissionCreated(ctx, saved.ID)

	return toResponse(saved), nil
}

func toResponse(s repository.Submission) SubmissionResponse {
	company := s.Company
	if s.IsAnonymized {
		company = nil
	}
	return SubmissionResponse{
		ID:                s.ID,
		Role:              s.Role,
		Company:           company,
		Country:           s.Country,
		City:              s.City,
		MonthlySalaryLKR:  s.SalaryAmount,
		Currency:          s.Currency,
		YearsOfExperience: s.ExperienceYears,
		ExperienceLevel:   s.ExperienceLevel,
		WorkType:          s.WorkType,
		Anonymized:        s.IsAnonymized,
		Status:            s.Status,
		CreatedAt:         s.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

package service

import (
	"context"
	"errors"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/watup-lk/vote-service/internal/kafka"
	"github.com/watup-lk/vote-service/internal/repository"
)

type voteRepository interface {
	RecordVote(ctx context.Context, submissionID, userID, voteType string) (int, error)
	ApproveSubmission(ctx context.Context, submissionID string) error
	GetVoteCounts(ctx context.Context) ([]repository.VoteCount, error)
}

type thresholdPublisher interface {
	PublishThresholdReached(ctx context.Context, submissionID string) error
}

type VoteService struct {
	repo              voteRepository
	kafka             thresholdPublisher
	approvalThreshold int
}

func NewVoteService(repo *repository.PostgresRepo, k *kafka.Producer) *VoteService {
	// Load threshold from ConfigMap (Environment Variable)
	threshold, _ := strconv.Atoi(os.Getenv("APPROVAL_THRESHOLD"))
	if threshold == 0 {
		threshold = 5
	} // Default fallback

	return &VoteService{
		repo:              repo,
		kafka:             k,
		approvalThreshold: threshold,
	}
}

type RecordVoteResponse struct {
	Success          bool   `json:"success"`
	Message          string `json:"message"`
	ThresholdReached bool   `json:"threshold_reached"`
}

func (s *VoteService) RecordVote(ctx context.Context, submissionID, userID string, voteType string) (*RecordVoteResponse, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("missing user id")
	}

	dbVoteType := "UP"
	if strings.ToUpper(strings.TrimSpace(voteType)) == "DOWN" {
		dbVoteType = "DOWN"
	}
	currentUpvotes, err := s.repo.RecordVote(ctx, submissionID, userID, dbVoteType)
	if err != nil {
		return nil, err
	}

	thresholdReached, err := s.HandleThresholdReached(ctx, submissionID, currentUpvotes)
	if err != nil {
		return nil, err
	}

	return &RecordVoteResponse{
		Success:          true,
		Message:          "Vote recorded successfully",
		ThresholdReached: thresholdReached,
	}, nil
}

func (s *VoteService) HandleThresholdReached(ctx context.Context, submissionID string, currentUpvotes int) (bool, error) {
	thresholdReached := currentUpvotes >= s.approvalThreshold

	if thresholdReached {
		if err := s.repo.ApproveSubmission(ctx, submissionID); err != nil {
			return true, err
		}
		if s.kafka != nil {
			err := s.kafka.PublishThresholdReached(ctx, submissionID)
			if err != nil {
				log.Printf("Failed to publish threshold reached event: %v", err)
			}
		}
	}

	return thresholdReached, nil
}

func (s *VoteService) GetVoteCounts(ctx context.Context) ([]repository.VoteCount, error) {
	return s.repo.GetVoteCounts(ctx)
}

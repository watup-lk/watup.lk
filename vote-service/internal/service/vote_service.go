package service

import (
	"context"
	"log"
	"os"
	"strconv"

	"github.com/watup-lk/vote-service/internal/kafka"
	"github.com/watup-lk/vote-service/internal/repository"
)

type VoteService struct {
	repo *repository.PostgresRepo
	kafka *kafka.Producer
	approvalThreshold int
}

func NewVoteService(repo *repository.PostgresRepo, k *kafka.Producer) *VoteService {
	// Load threshold from ConfigMap (Environment Variable)
	threshold, _ := strconv.Atoi(os.Getenv("APPROVAL_THRESHOLD"))
	if threshold == 0 {
		threshold = 5
	} // Default fallback

	return &VoteService{
		repo: repo,
		kafka: k,
		approvalThreshold: threshold,
	}
}

type RecordVoteResponse struct {
	Success          bool   `json:"success"`
	Message          string `json:"message"`
	ThresholdReached bool   `json:"threshold_reached"`
}

func (s *VoteService) RecordVote(ctx context.Context, submissionID, userID string, voteType string) (*RecordVoteResponse, error) {
	dbVoteType := "UP"
	if voteType == "DOWN" {
		dbVoteType = "DOWN"
	}
	currentUpvotes, err := s.repo.RecordVote(ctx, submissionID, userID, dbVoteType)
	if err != nil {
		return nil, err
	}

	thresholdReached := s.HandleThresholdReached(ctx, submissionID, currentUpvotes)

	return &RecordVoteResponse{
		Success: true,
		Message: "Vote recorded successfully",
		ThresholdReached: thresholdReached,
	}, nil
}

func (s *VoteService) HandleThresholdReached(ctx context.Context, submissionID string, currentUpvotes int) bool {
	
	thresholdReached := currentUpvotes >= s.approvalThreshold

	if thresholdReached {
		err := s.kafka.PublishThresholdReached(ctx, submissionID)
		if err != nil {
			log.Printf("Failed to publish threshold reached event: %v", err)
		}
	}

	return thresholdReached
}

package service

import (
	"context"
	"log"
	"os"
	"strconv"

	v1 "github.com/watup-lk/vote-service/api/proto/v1"
	"github.com/watup-lk/vote-service/internal/kafka"
	"github.com/watup-lk/vote-service/internal/repository"
)

type VoteService struct {
	v1.UnimplementedVoteServiceServer
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

func (s *VoteService) RecordVote(ctx context.Context, req *v1.RecordVoteRequest) (*v1.RecordVoteResponse, error) {
	userID := ctx.Value("user_id").(string)
	return s.RecordVoteHTTP(ctx, req.SubmissionId, userID, req.VoteType)
}

// RecordVoteHTTP is called by both the gRPC handler and the HTTP handler.
func (s *VoteService) RecordVoteHTTP(ctx context.Context, submissionID, userID string, voteType v1.RecordVoteRequest_VoteType) (*v1.RecordVoteResponse, error) {
	dbVoteType := "UP"
	if voteType == v1.RecordVoteRequest_DOWNVOTE {
		dbVoteType = "DOWN"
	}
	currentUpvotes, err := s.repo.RecordVote(ctx, submissionID, userID, dbVoteType)
	if err != nil {
		return nil, err
	}

	thresholdReached := currentUpvotes >= s.approvalThreshold

	if thresholdReached {
		err := s.kafka.PublishThresholdReached(ctx, submissionID)
		if err != nil {
			log.Printf("Failed to publish threshold reached event: %v", err)
		}
	}

	return &v1.RecordVoteResponse{
		Success: true,
		Message: "Vote recorded successfully",
		ThresholdReached: thresholdReached,
	}, nil
}

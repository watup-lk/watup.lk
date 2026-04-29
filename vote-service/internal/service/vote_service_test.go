package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/watup-lk/vote-service/internal/repository"
)

type fakeVoteRepo struct {
	upvotes              int
	recordErr            error
	approveErr           error
	recordSubmissionID   string
	recordUserID         string
	recordVoteType       string
	approvedSubmissionID string
}

func (f *fakeVoteRepo) RecordVote(_ context.Context, submissionID, userID, voteType string) (int, error) {
	f.recordSubmissionID = submissionID
	f.recordUserID = userID
	f.recordVoteType = voteType
	return f.upvotes, f.recordErr
}

func (f *fakeVoteRepo) ApproveSubmission(_ context.Context, submissionID string) error {
	f.approvedSubmissionID = submissionID
	return f.approveErr
}

func (f *fakeVoteRepo) GetVoteCounts(_ context.Context) ([]repository.VoteCount, error) {
	return []repository.VoteCount{}, nil
}

type fakeThresholdPublisher struct {
	err                 error
	publishedSubmission string
}

func (f *fakeThresholdPublisher) PublishThresholdReached(_ context.Context, submissionID string) error {
	f.publishedSubmission = submissionID
	return f.err
}

func TestNewVoteServiceUsesConfiguredThreshold(t *testing.T) {
	t.Setenv("APPROVAL_THRESHOLD", "3")

	svc := NewVoteService(nil, nil)

	if svc.approvalThreshold != 3 {
		t.Fatalf("expected threshold 3, got %d", svc.approvalThreshold)
	}
}

func TestNewVoteServiceDefaultsThreshold(t *testing.T) {
	unsetEnv(t, "APPROVAL_THRESHOLD")

	svc := NewVoteService(nil, nil)

	if svc.approvalThreshold != 5 {
		t.Fatalf("expected default threshold 5, got %d", svc.approvalThreshold)
	}
}

func TestRecordVoteRequiresAuthenticatedUserID(t *testing.T) {
	svc := &VoteService{repo: &fakeVoteRepo{}, approvalThreshold: 5}

	_, err := svc.RecordVote(context.Background(), "sub-1", "", "UP")

	if err == nil {
		t.Fatal("expected missing user id error")
	}
}

func TestRecordVoteUsesUserIDFromContext(t *testing.T) {
	repo := &fakeVoteRepo{upvotes: 1}
	svc := &VoteService{repo: repo, approvalThreshold: 5}

	resp, err := svc.RecordVote(context.Background(), "sub-1", "user-1", "UP")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success || resp.ThresholdReached {
		t.Fatalf("unexpected response: %#v", resp)
	}
	if repo.recordSubmissionID != "sub-1" || repo.recordUserID != "user-1" || repo.recordVoteType != "UP" {
		t.Fatalf("unexpected recorded vote: %#v", repo)
	}
}

func TestRecordVoteRecordsDownvoteWithoutApproval(t *testing.T) {
	repo := &fakeVoteRepo{upvotes: 4}
	publisher := &fakeThresholdPublisher{}
	svc := &VoteService{repo: repo, kafka: publisher, approvalThreshold: 5}

	resp, err := svc.RecordVote(
		context.Background(),
		"sub-1",
		"user-1",
		"DOWN",
	)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ThresholdReached {
		t.Fatal("threshold should not be reached")
	}
	if repo.recordVoteType != "DOWN" {
		t.Fatalf("expected DOWN vote, got %q", repo.recordVoteType)
	}
	if repo.approvedSubmissionID != "" {
		t.Fatalf("approval should not run, got %q", repo.approvedSubmissionID)
	}
	if publisher.publishedSubmission != "" {
		t.Fatalf("publish should not run, got %q", publisher.publishedSubmission)
	}
}

func TestRecordVoteApprovesAndPublishesWhenThresholdReached(t *testing.T) {
	repo := &fakeVoteRepo{upvotes: 5}
	publisher := &fakeThresholdPublisher{}
	svc := &VoteService{repo: repo, kafka: publisher, approvalThreshold: 5}

	resp, err := svc.RecordVote(
		context.Background(),
		"sub-1",
		"user-1",
		"UP",
	)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.ThresholdReached {
		t.Fatal("expected threshold reached")
	}
	if repo.approvedSubmissionID != "sub-1" {
		t.Fatalf("expected approval for sub-1, got %q", repo.approvedSubmissionID)
	}
	if publisher.publishedSubmission != "sub-1" {
		t.Fatalf("expected threshold event for sub-1, got %q", publisher.publishedSubmission)
	}
}

func TestRecordVoteReturnsRecordError(t *testing.T) {
	svc := &VoteService{
		repo:              &fakeVoteRepo{recordErr: errors.New("record failed")},
		approvalThreshold: 5,
	}

	if _, err := svc.RecordVote(context.Background(), "sub-1", "user-1", "UP"); err == nil {
		t.Fatal("expected record error")
	}
}

func TestRecordVoteReturnsApprovalError(t *testing.T) {
	svc := &VoteService{
		repo:              &fakeVoteRepo{upvotes: 5, approveErr: errors.New("approval failed")},
		kafka:             &fakeThresholdPublisher{},
		approvalThreshold: 5,
	}

	if _, err := svc.RecordVote(context.Background(), "sub-1", "user-1", "UP"); err == nil {
		t.Fatal("expected approval error")
	}
}

func TestRecordVoteIgnoresPublishErrorAfterApproval(t *testing.T) {
	repo := &fakeVoteRepo{upvotes: 5}
	svc := &VoteService{
		repo:              repo,
		kafka:             &fakeThresholdPublisher{err: errors.New("publish failed")},
		approvalThreshold: 5,
	}

	resp, err := svc.RecordVote(context.Background(), "sub-1", "user-1", "UP")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.ThresholdReached || repo.approvedSubmissionID != "sub-1" {
		t.Fatalf("expected approval despite publish failure, resp=%#v repo=%#v", resp, repo)
	}
}

func unsetEnv(t *testing.T, keys ...string) {
	t.Helper()

	previous := make(map[string]*string, len(keys))
	for _, key := range keys {
		if value, ok := os.LookupEnv(key); ok {
			copyValue := value
			previous[key] = &copyValue
		}
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
	}

	t.Cleanup(func() {
		for _, key := range keys {
			if value, ok := previous[key]; ok {
				_ = os.Setenv(key, *value)
			} else {
				_ = os.Unsetenv(key)
			}
		}
	})
}

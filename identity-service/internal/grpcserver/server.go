package grpcserver

import (
	"context"
	"log"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "github.com/watup-lk/identity-service/api/proto/v1"
	"github.com/watup-lk/identity-service/internal/repository"
	"github.com/watup-lk/identity-service/internal/service"
)

// IdentityServer implements the gRPC IdentityService for internal service-to-service calls.
// Other microservices (e.g., vote-service) call ValidateToken to authenticate users
// without going through the BFF, reducing network hops inside the cluster.
type IdentityServer struct {
	pb.UnimplementedIdentityServiceServer
	svc *service.IdentityService
}

func NewIdentityServer(svc *service.IdentityService) *IdentityServer {
	return &IdentityServer{svc: svc}
}

// ValidateToken checks an access token JWT and returns the embedded user_id.
func (s *IdentityServer) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	if req.Token == "" {
		return &pb.ValidateTokenResponse{Valid: false, Error: "token is required"}, nil
	}

	userID, err := s.svc.ValidateAccessToken(ctx, req.Token)
	if err != nil {
		log.Printf("[grpc] ValidateToken: invalid token: %v", err)
		return &pb.ValidateTokenResponse{
			Valid:  false,
			Error:  "invalid or expired token",
		}, nil
	}

	return &pb.ValidateTokenResponse{
		Valid:  true,
		UserId: userID,
	}, nil
}

// GetUser returns basic user metadata given a user_id.
// Email is never exposed — only user_id, is_active, and created_at.
func (s *IdentityServer) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.GetUserResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	user, err := s.svc.GetUserByID(ctx, req.UserId)
	if err != nil {
		if err == repository.ErrNotFound {
			return nil, status.Error(codes.NotFound, "user not found")
		}
		return nil, status.Error(codes.Internal, "failed to fetch user")
	}

	return &pb.GetUserResponse{
		UserId:    user.ID,
		IsActive:  user.IsActive,
		CreatedAt: user.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}

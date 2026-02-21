package main

import (
	"database/sql"
	"log"
	"net"
	"google.golang.org/grpc"

	v1 "github.com/padi-lk/vote-service/api/proto/v1"
	"github.com/padi-lk/vote-service/internal/config"
	"github.com/padi-lk/vote-service/internal/kafka"
	"github.com/padi-lk/vote-service/internal/repository"
	"github.com/padi-lk/vote-service/internal/service"
)

func main() {
	cfg := config.Load()

	// 1. Initialize Postgres
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to postgres: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Postgres ping failed: %v", err)
	}

	repo := repository.NewPostgresRepo(db)

	// 2. Initialize Kafka Producer
	producer := kafka.NewProducer(cfg.KafkaBrokers, "threshold-reached")
	defer producer.Close()

	// 3. Initialize gRPC Server
	lis, err := net.Listen("tcp", ":"+cfg.Port)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	voteSvc := service.NewVoteService(repo, producer)

	v1.RegisterVoteServiceServer(s, voteSvc)

	log.Printf("Vote Service running on port %s", cfg.Port)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}

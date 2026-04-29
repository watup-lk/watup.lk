package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	_ "github.com/lib/pq"

	"github.com/watup-lk/vote-service/internal/config"
	"github.com/watup-lk/vote-service/internal/kafka"
	"github.com/watup-lk/vote-service/internal/repository"
	"github.com/watup-lk/vote-service/internal/service"
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

	voteSvc := service.NewVoteService(repo, producer)

	// 3. HTTP server for BFF integration
	mux := http.NewServeMux()

	mux.HandleFunc("/vote/counts", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		counts, err := voteSvc.GetVoteCounts(r.Context())
		if err != nil {
			log.Printf("GetVoteCounts error: %v", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"results": counts,
		})
	})

	mux.HandleFunc("/vote/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract submission ID from path: /vote/{id}
		submissionID := strings.TrimPrefix(r.URL.Path, "/vote/")
		if submissionID == "" {
			http.Error(w, "missing submission id", http.StatusBadRequest)
			return
		}

		var body struct {
			Type   string `json:"type"`
			UserID string `json:"user_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}

		voteType := "UP"
		if strings.ToLower(body.Type) == "down" {
			voteType = "DOWN"
		}

		ctx := r.Context()
		resp, err := voteSvc.RecordVote(ctx, submissionID, body.UserID, voteType)
		if err != nil {
			log.Printf("RecordVote error: %v", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	log.Printf("Vote HTTP server running on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}

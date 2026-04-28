package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/lib/pq"

	"github.com/watup-lk/search-service/internal/config"
	"github.com/watup-lk/search-service/internal/handlers"
	"github.com/watup-lk/search-service/internal/kafka"
	"github.com/watup-lk/search-service/internal/repository"
)

func main() {
	cfg := config.Load()

	if cfg.DatabaseURL == "" {
		log.Fatal("[startup] DATABASE_URL is required")
	}

	hasValidBroker := false
	for _, b := range cfg.KafkaBrokers {
		if strings.TrimSpace(b) != "" {
			hasValidBroker = true
			break
		}
	}
	if !hasValidBroker {
		log.Fatal("[startup] KAFKA_BROKERS must contain at least one broker address")
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[startup] failed to open database: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("[startup] database ping failed: %v", err)
	}
	log.Println("[startup] connected to PostgreSQL")

	consumer := kafka.NewConsumer(cfg.KafkaBrokers)

	repo := repository.NewPostgresRepo(db)
	searchH := handlers.NewSearchHandler(repo)
	healthH := handlers.NewHealthHandler(repo)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /search", searchH.Search)
	mux.HandleFunc("GET /health/live", healthH.Liveness)
	mux.HandleFunc("GET /health/ready", healthH.Readiness)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go consumer.Run(ctx)

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		log.Printf("[shutdown] received %v — shutting down", sig)
		cancel()
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutCancel()
		if err := srv.Shutdown(shutCtx); err != nil {
			log.Printf("[shutdown] error: %v", err)
		}
	}()

	log.Printf("[startup] search-service listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("[http] server error: %v", err)
	}

	<-ctx.Done()
	log.Println("[shutdown] search-service stopped")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		next.ServeHTTP(w, r)
	})
}
